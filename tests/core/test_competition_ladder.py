import unittest
from src.core.competition_ladder import (
    CompetitionLadder,
    IdempotencyConflict,
    LadderOffer,
    LadderOfferStatus as S,
    LadderError,
)


def o(offer_id: str, offerer_id: str, amount: int, sequence: int = 0) -> LadderOffer:
    return LadderOffer(offer_id=offer_id, offerer_id=offerer_id, amount=amount, sequence=sequence)


def ids(ladder: CompetitionLadder):
    return [e.offer.offer_id for e in ladder.snapshot()]


class TestCompetitionLadder(unittest.TestCase):
    def test_invalid_k(self):
        for k in (0, -1):
            with self.assertRaises(LadderError) as ctx:
                CompetitionLadder(k)
            self.assertEqual(ctx.exception.code, "INVALID_K")

    def test_invalid_offers(self):
        ladder = CompetitionLadder(3)
        bad_offers = [
            (o("", "u", 10), "INVALID_BID"),
            (o("x", "", 10), "INVALID_BID"),
            (o("x", "u", 0), "INVALID_AMOUNT"),
            (o("x", "u", -5), "INVALID_AMOUNT"),
        ]
        for offer, code in bad_offers:
            with self.assertRaises(LadderError) as ctx:
                ladder.place(offer)
            self.assertEqual(ctx.exception.code, code)

    def test_first_offer_rank_one(self):
        l = CompetitionLadder(3)
        r = l.place(o("o1", "u1", 100))
        self.assertTrue(r.accepted)
        self.assertEqual(r.rank, 1)
        self.assertEqual(r.status, S.RANKED)
        self.assertEqual(l.leader().offer_id, "o1")

    def test_sorted_by_amount_desc(self):
        l = CompetitionLadder(3)
        l.place(o("o1", "u1", 100))
        l.place(o("o2", "u2", 300))
        l.place(o("o3", "u3", 200))
        self.assertEqual(ids(l), ["o2", "o3", "o1"])
        self.assertEqual(l.rank_of("o3"), 2)

    def test_tr13_tie_break_offer_sequence_number_wins(self):
        """TR-13: On equal amount, ranking is strictly by Offer Sequence Number (lower sequence wins)."""
        l = CompetitionLadder(3)
        # Offer with lower sequence 1 vs sequence 2
        l.place(o("seq2", "u2", 100, sequence=2))
        l.place(o("seq1", "u1", 100, sequence=1))
        self.assertEqual(ids(l), ["seq1", "seq2"])

    def test_outbid_when_ladder_full(self):
        l = CompetitionLadder(2)
        l.place(o("o1", "u1", 100))
        l.place(o("o2", "u2", 200))
        r = l.place(o("o3", "u3", 150))
        self.assertTrue(r.accepted)
        self.assertEqual(r.rank, 2)
        self.assertEqual([(t.offer_id, t.new_status, t.previous_rank) for t in r.transitions], [
            ("o1", S.OUTBID, 2)
        ])
        self.assertEqual(l.status_of("o1"), S.OUTBID)
        self.assertEqual(ids(l), ["o2", "o3"])

    def test_same_offerer_higher_offer_supersedes(self):
        l = CompetitionLadder(3)
        l.place(o("o1", "u1", 100))
        l.place(o("o2", "u2", 150))
        r = l.place(o("o3", "u1", 200))
        self.assertTrue(r.accepted)
        self.assertEqual(r.rank, 1)
        self.assertEqual(l.status_of("o1"), S.SUPERSEDED)
        self.assertEqual(ids(l), ["o3", "o2"])

    def test_same_offerer_lower_or_equal_rejected(self):
        l = CompetitionLadder(3)
        l.place(o("o1", "u1", 100))
        for i, amt in (("o2", 100), ("o3", 50)):
            r = l.place(o(i, "u1", amt))
            self.assertFalse(r.accepted)
            self.assertEqual(r.reason, "NOT_HIGHER_THAN_OWN_BID")
        self.assertEqual(ids(l), ["o1"])

    def test_tr12_idempotent_replay_vs_conflict(self):
        """TR-12: Identical payload returns prior result; differing payload raises IdempotencyConflict."""
        l = CompetitionLadder(3)
        r1 = l.place(o("dup1", "u1", 100, sequence=1))
        # Replay identical payload
        r2 = l.place(o("dup1", "u1", 100, sequence=1))
        self.assertTrue(r2.accepted)
        self.assertTrue(r2.duplicate)
        self.assertEqual(r2.rank, 1)

        # Replay with conflicting amount
        with self.assertRaises(IdempotencyConflict):
            l.place(o("dup1", "u1", 200, sequence=1))


if __name__ == "__main__":
    unittest.main()
