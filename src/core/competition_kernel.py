"""Parando Competition Kernel (ADR-001, TR-01, TR-12, TR-13) - pure domain logic.

Design rules:
- No I/O, no framework, no database, no Redis, no payment provider imports.
- TR-01: Renamed from Auction/Bid to Competition/Offer.
- TR-12: Idempotent replay on identical payload, conflict error on payload mismatch.
- TR-13: Tie-breaking by Offer Sequence Number on equal amount.
- The kernel never writes ledger entries or holds (K-INV-14).
- Exposure must never exceed the guaranteed amount (K-INV-7).
- Money is an integer in the smallest unit (Rial). Floats are forbidden.
- Time is injected through a Clock port, so the kernel is deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Optional, Protocol, Tuple, Union

from src.core.competition_ladder import (
    CompetitionLadder,
    LadderOffer,
    LadderOfferStatus,
    RankChange,
    StatusTransition,
)


# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------

class CompetitionError(Exception):
    """Base class for all domain errors. Each carries a stable code."""

    code = "COMPETITION_ERROR"

    def __init__(self, message: str = "") -> None:
        super().__init__(message or self.code)


AuctionError = CompetitionError


class CompetitionNotActive(CompetitionError):
    code = "COMPETITION_NOT_ACTIVE"


AuctionNotActive = CompetitionNotActive


class CompetitionNotStarted(CompetitionError):
    code = "COMPETITION_NOT_STARTED"


AuctionNotStarted = CompetitionNotStarted


class CompetitionEnded(CompetitionError):
    code = "COMPETITION_ENDED"


AuctionEnded = CompetitionEnded


class InvalidAmount(CompetitionError):
    code = "INVALID_AMOUNT"


class OfferBelowMinimum(CompetitionError):
    code = "OFFER_BELOW_MINIMUM"


BidBelowMinimum = OfferBelowMinimum


class OfferIncrementTooSmall(CompetitionError):
    code = "OFFER_INCREMENT_TOO_SMALL"


BidIncrementTooSmall = OfferIncrementTooSmall


class SellerCannotOffer(CompetitionError):
    code = "SELLER_CANNOT_OFFER"


SellerCannotBid = SellerCannotOffer


class OffererNotEligible(CompetitionError):
    code = "OFFERER_NOT_ELIGIBLE"


BidderNotEligible = OffererNotEligible


class InsufficientCommitment(CompetitionError):
    code = "INSUFFICIENT_COMMITMENT"


class DuplicateOffer(CompetitionError):
    code = "DUPLICATE_OFFER"


DuplicateBid = DuplicateOffer


class OfferConflict(CompetitionError):
    code = "OFFER_CONFLICT"


IdempotencyConflict = OfferConflict


class StaleCompetitionVersion(CompetitionError):
    code = "STALE_COMPETITION_VERSION"


StaleAuctionVersion = StaleCompetitionVersion


# --------------------------------------------------------------------------
# Domain model
# --------------------------------------------------------------------------

class CompetitionStatus(str, Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


AuctionStatus = CompetitionStatus


@dataclass(frozen=True)
class Offerer:
    offerer_id: str
    tenant_id: str
    is_eligible: bool = True

    @property
    def bidder_id(self) -> str:
        return self.offerer_id


Bidder = Offerer


@dataclass(frozen=True)
class Offer:
    offer_id: str
    competition_id: str
    offerer_id: str
    amount: int
    placed_at: datetime
    sequence: int  # strictly increasing per competition (TR-13 ladder order)
    idempotency_key: str

    @property
    def bid_id(self) -> str:
        return self.offer_id

    @property
    def auction_id(self) -> str:
        return self.competition_id

    @property
    def bidder_id(self) -> str:
        return self.offerer_id


Bid = Offer


@dataclass(frozen=True)
class CompetitionRules:
    """Pricing and exposure rules of one competition."""

    base_price: int  # base price (starting price), in Rial
    min_increment: int  # minimum step above current highest offer
    deposit_rate_bps: int = 1500  # 15% of base price, basis points

    def __post_init__(self) -> None:
        if self.base_price <= 0:
            raise InvalidAmount("base_price must be positive")
        if self.min_increment <= 0:
            raise InvalidAmount("min_increment must be positive")
        if not 0 <= self.deposit_rate_bps <= 10_000:
            raise InvalidAmount("deposit_rate_bps must be within 0..10000")

    @property
    def required_exposure(self) -> int:
        """ExposureRequirement: 15% of base price, rounded up."""
        return -(-self.base_price * self.deposit_rate_bps // 10_000)


AuctionRules = CompetitionRules


@dataclass(frozen=True)
class Competition:
    competition_id: str
    tenant_id: str
    seller_id: str
    rules: CompetitionRules
    starts_at: datetime
    ends_at: datetime
    status: CompetitionStatus = CompetitionStatus.SCHEDULED
    version: int = 0
    highest_offer: Optional[Offer] = None
    offer_count: int = 0
    ladder_size: int = 1
    ladder: Tuple[Offer, ...] = ()

    @property
    def auction_id(self) -> str:
        return self.competition_id

    @property
    def highest_bid(self) -> Optional[Offer]:
        return self.highest_offer

    @property
    def bid_count(self) -> int:
        return self.offer_count

    def __post_init__(self) -> None:
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("competition times must be timezone-aware")
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if self.ladder_size < 1:
            raise ValueError("ladder_size must be >= 1")

    def minimum_next_offer(self) -> int:
        """Smallest amount a new offer may have right now."""
        if self.highest_offer is None:
            return self.rules.base_price
        return self.highest_offer.amount + self.rules.min_increment

    # Alias
    minimum_next_bid = minimum_next_offer

    def accept(self, offer: Offer, ladder: Optional[Tuple[Offer, ...]] = None) -> "Competition":
        """Return a new Competition state including the offer (immutable)."""
        new_ladder = ladder if ladder is not None else (offer,)
        return replace(
            self,
            highest_offer=new_ladder[0] if new_ladder else offer,
            ladder=new_ladder,
            offer_count=self.offer_count + 1,
            version=self.version + 1,
        )


Auction = Competition


# --------------------------------------------------------------------------
# Ports
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class CommitmentProof:
    offerer_id: str
    tenant_id: str
    guaranteed_amount: int
    valid_until: datetime

    @property
    def bidder_id(self) -> str:
        return self.offerer_id


class CommitmentGuard(Protocol):
    def get_proof(self, offerer_id: str, tenant_id: str) -> Optional[CommitmentProof]:
        ...


class Clock(Protocol):
    def now(self) -> datetime:
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class FixedClock:
    def __init__(self, now: datetime) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now

    def set_now(self, now: datetime) -> None:
        self._now = now


# --------------------------------------------------------------------------
# SubmitOffer use case
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class SubmitOfferCommand:
    competition_id: str
    offerer: Offerer
    amount: int
    offer_id: str
    idempotency_key: str
    expected_version: Optional[int] = None

    @property
    def auction_id(self) -> str:
        return self.competition_id

    @property
    def bidder(self) -> Offerer:
        return self.offerer

    @property
    def bid_id(self) -> str:
        return self.offer_id


SubmitBidCommand = SubmitOfferCommand


@dataclass(frozen=True)
class SubmitOfferResult:
    competition: Competition
    offer: Offer
    required_exposure: int
    guaranteed_amount: int
    rank: int = 1
    transitions: Tuple[StatusTransition, ...] = ()
    rank_changes: Tuple[RankChange, ...] = ()

    @property
    def auction(self) -> Competition:
        return self.competition

    @property
    def bid(self) -> Offer:
        return self.offer


SubmitBidResult = SubmitOfferResult


def submit_offer(
    competition: Competition,
    command: SubmitOfferCommand,
    guard: CommitmentGuard,
    clock: Clock,
    seen_idempotency_records: Optional[Union[Dict[str, Tuple[SubmitOfferCommand, SubmitOfferResult]], frozenset]] = None,
) -> SubmitOfferResult:
    """Validate and accept an offer. Pure function: returns the new state.

    TR-12: Idempotent replay on identical payload, error conflict on payload mismatch.
    TR-13: Tie-breaking by Offer Sequence Number on equal amounts.
    """
    now = clock.now()

    # TR-12: Idempotency & Conflict Check
    if seen_idempotency_records is not None:
        if isinstance(seen_idempotency_records, dict):
            if command.idempotency_key in seen_idempotency_records:
                recorded_cmd, recorded_res = seen_idempotency_records[command.idempotency_key]
                # Check payload equality
                if (
                    recorded_cmd.competition_id == command.competition_id
                    and recorded_cmd.offerer.offerer_id == command.offerer.offerer_id
                    and recorded_cmd.amount == command.amount
                    and recorded_cmd.offer_id == command.offer_id
                ):
                    return recorded_res  # Identical payload: replay previous response
                else:
                    raise OfferConflict(
                        f"idempotency key '{command.idempotency_key}' reused with conflicting payload"
                    )
        elif isinstance(seen_idempotency_records, (set, frozenset)):
            if command.idempotency_key in seen_idempotency_records:
                raise DuplicateOffer(command.idempotency_key)

    if command.competition_id != competition.competition_id:
        raise CompetitionNotActive("competition id mismatch")
    if command.expected_version is not None and command.expected_version != competition.version:
        raise StaleCompetitionVersion(
            f"expected {command.expected_version}, actual {competition.version}"
        )

    # 1. Active window
    if competition.status is not CompetitionStatus.ACTIVE:
        raise CompetitionNotActive(f"status is {competition.status.value}")
    if now < competition.starts_at:
        raise CompetitionNotStarted()
    if now >= competition.ends_at:
        raise CompetitionEnded()

    # 2. Offerer eligibility & seller conflict
    offerer = command.offerer
    if offerer.tenant_id != competition.tenant_id:
        raise OffererNotEligible("tenant mismatch")
    if not offerer.is_eligible:
        raise OffererNotEligible()
    if offerer.offerer_id == competition.seller_id:
        raise SellerCannotOffer()

    # 3. Amount validation
    if not isinstance(command.amount, int) or isinstance(command.amount, bool):
        raise InvalidAmount("amount must be an integer (Rial)")
    if command.amount <= 0:
        raise InvalidAmount("amount must be positive")
    if competition.highest_offer is None:
        if command.amount < competition.rules.base_price:
            raise OfferBelowMinimum(
                f"minimum is {competition.rules.base_price}, got {command.amount}"
            )
    else:
        minimum = competition.minimum_next_offer()
        if command.amount < minimum:
            raise OfferIncrementTooSmall(
                f"minimum next offer is {minimum}, got {command.amount}"
            )

    # 4. Financial pre-authorization hook (K-INV-7)
    required = competition.rules.required_exposure
    proof = guard.get_proof(offerer.offerer_id, offerer.tenant_id)
    if proof is None:
        raise InsufficientCommitment("no commitment proof")
    if proof.offerer_id != offerer.offerer_id or proof.tenant_id != competition.tenant_id:
        raise InsufficientCommitment("proof does not match offerer or tenant")
    if proof.valid_until <= now:
        raise InsufficientCommitment("commitment proof expired")
    if proof.guaranteed_amount < required:
        raise InsufficientCommitment(
            f"required {required}, guaranteed {proof.guaranteed_amount}"
        )

    # 5. Accept the offer
    offer = Offer(
        offer_id=command.offer_id,
        competition_id=competition.competition_id,
        offerer_id=offerer.offerer_id,
        amount=command.amount,
        placed_at=now,
        sequence=competition.offer_count + 1,  # TR-13 Offer Sequence Number
        idempotency_key=command.idempotency_key,
    )

    # 6. Ladder: rebuild current top-K deterministically, then place new offer
    ladder = CompetitionLadder(competition.ladder_size)
    for existing in sorted(competition.ladder, key=lambda o: o.sequence):
        ladder.place(_to_ladder_offer(existing))
    outcome = ladder.place(_to_ladder_offer(offer))
    if not outcome.accepted:
        raise OfferBelowMinimum(
            f"offer does not rank in top {competition.ladder_size}: {outcome.reason}"
        )

    by_id = {o.offer_id: o for o in competition.ladder}
    by_id[offer.offer_id] = offer
    new_ladder = tuple(by_id[e.offer.offer_id] for e in ladder.snapshot())

    result = SubmitOfferResult(
        competition=competition.accept(offer, new_ladder),
        offer=offer,
        required_exposure=required,
        guaranteed_amount=proof.guaranteed_amount,
        rank=outcome.rank,
        transitions=outcome.transitions,
        rank_changes=outcome.rank_changes,
    )

    if isinstance(seen_idempotency_records, dict):
        seen_idempotency_records[command.idempotency_key] = (command, result)

    return result


submit_bid = submit_offer


def _to_ladder_offer(offer: Offer) -> LadderOffer:
    return LadderOffer(
        offer_id=offer.offer_id,
        offerer_id=offer.offerer_id,
        amount=offer.amount,
        sequence=offer.sequence,
    )
