"""SubmitBid + Ladder integration tests."""
import pytest

from src.core.auction_kernel import SubmitBidCommand, submit_bid
from src.core.auction_ladder import LadderBidStatus as S
from tests.core.test_auction_kernel import (
    BASE_PRICE, NOW, STEP, FakeGuard, FixedClock, make_auction, make_bidder,
    make_proof,
)


def place(auction, bidder_id, amount, bid_id, k_guard=None):
    guard = FakeGuard(make_proof(bidder_id=bidder_id))
    cmd = SubmitBidCommand(
        auction_id=auction.auction_id,
        bidder=make_bidder(bidder_id=bidder_id),
        amount=amount,
        bid_id=bid_id,
        idempotency_key="k-" + bid_id,
    )
    return submit_bid(auction, cmd, guard, FixedClock(NOW))


def test_first_bid_is_rank_one():
    r = place(make_auction(ladder_size=3), "b1", BASE_PRICE, "x1")
    assert r.rank == 1 and r.auction.ladder == (r.bid,)
    assert r.auction.highest_bid == r.bid and r.transitions == ()


def test_ladder_keeps_top_k_highest_first():
    a = make_auction(ladder_size=3)
    for i in range(5):
        a = place(a, f"b{i}", BASE_PRICE + i * STEP, f"x{i}").auction
    assert [b.bid_id for b in a.ladder] == ["x4", "x3", "x2"]
    assert a.highest_bid.bid_id == "x4" and a.bid_count == 5


def test_outbid_transition_reported():
    a = make_auction(ladder_size=2)
    a = place(a, "b0", BASE_PRICE, "x0").auction
    a = place(a, "b1", BASE_PRICE + STEP, "x1").auction
    r = place(a, "b2", BASE_PRICE + 2 * STEP, "x2")
    assert [(t.bid_id, t.new_status) for t in r.transitions] == [("x0", S.OUTBID)]
    assert r.rank == 1
    assert [b.bid_id for b in r.auction.ladder] == ["x2", "x1"]


def test_same_bidder_supersedes_own_bid():
    a = make_auction(ladder_size=3)
    a = place(a, "b0", BASE_PRICE, "x0").auction
    r = place(a, "b0", BASE_PRICE + STEP, "x1")
    assert [(t.bid_id, t.new_status) for t in r.transitions] == [("x0", S.SUPERSEDED)]
    assert [b.bid_id for b in r.auction.ladder] == ["x1"]


def test_rank_changes_reported():
    a = make_auction(ladder_size=3)
    a = place(a, "b0", BASE_PRICE, "x0").auction
    r = place(a, "b1", BASE_PRICE + STEP, "x1")
    ch = {c.bid_id: (c.old_rank, c.new_rank) for c in r.rank_changes}
    assert ch == {"x1": (None, 1), "x0": (1, 2)}


def test_invalid_ladder_size():
    with pytest.raises(ValueError):
        make_auction(ladder_size=0)


def test_input_auction_not_mutated():
    a = make_auction(ladder_size=2)
    place(a, "b0", BASE_PRICE, "x0")
    assert a.ladder == () and a.highest_bid is None
