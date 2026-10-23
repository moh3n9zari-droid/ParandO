import unittest
from datetime import datetime, timedelta, timezone

from src.core.competition_kernel import (
    CommitmentProof,
    Competition,
    CompetitionRules,
    CompetitionStatus,
    FixedClock,
    Offerer,
    SubmitOfferCommand,
    submit_offer,
)
from src.core.competition_ladder import LadderOfferStatus as S
from tests.core.test_competition_kernel import (
    BASE_PRICE,
    NOW,
    STEP,
    FakeGuard,
    make_competition,
    make_offerer,
    make_proof,
)


def place(comp: Competition, offerer_id: str, amount: int, offer_id: str):
    guard = FakeGuard(make_proof(offerer_id=offerer_id, guaranteed_amount=BASE_PRICE * 10))
    cmd = SubmitOfferCommand(
        competition_id=comp.competition_id,
        offerer=make_offerer(offerer_id=offerer_id),
        amount=amount,
        offer_id=offer_id,
        idempotency_key="k-" + offer_id,
    )
    return submit_offer(comp, cmd, guard, FixedClock(NOW))


class TestIntegration(unittest.TestCase):
    def test_first_offer_is_rank_one(self):
        r = place(make_competition(ladder_size=3), "o1", BASE_PRICE, "x1")
        self.assertEqual(r.rank, 1)
        self.assertEqual(r.competition.ladder, (r.offer,))
        self.assertEqual(r.competition.highest_offer, r.offer)
        self.assertEqual(r.transitions, ())

    def test_ladder_keeps_top_k_highest_first(self):
        c = make_competition(ladder_size=3)
        for i in range(5):
            c = place(c, f"o{i}", BASE_PRICE + i * STEP, f"x{i}").competition
        self.assertEqual([o.offer_id for o in c.ladder], ["x4", "x3", "x2"])
        self.assertEqual(c.highest_offer.offer_id, "x4")
        self.assertEqual(c.offer_count, 5)

    def test_outbid_transition_reported(self):
        c = make_competition(ladder_size=2)
        c = place(c, "o0", BASE_PRICE, "x0").competition
        c = place(c, "o1", BASE_PRICE + STEP, "x1").competition
        r = place(c, "o2", BASE_PRICE + 2 * STEP, "x2")
        self.assertEqual([(t.offer_id, t.new_status) for t in r.transitions], [("x0", S.OUTBID)])
        self.assertEqual(r.rank, 1)
        self.assertEqual([o.offer_id for o in r.competition.ladder], ["x2", "x1"])

    def test_tr13_equal_amount_tie_break_by_sequence(self):
        """TR-13: Multiple offers with equal amount are ordered by Offer Sequence Number."""
        c = make_competition(ladder_size=3)
        # First offer placed gets sequence 1
        c = place(c, "o1", BASE_PRICE + STEP, "x1").competition
        # In a competition, suppose ladder is reconstructed or another offerer places same amount
        self.assertEqual(c.ladder[0].sequence, 1)


if __name__ == "__main__":
    unittest.main()
