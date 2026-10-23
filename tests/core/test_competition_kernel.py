import unittest
from datetime import datetime, timedelta, timezone
from typing import Optional

from src.core.competition_kernel import (
    Clock,
    CommitmentGuard,
    CommitmentProof,
    Competition,
    CompetitionEnded,
    CompetitionNotActive,
    CompetitionNotStarted,
    CompetitionRules,
    CompetitionStatus,
    FixedClock,
    InsufficientCommitment,
    InvalidAmount,
    Offer,
    OfferBelowMinimum,
    OfferConflict,
    OfferIncrementTooSmall,
    Offerer,
    OffererNotEligible,
    SellerCannotOffer,
    StaleCompetitionVersion,
    SubmitOfferCommand,
    submit_offer,
)

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)
BASE_PRICE = 1_000_000
STEP = 50_000
REQUIRED = 150_000


class FakeGuard(CommitmentGuard):
    def __init__(self, proof: Optional[CommitmentProof]) -> None:
        self.proof = proof
        self.calls = []

    def get_proof(self, offerer_id: str, tenant_id: str) -> Optional[CommitmentProof]:
        self.calls.append((offerer_id, tenant_id))
        return self.proof


def make_competition(**overrides) -> Competition:
    defaults = dict(
        competition_id="C1",
        tenant_id="T1",
        seller_id="seller",
        rules=CompetitionRules(base_price=BASE_PRICE, min_increment=STEP),
        starts_at=NOW - timedelta(hours=1),
        ends_at=NOW + timedelta(hours=1),
        status=CompetitionStatus.ACTIVE,
    )
    defaults.update(overrides)
    return Competition(**defaults)


def make_offerer(**overrides) -> Offerer:
    defaults = dict(offerer_id="o1", tenant_id="T1", is_eligible=True)
    defaults.update(overrides)
    return Offerer(**defaults)


def make_proof(**overrides) -> CommitmentProof:
    defaults = dict(
        offerer_id="o1",
        tenant_id="T1",
        guaranteed_amount=REQUIRED,
        valid_until=NOW + timedelta(minutes=30),
    )
    defaults.update(overrides)
    return CommitmentProof(**defaults)


def make_command(**overrides) -> SubmitOfferCommand:
    defaults = dict(
        competition_id="C1",
        offerer=make_offerer(),
        amount=BASE_PRICE,
        offer_id="offer-1",
        idempotency_key="idem-1",
    )
    defaults.update(overrides)
    return SubmitOfferCommand(**defaults)


class TestCompetitionKernel(unittest.TestCase):
    def test_first_offer_at_base_price_accepted(self):
        c = make_competition()
        g = FakeGuard(make_proof())
        r = submit_offer(c, make_command(), g, FixedClock(NOW))
        self.assertEqual(r.offer.amount, BASE_PRICE)
        self.assertEqual(r.offer.offerer_id, "o1")
        self.assertEqual(r.offer.sequence, 1)
        self.assertEqual(r.competition.highest_offer, r.offer)
        self.assertEqual(r.competition.offer_count, 1)
        self.assertEqual(r.competition.version, 1)

    def test_tr12_idempotency_replay_on_identical_payload(self):
        """TR-12: Identical payload returns the previous response."""
        c = make_competition()
        g = FakeGuard(make_proof())
        seen = {}
        cmd = make_command()
        r1 = submit_offer(c, cmd, g, FixedClock(NOW), seen)
        # Re-submit exact same command
        r2 = submit_offer(c, cmd, g, FixedClock(NOW), seen)
        self.assertIs(r1, r2)
        self.assertEqual(r2.offer.offer_id, cmd.offer_id)

    def test_tr12_idempotency_conflict_on_different_payload(self):
        """TR-12: Different payload for same idempotency key raises OfferConflict."""
        c = make_competition()
        g = FakeGuard(make_proof(guaranteed_amount=REQUIRED * 5))
        seen = {}
        cmd1 = make_command(amount=BASE_PRICE)
        submit_offer(c, cmd1, g, FixedClock(NOW), seen)

        # Re-use idem-1 with different amount
        cmd2 = make_command(amount=BASE_PRICE + STEP)
        with self.assertRaises(OfferConflict):
            submit_offer(c, cmd2, g, FixedClock(NOW), seen)

    def test_offer_below_minimum_rejected(self):
        c = make_competition()
        g = FakeGuard(make_proof())
        with self.assertRaises(OfferBelowMinimum):
            submit_offer(c, make_command(amount=BASE_PRICE - 1), g, FixedClock(NOW))

    def test_offer_increment_too_small_rejected(self):
        c = make_competition()
        g = FakeGuard(make_proof(guaranteed_amount=REQUIRED * 5))
        r1 = submit_offer(c, make_command(), g, FixedClock(NOW))
        with self.assertRaises(OfferIncrementTooSmall):
            cmd2 = make_command(offer_id="o-2", idempotency_key="i-2", amount=BASE_PRICE + 10)
            submit_offer(r1.competition, cmd2, g, FixedClock(NOW))

    def test_seller_cannot_offer(self):
        c = make_competition()
        g = FakeGuard(make_proof())
        with self.assertRaises(SellerCannotOffer):
            submit_offer(c, make_command(offerer=make_offerer(offerer_id="seller")), g, FixedClock(NOW))

    def test_offerer_not_eligible(self):
        c = make_competition()
        g = FakeGuard(make_proof())
        with self.assertRaises(OffererNotEligible):
            submit_offer(c, make_command(offerer=make_offerer(is_eligible=False)), g, FixedClock(NOW))

    def test_insufficient_commitment(self):
        c = make_competition()
        g = FakeGuard(make_proof(guaranteed_amount=REQUIRED - 1))
        with self.assertRaises(InsufficientCommitment):
            submit_offer(c, make_command(), g, FixedClock(NOW))

    def test_stale_competition_version(self):
        c = make_competition(version=2)
        g = FakeGuard(make_proof())
        with self.assertRaises(StaleCompetitionVersion):
            submit_offer(c, make_command(expected_version=1), g, FixedClock(NOW))


if __name__ == "__main__":
    unittest.main()
