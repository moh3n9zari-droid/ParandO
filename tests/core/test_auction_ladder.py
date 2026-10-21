import threading

import pytest

from src.core.auction_ladder import (
    AuctionLadder, LadderBid, LadderBidStatus as S, LadderError,
)


def b(i, bidder, amount, ts):
    return LadderBid(bid_id=i, bidder_id=bidder, amount=amount, timestamp=ts)


def ids(ladder):
    return [e.bid.bid_id for e in ladder.snapshot()]


@pytest.mark.parametrize("k", [0, -1, True, 1.5, "3"])
def test_invalid_k(k):
    with pytest.raises(LadderError) as e:
        AuctionLadder(k)
    assert e.value.code == "INVALID_K"


@pytest.mark.parametrize("bid,code", [
    (b("", "u", 10, 1), "INVALID_BID"),
    (b("x", "", 10, 1), "INVALID_BID"),
    (b("x", "u", 0, 1), "INVALID_AMOUNT"),
    (b("x", "u", -5, 1), "INVALID_AMOUNT"),
    (b("x", "u", 10.5, 1), "INVALID_AMOUNT"),
    (b("x", "u", True, 1), "INVALID_AMOUNT"),
    (b("x", "u", 10, -1), "INVALID_TIMESTAMP"),
])
def test_invalid_bids(bid, code):
    with pytest.raises(LadderError) as e:
        AuctionLadder(3).place(bid)
    assert e.value.code == code


def test_empty_ladder_state():
    l = AuctionLadder(2)
    assert l.snapshot() == [] and l.leader() is None and l.threshold() is None


def test_first_bid_rank_one():
    l = AuctionLadder(3)
    r = l.place(b("b1", "u1", 100, 1))
    assert r.accepted and r.rank == 1 and r.status == S.RANKED
    assert l.leader().bid_id == "b1"


def test_sorted_by_amount_desc():
    l = AuctionLadder(3)
    l.place(b("b1", "u1", 100, 1))
    l.place(b("b2", "u2", 300, 2))
    l.place(b("b3", "u3", 200, 3))
    assert ids(l) == ["b2", "b3", "b1"]
    assert l.rank_of("b3") == 2


def test_tie_break_earlier_timestamp_wins():
    l = AuctionLadder(3)
    l.place(b("late", "u1", 100, 20))
    l.place(b("early", "u2", 100, 10))
    assert ids(l) == ["early", "late"]


def test_tie_break_same_timestamp_arrival_order():
    l = AuctionLadder(3)
    l.place(b("first", "u1", 100, 5))
    l.place(b("second", "u2", 100, 5))
    assert ids(l) == ["first", "second"]


def test_outbid_when_ladder_full():
    l = AuctionLadder(2)
    l.place(b("b1", "u1", 100, 1))
    l.place(b("b2", "u2", 200, 2))
    r = l.place(b("b3", "u3", 150, 3))
    assert r.accepted and r.rank == 2
    assert [(t.bid_id, t.new_status, t.previous_rank) for t in r.transitions] == [
        ("b1", S.OUTBID, 2)
    ]
    assert l.status_of("b1") == S.OUTBID
    assert ids(l) == ["b2", "b3"]


def test_new_leader_pushes_ranks_down():
    l = AuctionLadder(3)
    l.place(b("b1", "u1", 100, 1))
    l.place(b("b2", "u2", 200, 2))
    r = l.place(b("b3", "u3", 300, 3))
    changes = {c.bid_id: (c.old_rank, c.new_rank) for c in r.rank_changes}
    assert changes == {"b3": (None, 1), "b2": (1, 2), "b1": (2, 3)}


def test_below_ladder_rejected():
    l = AuctionLadder(2)
    l.place(b("b1", "u1", 200, 1))
    l.place(b("b2", "u2", 300, 2))
    r = l.place(b("b3", "u3", 100, 3))
    assert not r.accepted and r.reason == "BELOW_LADDER" and r.rank is None
    assert l.status_of("b3") == S.REJECTED
    assert ids(l) == ["b2", "b1"]


