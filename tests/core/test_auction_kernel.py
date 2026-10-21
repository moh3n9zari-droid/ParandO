"""Unit tests for the Auction Kernel (src/core/auction_kernel.py).

Pure tests: no I/O. Time and the commitment guard are faked.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest

from src.core.auction_kernel import (
    Auction,
    AuctionEnded,
    AuctionError,
    AuctionNotActive,
    AuctionNotStarted,
    AuctionRules,
    AuctionStatus,
    Bid,
    BidBelowMinimum,
    BidderNotEligible,
    BidIncrementTooSmall,
    Bidder,
    CommitmentProof,
    DuplicateBid,
    InsufficientCommitment,
    InvalidAmount,
    SellerCannotBid,
    StaleAuctionVersion,
    SubmitBidCommand,
    submit_bid,
)

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)
BASE_PRICE = 1_000_000
STEP = 50_000
REQUIRED = 150_000  # 15% of base price


# --------------------------------------------------------------------------
# Fakes and builders
# --------------------------------------------------------------------------

class FixedClock:
    def __init__(self, now: datetime = NOW) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now


class FakeGuard:
    """In-memory CommitmentGuard. Records calls."""

    def __init__(self, proof: Optional[CommitmentProof]) -> None:
        self.proof = proof
        self.calls = []

    def get_proof(self, bidder_id: str, tenant_id: str) -> Optional[CommitmentProof]:
        self.calls.append((bidder_id, tenant_id))
        return self.proof


def make_auction(**overrides) -> Auction:
    defaults = dict(
        auction_id="A1",
        tenant_id="T1",
        seller_id="seller",
        rules=AuctionRules(base_price=BASE_PRICE, min_increment=STEP),
        starts_at=NOW - timedelta(hours=1),
        ends_at=NOW + timedelta(hours=1),
        status=AuctionStatus.ACTIVE,
    )
    defaults.update(overrides)
    return Auction(**defaults)


def make_bidder(**overrides) -> Bidder:
    defaults = dict(bidder_id="b1", tenant_id="T1", is_eligible=True)
    defaults.update(overrides)
    return Bidder(**defaults)


def make_proof(**overrides) -> CommitmentProof:
    defaults = dict(
        bidder_id="b1",
        tenant_id="T1",
        guaranteed_amount=REQUIRED,
        valid_until=NOW + timedelta(minutes=30),
    )
    defaults.update(overrides)
    return CommitmentProof(**defaults)


def make_command(**overrides) -> SubmitBidCommand:
    defaults = dict(
        auction_id="A1",
        bidder=make_bidder(),
        amount=BASE_PRICE,
        bid_id="bid-1",
        idempotency_key="idem-1",
    )
    defaults.update(overrides)
    return SubmitBidCommand(**defaults)


def make_bid(amount: int, bidder_id: str = "other", sequence: int = 1) -> Bid:
    return Bid(
        bid_id=f"prev-{sequence}",
        auction_id="A1",
        bidder_id=bidder_id,
        amount=amount,
        placed_at=NOW - timedelta(minutes=5),
        sequence=sequence,
        idempotency_key=f"prev-idem-{sequence}",
    )


def auction_with_highest(amount: int) -> Auction:
    return make_auction(highest_bid=make_bid(amount), bid_count=1, version=1)


def submit(auction=None, command=None, guard=None, clock=None, seen=frozenset()):
    return submit_bid(
        auction or make_auction(),
        command or make_command(),
        guard or FakeGuard(make_proof()),
        clock or FixedClock(),
        seen,
    )


# --------------------------------------------------------------------------
# Successful placement
# --------------------------------------------------------------------------

class TestSuccessfulBid:
    def test_first_bid_at_base_price_is_accepted(self):
        result = submit()

        assert result.bid.amount == BASE_PRICE
        assert result.bid.bidder_id == "b1"
        assert result.bid.sequence == 1
        assert result.bid.placed_at == NOW
        assert result.auction.highest_bid == result.bid
        assert result.auction.bid_count == 1
        assert result.auction.version == 1

    def test_first_bid_above_base_price_is_accepted(self):
        result = submit(command=make_command(amount=BASE_PRICE + 1))

        assert result.bid.amount == BASE_PRICE + 1

    def test_bid_exactly_at_minimum_increment_is_accepted(self):
        auction = auction_with_highest(1_200_000)

        result = submit(auction=auction, command=make_command(amount=1_200_000 + STEP))

        assert result.bid.amount == 1_250_000
        assert result.bid.sequence == 2
        assert result.auction.bid_count == 2
        assert result.auction.version == 2

    def test_bid_above_minimum_increment_is_accepted(self):
        auction = auction_with_highest(1_200_000)

        result = submit(auction=auction, command=make_command(amount=2_000_000))

        assert result.auction.highest_bid.amount == 2_000_000

    def test_result_reports_exposure_and_guarantee(self):
        result = submit(guard=FakeGuard(make_proof(guaranteed_amount=500_000)))

        assert result.required_exposure == REQUIRED
        assert result.guaranteed_amount == 500_000

    def test_input_auction_is_not_mutated(self):
        auction = make_auction()

        submit(auction=auction)

        assert auction.highest_bid is None
        assert auction.bid_count == 0
        assert auction.version == 0

    def test_guard_is_queried_for_bidder_and_tenant(self):
        guard = FakeGuard(make_proof())

        submit(guard=guard)

        assert guard.calls == [("b1", "T1")]

    def test_matching_expected_version_is_accepted(self):
        auction = auction_with_highest(1_200_000)

        result = submit(
            auction=auction,
            command=make_command(amount=1_300_000, expected_version=1),
        )

        assert result.auction.version == 2

    def test_proof_with_more_than_required_is_accepted(self):
        result = submit(guard=FakeGuard(make_proof(guaranteed_amount=REQUIRED * 10)))

        assert result.bid.amount == BASE_PRICE


# --------------------------------------------------------------------------
# Auction status and time window
# --------------------------------------------------------------------------

class TestAuctionNotActive:
    @pytest.mark.parametrize(
        "status",
        [
            AuctionStatus.DRAFT,
            AuctionStatus.SCHEDULED,
            AuctionStatus.CLOSED,
            AuctionStatus.CANCELLED,
        ],
    )
    def test_non_active_status_is_rejected(self, status):
        auction = make_auction(status=status)

        with pytest.raises(AuctionNotActive) as exc:
            submit(auction=auction)

        assert exc.value.code == "AUCTION_NOT_ACTIVE"

    def test_bid_before_start_is_rejected(self):
        auction = make_auction(
            starts_at=NOW + timedelta(minutes=1), ends_at=NOW + timedelta(hours=2)
        )

        with pytest.raises(AuctionNotStarted):
            submit(auction=auction)

    def test_bid_after_end_is_rejected(self):
        auction = make_auction(
            starts_at=NOW - timedelta(hours=2), ends_at=NOW - timedelta(minutes=1)
        )

        with pytest.raises(AuctionEnded):
            submit(auction=auction)

    def test_bid_exactly_at_end_time_is_rejected(self):
        auction = make_auction(ends_at=NOW)

        with pytest.raises(AuctionEnded):
            submit(auction=auction)

    def test_bid_exactly_at_start_time_is_accepted(self):
        auction = make_auction(starts_at=NOW)

        assert submit(auction=auction).bid.amount == BASE_PRICE

    def test_command_for_other_auction_is_rejected(self):
        with pytest.raises(AuctionNotActive):
            submit(command=make_command(auction_id="OTHER"))

    def test_inactive_auction_does_not_query_guard(self):
        guard = FakeGuard(make_proof())

        with pytest.raises(AuctionNotActive):
            submit(auction=make_auction(status=AuctionStatus.CLOSED), guard=guard)

        assert guard.calls == []


# --------------------------------------------------------------------------
# Price rules
# --------------------------------------------------------------------------

class TestPriceRules:
    def test_first_bid_below_base_price_is_rejected(self):
        with pytest.raises(BidBelowMinimum) as exc:
            submit(command=make_command(amount=BASE_PRICE - 1))

        assert exc.value.code == "BID_BELOW_MINIMUM"

    def test_bid_equal_to_highest_is_rejected(self):
        auction = auction_with_highest(1_200_000)

        with pytest.raises(BidIncrementTooSmall):
            submit(auction=auction, command=make_command(amount=1_200_000))

    def test_bid_one_below_minimum_increment_is_rejected(self):
        auction = auction_with_highest(1_200_000)

        with pytest.raises(BidIncrementTooSmall) as exc:
            submit(
                auction=auction,
                command=make_command(amount=1_200_000 + STEP - 1),
            )

        assert exc.value.code == "BID_INCREMENT_TOO_SMALL"

    def test_bid_lower_than_highest_is_rejected(self):
        auction = auction_with_highest(1_200_000)

        with pytest.raises(BidIncrementTooSmall):
            submit(auction=auction, command=make_command(amount=1_100_000))

    @pytest.mark.parametrize("amount", [0, -1, -BASE_PRICE])
    def test_non_positive_amount_is_rejected(self, amount):
        with pytest.raises(InvalidAmount):
            submit(command=make_command(amount=amount))

    @pytest.mark.parametrize("amount", [1_000_000.0, 1_000_000.5, "1000000", None])
    def test_non_integer_amount_is_rejected(self, amount):
        with pytest.raises(InvalidAmount):
            submit(command=make_command(amount=amount))

    def test_boolean_amount_is_rejected(self):
        with pytest.raises(InvalidAmount):
            submit(command=make_command(amount=True))

    def test_price_rejection_does_not_query_guard(self):
        guard = FakeGuard(make_proof())

        with pytest.raises(BidBelowMinimum):
            submit(command=make_command(amount=1), guard=guard)

        assert guard.calls == []

    def test_minimum_next_bid_without_bids_is_base_price(self):
        assert make_auction().minimum_next_bid() == BASE_PRICE

    def test_minimum_next_bid_with_bids_adds_increment(self):
        assert auction_with_highest(1_200_000).minimum_next_bid() == 1_250_000


# --------------------------------------------------------------------------
# Commitment guard / deposit pre-authorization
# --------------------------------------------------------------------------

class TestCommitmentGuard:
    def test_missing_proof_is_rejected(self):
        with pytest.raises(InsufficientCommitment) as exc:
            submit(guard=FakeGuard(None))

        assert exc.value.code == "INSUFFICIENT_COMMITMENT"

    def test_guaranteed_amount_below_required_is_rejected(self):
        guard = FakeGuard(make_proof(guaranteed_amount=REQUIRED - 1))

        with pytest.raises(InsufficientCommitment):
            submit(guard=guard)

    def test_zero_guaranteed_amount_is_rejected(self):
        with pytest.raises(InsufficientCommitment):
            submit(guard=FakeGuard(make_proof(guaranteed_amount=0)))

    def test_guaranteed_amount_exactly_required_is_accepted(self):
        guard = FakeGuard(make_proof(guaranteed_amount=REQUIRED))

        assert submit(guard=guard).guaranteed_amount == REQUIRED

    def test_expired_proof_is_rejected(self):
        guard = FakeGuard(make_proof(valid_until=NOW - timedelta(seconds=1)))

        with pytest.raises(InsufficientCommitment):
            submit(guard=guard)

    def test_proof_expiring_exactly_now_is_rejected(self):
        with pytest.raises(InsufficientCommitment):
            submit(guard=FakeGuard(make_proof(valid_until=NOW)))

    def test_proof_for_other_bidder_is_rejected(self):
        with pytest.raises(InsufficientCommitment):
            submit(guard=FakeGuard(make_proof(bidder_id="someone-else")))

    def test_proof_for_other_tenant_is_rejected(self):
        with pytest.raises(InsufficientCommitment):
            submit(guard=FakeGuard(make_proof(tenant_id="T2")))

    def test_required_exposure_is_15_percent_of_base_price(self):
        assert AuctionRules(base_price=1_000_000, min_increment=1).required_exposure == 150_000

    def test_required_exposure_rounds_up(self):
        rules = AuctionRules(base_price=1_001, min_increment=1)

        assert rules.required_exposure == 151  # 150.15 -> 151

    def test_custom_deposit_rate_is_used(self):
        rules = AuctionRules(base_price=1_000_000, min_increment=1, deposit_rate_bps=500)
        auction = make_auction(rules=rules)

        with pytest.raises(InsufficientCommitment):
            submit(auction=auction, guard=FakeGuard(make_proof(guaranteed_amount=49_999)))

        result = submit(auction=auction, guard=FakeGuard(make_proof(guaranteed_amount=50_000)))
        assert result.required_exposure == 50_000

    def test_rejected_bid_leaves_auction_unchanged(self):
        auction = auction_with_highest(1_200_000)

        with pytest.raises(InsufficientCommitment):
            submit(
                auction=auction,
                command=make_command(amount=1_300_000),
                guard=FakeGuard(None),
            )

        assert auction.highest_bid.amount == 1_200_000
        assert auction.version == 1


# --------------------------------------------------------------------------
# Bidder rules, idempotency and concurrency
# --------------------------------------------------------------------------

class TestBidderAndConcurrency:
    def test_seller_cannot_bid(self):
        bidder = make_bidder(bidder_id="seller")

        with pytest.raises(SellerCannotBid):
            submit(
                command=make_command(bidder=bidder),
                guard=FakeGuard(make_proof(bidder_id="seller")),
            )

    def test_ineligible_bidder_is_rejected(self):
        with pytest.raises(BidderNotEligible):
            submit(command=make_command(bidder=make_bidder(is_eligible=False)))

    def test_bidder_from_other_tenant_is_rejected(self):
        with pytest.raises(BidderNotEligible):
            submit(command=make_command(bidder=make_bidder(tenant_id="T2")))

    def test_duplicate_idempotency_key_is_rejected(self):
        with pytest.raises(DuplicateBid):
            submit(seen=frozenset({"idem-1"}))

    def test_other_idempotency_keys_do_not_conflict(self):
        assert submit(seen=frozenset({"idem-x"})).bid.idempotency_key == "idem-1"

    def test_stale_expected_version_is_rejected(self):
        auction = auction_with_highest(1_200_000)

        with pytest.raises(StaleAuctionVersion):
            submit(
                auction=auction,
                command=make_command(amount=1_300_000, expected_version=0),
            )

    def test_all_domain_errors_share_base_class(self):
        with pytest.raises(AuctionError):
            submit(guard=FakeGuard(None))


# --------------------------------------------------------------------------
# Model invariants
# --------------------------------------------------------------------------

class TestModelValidation:
    def test_rules_reject_non_positive_base_price(self):
        with pytest.raises(InvalidAmount):
            AuctionRules(base_price=0, min_increment=1)

    def test_rules_reject_non_positive_increment(self):
        with pytest.raises(InvalidAmount):
            AuctionRules(base_price=1, min_increment=0)

    @pytest.mark.parametrize("bps", [-1, 10_001])
    def test_rules_reject_invalid_deposit_rate(self, bps):
        with pytest.raises(InvalidAmount):
            AuctionRules(base_price=1, min_increment=1, deposit_rate_bps=bps)

    def test_auction_requires_timezone_aware_times(self):
        with pytest.raises(ValueError):
            make_auction(starts_at=datetime(2026, 1, 1), ends_at=datetime(2026, 1, 2))

    def test_auction_requires_end_after_start(self):
        with pytest.raises(ValueError):
            make_auction(starts_at=NOW, ends_at=NOW)

    def test_bid_is_immutable(self):
        bid = make_bid(1)

        with pytest.raises(Exception):
            bid.amount = 2  # type: ignore[misc]
