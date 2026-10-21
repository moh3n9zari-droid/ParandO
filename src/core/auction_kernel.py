"""Parando Auction Kernel (ADR-001) - pure domain logic.

Design rules:
- No I/O, no framework, no database, no Redis, no payment provider imports.
- The kernel never writes ledger entries or holds (K-INV-14). It only asks a
  CommitmentGuard (port) for a proof of guaranteed funds (ADR-002 contract).
- Exposure must never exceed the guaranteed amount (K-INV-7).
- Money is an integer in the smallest unit (Rial). Floats are forbidden.
- Time is injected through a Clock port, so the kernel is deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional, Protocol, Tuple

from src.core.auction_ladder import (
    AuctionLadder,
    LadderBid,
    LadderBidStatus,
    RankChange,
    StatusTransition,
)


# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------

class AuctionError(Exception):
    """Base class for all domain errors. Each carries a stable code."""

    code = "AUCTION_ERROR"

    def __init__(self, message: str = "") -> None:
        super().__init__(message or self.code)


class AuctionNotActive(AuctionError):
    code = "AUCTION_NOT_ACTIVE"


class AuctionNotStarted(AuctionError):
    code = "AUCTION_NOT_STARTED"


class AuctionEnded(AuctionError):
    code = "AUCTION_ENDED"


class InvalidAmount(AuctionError):
    code = "INVALID_AMOUNT"


class BidBelowMinimum(AuctionError):
    code = "BID_BELOW_MINIMUM"


class BidIncrementTooSmall(AuctionError):
    code = "BID_INCREMENT_TOO_SMALL"


class SellerCannotBid(AuctionError):
    code = "SELLER_CANNOT_BID"


class BidderNotEligible(AuctionError):
    code = "BIDDER_NOT_ELIGIBLE"


class InsufficientCommitment(AuctionError):
    code = "INSUFFICIENT_COMMITMENT"


class DuplicateBid(AuctionError):
    code = "DUPLICATE_BID"


class StaleAuctionVersion(AuctionError):
    code = "STALE_AUCTION_VERSION"


# --------------------------------------------------------------------------
# Domain model
# --------------------------------------------------------------------------

class AuctionStatus(str, Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


@dataclass(frozen=True)
class Bidder:
    bidder_id: str
    tenant_id: str
    is_eligible: bool = True  # outcome of identity/compliance, decided elsewhere


@dataclass(frozen=True)
class Bid:
    bid_id: str
    auction_id: str
    bidder_id: str
    amount: int
    placed_at: datetime
    sequence: int  # strictly increasing per auction (Ladder order)
    idempotency_key: str


@dataclass(frozen=True)
class AuctionRules:
    """Pricing and exposure rules of one auction. Market specifics are
    injected here and never hard-coded in the kernel (Legal Policy Engine)."""

    base_price: int  # base price (starting price), in Rial
    min_increment: int  # minimum step above the current highest bid
    deposit_rate_bps: int = 1500  # 15% of base price (ADR-001, Q5), basis points

    def __post_init__(self) -> None:
        if self.base_price <= 0:
            raise InvalidAmount("base_price must be positive")
        if self.min_increment <= 0:
            raise InvalidAmount("min_increment must be positive")
        if not 0 <= self.deposit_rate_bps <= 10_000:
            raise InvalidAmount("deposit_rate_bps must be within 0..10000")

    @property
    def required_exposure(self) -> int:
        """ExposureRequirement: 15% of the base price, rounded up."""
        return -(-self.base_price * self.deposit_rate_bps // 10_000)


@dataclass(frozen=True)
class Auction:
    auction_id: str
    tenant_id: str
    seller_id: str
    rules: AuctionRules
    starts_at: datetime
    ends_at: datetime
    status: AuctionStatus = AuctionStatus.SCHEDULED
    version: int = 0  # optimistic concurrency token
    highest_bid: Optional[Bid] = None
    bid_count: int = 0
    ladder_size: int = 1  # K: number of ranked positions kept (ADR-001 Ladder)
    ladder: Tuple[Bid, ...] = ()  # current top-K bids, rank 1 first

    def __post_init__(self) -> None:
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("auction times must be timezone-aware")
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if self.ladder_size < 1:
            raise ValueError("ladder_size must be >= 1")

    def minimum_next_bid(self) -> int:
        """Smallest amount a new bid may have right now."""
        if self.highest_bid is None:
            return self.rules.base_price
        return self.highest_bid.amount + self.rules.min_increment

    def accept(self, bid: Bid, ladder: Optional[Tuple[Bid, ...]] = None) -> "Auction":
        """Return a new Auction state including the bid (immutable).

        `ladder` is the new top-K tuple (rank 1 first); when omitted the
        bid becomes the only ladder entry.
        """
        new_ladder = ladder if ladder is not None else (bid,)
        return replace(
            self,
            highest_bid=new_ladder[0] if new_ladder else bid,
            ladder=new_ladder,
            bid_count=self.bid_count + 1,
            version=self.version + 1,
        )


# --------------------------------------------------------------------------
# Ports (implemented outside the kernel)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class CommitmentProof:
    """Proof of guaranteed funds, produced by the Financial Kernel."""

    bidder_id: str
    tenant_id: str
    guaranteed_amount: int  # only provider-confirmed amount counts
    valid_until: datetime


class CommitmentGuard(Protocol):
    """Deposit / pre-authorization hook.

    Must be a fast, non-blocking read of an already published proof (no
    synchronous Finance call in the hot path). Returns None if no proof.
    """

    def get_proof(self, bidder_id: str, tenant_id: str) -> Optional[CommitmentProof]:
        ...


class Clock(Protocol):
    def now(self) -> datetime:
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# SubmitBid use case
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class SubmitBidCommand:
    auction_id: str
    bidder: Bidder
    amount: int
    bid_id: str
    idempotency_key: str
    expected_version: Optional[int] = None  # optional optimistic lock


@dataclass(frozen=True)
class SubmitBidResult:
    auction: Auction
    bid: Bid
    required_exposure: int
    guaranteed_amount: int
    rank: int = 1
    transitions: Tuple[StatusTransition, ...] = ()  # OUTBID / SUPERSEDED bids
    rank_changes: Tuple[RankChange, ...] = ()


def submit_bid(
    auction: Auction,
    command: SubmitBidCommand,
    guard: CommitmentGuard,
    clock: Clock,
    seen_idempotency_keys: frozenset = frozenset(),
) -> SubmitBidResult:
    """Validate and accept a bid. Pure function: returns the new state.

    Persistence, locking and event publishing belong to the caller
    (application layer). Raises an AuctionError subclass on rejection.
    """
    now = clock.now()

    # 0. Idempotency and concurrency
    if command.idempotency_key in seen_idempotency_keys:
        raise DuplicateBid(command.idempotency_key)
    if command.auction_id != auction.auction_id:
        raise AuctionNotActive("auction id mismatch")
    if command.expected_version is not None and command.expected_version != auction.version:
        raise StaleAuctionVersion(
            f"expected {command.expected_version}, actual {auction.version}"
        )

    # 1. Auction must be active and inside its time window
    if auction.status is not AuctionStatus.ACTIVE:
        raise AuctionNotActive(f"status is {auction.status.value}")
    if now < auction.starts_at:
        raise AuctionNotStarted()
    if now >= auction.ends_at:
        raise AuctionEnded()

    # 2. Bidder rules (tenant isolation, eligibility, seller conflict)
    bidder = command.bidder
    if bidder.tenant_id != auction.tenant_id:
        raise BidderNotEligible("tenant mismatch")
    if not bidder.is_eligible:
        raise BidderNotEligible()
    if bidder.bidder_id == auction.seller_id:
        raise SellerCannotBid()

    # 3. Amount validation: minimum price and incremental step
    if not isinstance(command.amount, int) or isinstance(command.amount, bool):
        raise InvalidAmount("amount must be an integer (Rial)")
    if command.amount <= 0:
        raise InvalidAmount("amount must be positive")
    if auction.highest_bid is None:
        if command.amount < auction.rules.base_price:
            raise BidBelowMinimum(
                f"minimum is {auction.rules.base_price}, got {command.amount}"
            )
    else:
        minimum = auction.minimum_next_bid()
        if command.amount < minimum:
            raise BidIncrementTooSmall(
                f"minimum next bid is {minimum}, got {command.amount}"
            )

    # 4. Financial pre-authorization hook (K-INV-7: exposure <= guaranteed)
    required = auction.rules.required_exposure
    proof = guard.get_proof(bidder.bidder_id, bidder.tenant_id)
    if proof is None:
        raise InsufficientCommitment("no commitment proof")
    if proof.bidder_id != bidder.bidder_id or proof.tenant_id != auction.tenant_id:
        raise InsufficientCommitment("proof does not match bidder or tenant")
    if proof.valid_until <= now:
        raise InsufficientCommitment("commitment proof expired")
    if proof.guaranteed_amount < required:
        raise InsufficientCommitment(
            f"required {required}, guaranteed {proof.guaranteed_amount}"
        )

    # 5. Accept the bid (new immutable state)
    bid = Bid(
        bid_id=command.bid_id,
        auction_id=auction.auction_id,
        bidder_id=bidder.bidder_id,
        amount=command.amount,
        placed_at=now,
        sequence=auction.bid_count + 1,
        idempotency_key=command.idempotency_key,
    )

    # 6. Ladder: rebuild the current top-K deterministically, then place the
    #    new bid. Order: amount desc, time asc, sequence asc.
    ladder = AuctionLadder(auction.ladder_size)
    for existing in sorted(auction.ladder, key=lambda b: b.sequence):
        ladder.place(_to_ladder_bid(existing))
    outcome = ladder.place(_to_ladder_bid(bid))
    if not outcome.accepted:
        # Cannot normally happen (the bid is above the current leader), but
        # a bid that does not rank must never change auction state.
        raise BidBelowMinimum(f"bid does not rank in top {auction.ladder_size}: {outcome.reason}")
    by_id = {b.bid_id: b for b in auction.ladder}
    by_id[bid.bid_id] = bid
    new_ladder = tuple(by_id[e.bid.bid_id] for e in ladder.snapshot())
    return SubmitBidResult(
        auction=auction.accept(bid, new_ladder),
        bid=bid,
        required_exposure=required,
        guaranteed_amount=proof.guaranteed_amount,
        rank=outcome.rank,
        transitions=outcome.transitions,
        rank_changes=outcome.rank_changes,
    )


_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _to_ladder_bid(bid: Bid) -> LadderBid:
    return LadderBid(
        bid_id=bid.bid_id,
        bidder_id=bid.bidder_id,
        amount=bid.amount,
        timestamp=(bid.placed_at - _EPOCH) // timedelta(microseconds=1),
    )
