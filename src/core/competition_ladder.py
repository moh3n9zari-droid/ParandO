"""Parando Competition Ladder (ADR-001, TR-01, TR-12, TR-13).

Maintains top-K ranked offers of one competition.
Pure, I/O-free. Deterministic ordering.

TR-01: Renamed from Auction/Bid to Competition/Offer.
TR-13: Tie-breaking logic: When amounts are equal, ranking is determined
       strictly by Offer Sequence Number (lower sequence wins), not timestamp.
TR-12: Idempotent replay on identical payload, conflict error on payload mismatch.

Ordering (rank 1 is best):
  1. amount            higher wins
  2. sequence          lower wins (TR-13 Offer Sequence Number tie-breaker)

Each offerer holds at most one ladder position (their best offer).
Amounts are integer Rial.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple


class LadderOfferStatus(str, Enum):
    RANKED = "RANKED"
    OUTBID = "OUTBID"            # fell out of the top K
    SUPERSEDED = "SUPERSEDED"    # replaced by a higher offer of the same offerer
    REJECTED = "REJECTED"        # never entered the ladder


# Backwards compatibility alias
LadderBidStatus = LadderOfferStatus


class LadderError(ValueError):
    def __init__(self, code: str, message: str = ""):
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code


class IdempotencyConflict(LadderError):
    def __init__(self, message: str = "idempotency key payload mismatch"):
        super().__init__("IDEMPOTENCY_CONFLICT", message)


@dataclass(frozen=True)
class LadderOffer:
    offer_id: str
    offerer_id: str
    amount: int
    sequence: int = 0
    timestamp: int = 0

    @property
    def bid_id(self) -> str:
        return self.offer_id

    @property
    def bidder_id(self) -> str:
        return self.offerer_id


# Alias
LadderBid = LadderOffer


@dataclass(frozen=True)
class LadderEntry:
    rank: int
    offer: LadderOffer

    @property
    def bid(self) -> LadderOffer:
        return self.offer


@dataclass(frozen=True)
class StatusTransition:
    offer_id: str
    offerer_id: str
    new_status: LadderOfferStatus
    previous_rank: Optional[int]
    reason: str

    @property
    def bid_id(self) -> str:
        return self.offer_id

    @property
    def bidder_id(self) -> str:
        return self.offerer_id


@dataclass(frozen=True)
class RankChange:
    offer_id: str
    offerer_id: str
    old_rank: Optional[int]
    new_rank: int

    @property
    def bid_id(self) -> str:
        return self.offer_id

    @property
    def bidder_id(self) -> str:
        return self.offerer_id


@dataclass(frozen=True)
class LadderResult:
    accepted: bool
    status: LadderOfferStatus
    rank: Optional[int]
    reason: str
    transitions: Tuple[StatusTransition, ...] = ()
    rank_changes: Tuple[RankChange, ...] = ()
    duplicate: bool = False


def _sort_key(offer: LadderOffer):
    # TR-13: On equal amount, ranking is strictly by Offer Sequence Number
    return (-offer.amount, offer.sequence)


class CompetitionLadder:
    def __init__(self, k: int):
        if not isinstance(k, int) or isinstance(k, bool) or k < 1:
            raise LadderError("INVALID_K", "k must be an integer >= 1")
        self._k = k
        self._lock = threading.RLock()
        self._seq = 0
        self._items: List[LadderOffer] = []  # sorted, len <= k
        self._status: Dict[str, LadderOfferStatus] = {}
        self._results: Dict[str, LadderResult] = {}
        self._payloads: Dict[str, Tuple[str, int]] = {}  # offer_id -> (offerer_id, amount)

    @property
    def k(self) -> int:
        return self._k

    # ---- queries -------------------------------------------------------
    def snapshot(self) -> List[LadderEntry]:
        with self._lock:
            return [LadderEntry(i + 1, o) for i, o in enumerate(self._items)]

    def rank_of(self, offer_id: str) -> Optional[int]:
        with self._lock:
            for i, o in enumerate(self._items):
                if o.offer_id == offer_id:
                    return i + 1
            return None

    def status_of(self, offer_id: str) -> Optional[LadderOfferStatus]:
        with self._lock:
            return self._status.get(offer_id)

    def leader(self) -> Optional[LadderOffer]:
        with self._lock:
            return self._items[0] if self._items else None

    def threshold(self) -> Optional[int]:
        """Amount of rank K when the ladder is full, else None."""
        with self._lock:
            if len(self._items) < self._k:
                return None
            return self._items[-1].amount

    # ---- mutation ------------------------------------------------------
    def place(self, offer: LadderOffer) -> LadderResult:
        self._validate(offer)
        with self._lock:
            prior = self._results.get(offer.offer_id)
            if prior is not None:
                # TR-12: Check identical payload
                recorded = self._payloads.get(offer.offer_id)
                current_payload = (offer.offerer_id, offer.amount)
                if recorded != current_payload:
                    raise IdempotencyConflict(
                        f"offer {offer.offer_id} payload mismatch with previous submission"
                    )
                return LadderResult(
                    prior.accepted, self._status[offer.offer_id],
                    self.rank_of(offer.offer_id), prior.reason, duplicate=True,
                )

            # Auto-assign sequence if 0
            if offer.sequence == 0:
                self._seq += 1
                offer = LadderOffer(
                    offer_id=offer.offer_id,
                    offerer_id=offer.offerer_id,
                    amount=offer.amount,
                    sequence=self._seq,
                    timestamp=offer.timestamp,
                )

            old_ranks = {o.offer_id: i + 1 for i, o in enumerate(self._items)}
            transitions: List[StatusTransition] = []

            existing = next(
                (o for o in self._items if o.offerer_id == offer.offerer_id), None
            )
            if existing is not None:
                if offer.amount <= existing.amount:
                    return self._reject(
                        offer, "NOT_HIGHER_THAN_OWN_BID",
                        "offerer already holds an equal or higher offer",
                    )
                self._items.remove(existing)
                self._status[existing.offer_id] = LadderOfferStatus.SUPERSEDED
                transitions.append(StatusTransition(
                    existing.offer_id, existing.offerer_id, LadderOfferStatus.SUPERSEDED,
                    old_ranks[existing.offer_id], "REPLACED_BY_OWN_HIGHER_BID",
                ))

            if len(self._items) >= self._k:
                worst = self._items[-1]
                if _sort_key(offer) >= _sort_key(worst):
                    if existing is not None:
                        # restore
                        return self._restore_and_reject(existing, offer)
                    return self._reject(
                        offer, "BELOW_LADDER", "does not rank within the top K"
                    )

            self._items.append(offer)
            self._items.sort(key=_sort_key)
            if len(self._items) > self._k:
                dropped = self._items.pop()
                self._status[dropped.offer_id] = LadderOfferStatus.OUTBID
                transitions.append(StatusTransition(
                    dropped.offer_id, dropped.offerer_id, LadderOfferStatus.OUTBID,
                    old_ranks.get(dropped.offer_id), "FELL_OUT_OF_TOP_K",
                ))

            self._status[offer.offer_id] = LadderOfferStatus.RANKED
            self._payloads[offer.offer_id] = (offer.offerer_id, offer.amount)
            new_ranks = {o.offer_id: i + 1 for i, o in enumerate(self._items)}
            changes = tuple(
                RankChange(o.offer_id, o.offerer_id, old_ranks.get(o.offer_id), new_ranks[o.offer_id])
                for o in self._items
                if old_ranks.get(o.offer_id) != new_ranks[o.offer_id]
            )
            result = LadderResult(
                True, LadderOfferStatus.RANKED, new_ranks[offer.offer_id], "ACCEPTED",
                tuple(transitions), changes,
            )
            self._results[offer.offer_id] = result
            return result

    # ---- internals -----------------------------------------------------
    @staticmethod
    def _validate(offer: LadderOffer) -> None:
        if not offer.offer_id or not offer.offerer_id:
            raise LadderError("INVALID_BID", "offer_id and offerer_id are required")
        if isinstance(offer.amount, bool) or not isinstance(offer.amount, int) or offer.amount <= 0:
            raise LadderError("INVALID_AMOUNT", "amount must be a positive integer")
        if isinstance(offer.timestamp, bool) or not isinstance(offer.timestamp, int) or offer.timestamp < 0:
            raise LadderError("INVALID_TIMESTAMP", "timestamp must be a non-negative integer")

    def _reject(self, offer: LadderOffer, code: str, _msg: str) -> LadderResult:
        self._status[offer.offer_id] = LadderOfferStatus.REJECTED
        self._payloads[offer.offer_id] = (offer.offerer_id, offer.amount)
        res = LadderResult(False, LadderOfferStatus.REJECTED, None, code)
        self._results[offer.offer_id] = res
        return res

    def _restore_and_reject(self, existing: LadderOffer, offer: LadderOffer) -> LadderResult:
        self._items.append(existing)
        self._items.sort(key=_sort_key)
        self._status[existing.offer_id] = LadderOfferStatus.RANKED
        return self._reject(offer, "BELOW_LADDER", "does not rank within the top K")


# Alias for backward compatibility
AuctionLadder = CompetitionLadder
