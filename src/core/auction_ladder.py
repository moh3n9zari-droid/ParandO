"""Auction Ladder: maintains the top-K ranked bids of one auction.

Pure, I/O-free. Deterministic ordering and a per-instance lock make it safe
to call from multiple threads. Persistence/locking across processes is the
responsibility of the application layer.

Ordering (rank 1 is best):
  1. amount            higher wins
  2. timestamp         earlier wins (tie-breaker)
  3. sequence          lower wins (final deterministic tie-breaker)

Each bidder holds at most one ladder position (their best bid).
Amounts are integer Rial.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple


class LadderBidStatus(str, Enum):
    RANKED = "RANKED"
    OUTBID = "OUTBID"            # fell out of the top K
    SUPERSEDED = "SUPERSEDED"    # replaced by a higher bid of the same bidder
    REJECTED = "REJECTED"        # never entered the ladder


class LadderError(ValueError):
    def __init__(self, code: str, message: str = ""):
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code


@dataclass(frozen=True)
class LadderBid:
    bid_id: str
    bidder_id: str
    amount: int
    timestamp: int  # monotonic/epoch units chosen by the caller (e.g. ns)


@dataclass(frozen=True)
class LadderEntry:
    rank: int
    bid: LadderBid


@dataclass(frozen=True)
class StatusTransition:
    bid_id: str
    bidder_id: str
    new_status: LadderBidStatus
    previous_rank: Optional[int]
    reason: str


@dataclass(frozen=True)
class RankChange:
    bid_id: str
    bidder_id: str
    old_rank: Optional[int]
    new_rank: int


@dataclass(frozen=True)
class LadderResult:
    accepted: bool
    status: LadderBidStatus
    rank: Optional[int]
    reason: str
    transitions: Tuple[StatusTransition, ...] = ()
    rank_changes: Tuple[RankChange, ...] = ()
    duplicate: bool = False


def _sort_key(item: Tuple[int, LadderBid]):
    seq, bid = item
    return (-bid.amount, bid.timestamp, seq)


class AuctionLadder:
    def __init__(self, k: int):
        if not isinstance(k, int) or isinstance(k, bool) or k < 1:
            raise LadderError("INVALID_K", "k must be an integer >= 1")
        self._k = k
        self._lock = threading.RLock()
        self._seq = 0
        self._items: List[Tuple[int, LadderBid]] = []  # sorted, len <= k
        self._status: Dict[str, LadderBidStatus] = {}
        self._results: Dict[str, LadderResult] = {}

    @property
    def k(self) -> int:
        return self._k

    # ---- queries -------------------------------------------------------
    def snapshot(self) -> List[LadderEntry]:
        with self._lock:
            return [LadderEntry(i + 1, b) for i, (_, b) in enumerate(self._items)]

    def rank_of(self, bid_id: str) -> Optional[int]:
        with self._lock:
            for i, (_, b) in enumerate(self._items):
                if b.bid_id == bid_id:
                    return i + 1
            return None

    def status_of(self, bid_id: str) -> Optional[LadderBidStatus]:
        with self._lock:
            return self._status.get(bid_id)

    def leader(self) -> Optional[LadderBid]:
        with self._lock:
            return self._items[0][1] if self._items else None

    def threshold(self) -> Optional[int]:
        """Amount of rank K when the ladder is full, else None."""
        with self._lock:
            if len(self._items) < self._k:
                return None
            return self._items[-1][1].amount

    # ---- mutation ------------------------------------------------------
    def place(self, bid: LadderBid) -> LadderResult:
        self._validate(bid)
        with self._lock:
            prior = self._results.get(bid.bid_id)
            if prior is not None:  # idempotent replay
                return LadderResult(
                    prior.accepted, self._status[bid.bid_id],
                    self.rank_of(bid.bid_id), prior.reason, duplicate=True,
                )

            old_ranks = {b.bid_id: i + 1 for i, (_, b) in enumerate(self._items)}
            transitions: List[StatusTransition] = []

            existing = next(
                ((s, b) for s, b in self._items if b.bidder_id == bid.bidder_id), None
            )
            if existing is not None:
                _, ex_bid = existing
                if bid.amount <= ex_bid.amount:
                    return self._reject(
                        bid, "NOT_HIGHER_THAN_OWN_BID",
                        "bidder already holds an equal or higher bid",
                    )
                self._items.remove(existing)
                self._status[ex_bid.bid_id] = LadderBidStatus.SUPERSEDED
                transitions.append(StatusTransition(
                    ex_bid.bid_id, ex_bid.bidder_id, LadderBidStatus.SUPERSEDED,
                    old_ranks[ex_bid.bid_id], "REPLACED_BY_OWN_HIGHER_BID",
                ))

            self._seq += 1
            candidate = (self._seq, bid)
            if len(self._items) >= self._k:
                worst = self._items[-1]
                if _sort_key(candidate) >= _sort_key(worst):
                    if existing is not None:
                        # restore: the superseded bid must not be lost
                        return self._restore_and_reject(existing, old_ranks, bid)
                    return self._reject(
                        bid, "BELOW_LADDER", "does not rank within the top K"
                    )

            self._items.append(candidate)
            self._items.sort(key=_sort_key)
            if len(self._items) > self._k:
                _, dropped = self._items.pop()
                self._status[dropped.bid_id] = LadderBidStatus.OUTBID
                transitions.append(StatusTransition(
                    dropped.bid_id, dropped.bidder_id, LadderBidStatus.OUTBID,
                    old_ranks.get(dropped.bid_id), "FELL_OUT_OF_TOP_K",
                ))

            self._status[bid.bid_id] = LadderBidStatus.RANKED
            new_ranks = {b.bid_id: i + 1 for i, (_, b) in enumerate(self._items)}
            changes = tuple(
                RankChange(b.bid_id, b.bidder_id, old_ranks.get(b.bid_id), new_ranks[b.bid_id])
                for _, b in self._items
                if old_ranks.get(b.bid_id) != new_ranks[b.bid_id]
            )
            result = LadderResult(
                True, LadderBidStatus.RANKED, new_ranks[bid.bid_id], "ACCEPTED",
                tuple(transitions), changes,
            )
            self._results[bid.bid_id] = result
            return result

    # ---- internals -----------------------------------------------------
    @staticmethod
    def _validate(bid: LadderBid) -> None:
        if not bid.bid_id or not bid.bidder_id:
            raise LadderError("INVALID_BID", "bid_id and bidder_id are required")
        if isinstance(bid.amount, bool) or not isinstance(bid.amount, int) or bid.amount <= 0:
            raise LadderError("INVALID_AMOUNT", "amount must be a positive integer")
        if isinstance(bid.timestamp, bool) or not isinstance(bid.timestamp, int) or bid.timestamp < 0:
            raise LadderError("INVALID_TIMESTAMP", "timestamp must be a non-negative integer")

    def _reject(self, bid: LadderBid, code: str, _msg: str) -> LadderResult:
        self._status[bid.bid_id] = LadderBidStatus.REJECTED
        res = LadderResult(False, LadderBidStatus.REJECTED, None, code)
        self._results[bid.bid_id] = res
        return res

    def _restore_and_reject(self, existing, old_ranks, bid: LadderBid) -> LadderResult:
        self._items.append(existing)
        self._items.sort(key=_sort_key)
        self._status[existing[1].bid_id] = LadderBidStatus.RANKED
        return self._reject(bid, "BELOW_LADDER", "does not rank within the top K")