def test_equal_to_threshold_later_is_rejected():
    l = AuctionLadder(1)
    l.place(b("b1", "u1", 100, 1))
    r = l.place(b("b2", "u2", 100, 2))
    assert not r.accepted and ids(l) == ["b1"]


def test_equal_to_threshold_earlier_timestamp_wins():
    l = AuctionLadder(1)
    l.place(b("b1", "u1", 100, 10))
    r = l.place(b("b2", "u2", 100, 5))
    assert r.accepted and ids(l) == ["b2"]
    assert l.status_of("b1") == S.OUTBID


def test_same_bidder_higher_bid_supersedes():
    l = AuctionLadder(3)
    l.place(b("b1", "u1", 100, 1))
    l.place(b("b2", "u2", 150, 2))
    r = l.place(b("b3", "u1", 200, 3))
    assert r.accepted and r.rank == 1
    assert l.status_of("b1") == S.SUPERSEDED
    assert ids(l) == ["b3", "b2"]
    assert any(t.new_status == S.SUPERSEDED and t.bid_id == "b1" for t in r.transitions)


def test_same_bidder_lower_or_equal_rejected():
    l = AuctionLadder(3)
    l.place(b("b1", "u1", 100, 1))
    for i, amt in (("b2", 100), ("b3", 50)):
        r = l.place(b(i, "u1", amt, 2))
        assert not r.accepted and r.reason == "NOT_HIGHER_THAN_OWN_BID"
    assert ids(l) == ["b1"]


def test_bidder_holds_single_position_when_full():
    l = AuctionLadder(2)
    l.place(b("b1", "u1", 100, 1))
    l.place(b("b2", "u2", 200, 2))
    l.place(b("b3", "u1", 250, 3))
    assert ids(l) == ["b3", "b2"]
    assert len({e.bid.bidder_id for e in l.snapshot()}) == 2


def test_idempotent_replay_no_double_effect():
    l = AuctionLadder(2)
    first = l.place(b("b1", "u1", 100, 1))
    again = l.place(b("b1", "u1", 100, 1))
    assert again.duplicate and again.accepted == first.accepted
    assert again.rank == 1 and ids(l) == ["b1"]


def test_idempotent_replay_of_rejected():
    l = AuctionLadder(1)
    l.place(b("b1", "u1", 200, 1))
    l.place(b("b2", "u2", 100, 2))
    again = l.place(b("b2", "u2", 100, 2))
    assert again.duplicate and not again.accepted


def test_threshold_when_full():
    l = AuctionLadder(2)
    l.place(b("b1", "u1", 100, 1))
    assert l.threshold() is None
    l.place(b("b2", "u2", 200, 2))
    assert l.threshold() == 100


def test_k_one_leader_replaced():
    l = AuctionLadder(1)
    l.place(b("b1", "u1", 100, 1))
    r = l.place(b("b2", "u2", 101, 2))
    assert r.rank == 1 and l.status_of("b1") == S.OUTBID


def test_never_exceeds_k():
    l = AuctionLadder(3)
    for i in range(20):
        l.place(b(f"b{i}", f"u{i}", 100 + i, i))
    assert len(l.snapshot()) == 3
    assert ids(l) == ["b19", "b18", "b17"]


def test_result_independent_of_arrival_order_with_distinct_keys():
    import itertools
    bids = [b(f"b{i}", f"u{i}", 100 + (i % 3) * 10, i) for i in range(5)]
    outcomes = set()
    for perm in itertools.permutations(bids):
        l = AuctionLadder(3)
        for x in perm:
            l.place(x)
        outcomes.add(tuple(ids(l)))
    assert len(outcomes) == 1


def test_thread_safety_deterministic_final_state():
    l = AuctionLadder(5)
    bids = [b(f"b{i}", f"u{i}", 1000 + i, i) for i in range(200)]

    def worker(chunk):
        for x in chunk:
            l.place(x)

    threads = [threading.Thread(target=worker, args=(bids[i::8],)) for i in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert ids(l) == ["b199", "b198", "b197", "b196", "b195"]
    ranked = [i for i in (f"b{n}" for n in range(200)) if l.status_of(i) == S.RANKED]
    assert len(ranked) == 5
