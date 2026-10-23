"""Backwards compatibility adapter for auction_ladder.py (ADR-001 / TR-01)."""
from src.core.competition_ladder import (
    CompetitionLadder,
    IdempotencyConflict,
    LadderBid,
    LadderBidStatus,
    LadderEntry,
    LadderError,
    LadderOffer,
    LadderOfferStatus,
    LadderResult,
    RankChange,
    StatusTransition,
)

AuctionLadder = CompetitionLadder
