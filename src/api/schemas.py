"""Pydantic schemas for Parando FastAPI backend layer (ADR-001 / TR-01 / TR-12 / TR-13)."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class CompetitionRulesSchema(BaseModel):
    base_price: int = Field(..., gt=0, description="Base starting price in Rial")
    min_increment: int = Field(..., gt=0, description="Minimum step above leader in Rial")
    deposit_rate_bps: int = Field(1500, ge=0, le=10000, description="Deposit rate in basis points (15% = 1500)")
    required_exposure: Optional[int] = Field(None, description="Computed 15% required exposure deposit")


class CreateCompetitionRequest(BaseModel):
    competition_id: str = Field(..., min_length=2)
    tenant_id: str = Field(..., min_length=2)
    seller_id: str = Field(..., min_length=2)
    base_price: int = Field(..., gt=0)
    min_increment: int = Field(..., gt=0)
    deposit_rate_bps: int = Field(1500, ge=0, le=10000)
    ladder_size: int = Field(3, ge=1)
    duration_minutes: int = Field(120, gt=0)


class OfferSchema(BaseModel):
    offer_id: str
    competition_id: str
    offerer_id: str
    amount: int
    placed_at: datetime
    sequence: int
    idempotency_key: str


class LadderEntrySchema(BaseModel):
    rank: int
    offer: OfferSchema


class StatusTransitionSchema(BaseModel):
    offer_id: str
    offerer_id: str
    new_status: str
    previous_rank: Optional[int] = None
    reason: str


class RankChangeSchema(BaseModel):
    offer_id: str
    offerer_id: str
    old_rank: Optional[int] = None
    new_rank: int


class SubmitOfferRequest(BaseModel):
    offerer_id: str = Field(..., min_length=1, description="Unique offerer participant identifier")
    tenant_id: str = Field(..., min_length=1, description="Tenant domain isolation identifier")
    amount: int = Field(..., gt=0, description="Offer amount in integer Rial")
    offer_id: Optional[str] = Field(None, description="Optional custom client offer identifier")
    idempotency_key: str = Field(..., min_length=1, description="TR-12 Unique idempotency token")
    expected_version: Optional[int] = Field(None, description="Optional optimistic concurrency lock token")


class SubmitOfferResponse(BaseModel):
    success: bool = True
    competition_id: str
    rank: int
    offer: OfferSchema
    version: int
    required_exposure: int
    guaranteed_amount: int
    is_duplicate_replay: bool = False
    transitions: List[StatusTransitionSchema] = []
    rank_changes: List[RankChangeSchema] = []


class CompetitionResponse(BaseModel):
    competition_id: str
    tenant_id: str
    seller_id: str
    status: str
    version: int
    starts_at: datetime
    ends_at: datetime
    ladder_size: int
    rules: CompetitionRulesSchema
    highest_offer: Optional[OfferSchema] = None
    offer_count: int
    ladder: List[OfferSchema]


class CommitmentProofRequest(BaseModel):
    offerer_id: str
    tenant_id: str
    guaranteed_amount: int = Field(..., gt=0)
    valid_hours: int = Field(24, gt=0)


class CommitmentProofResponse(BaseModel):
    offerer_id: str
    tenant_id: str
    guaranteed_amount: int
    valid_until: datetime
    is_active: bool


class ErrorResponse(BaseModel):
    error_code: str
    detail: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class CommissionBreakdown(BaseModel):
    clearing_price: int
    commission_bps: int = 50  # 50 bps = 0.50%
    platform_commission: int
    vat_rate_pct: int = 10  # 10% VAT on commission
    vat_amount: int
    total_deductions: int
    net_seller_payout: int


class ReleasedHold(BaseModel):
    offerer_id: str
    tenant_id: str
    held_amount: int
    released_at: datetime
    reason: str = "Outbid in final ladder determination"


class SettlementVoucher(BaseModel):
    voucher_id: str
    competition_id: str
    winner_id: Optional[str]
    clearing_price: int
    settled_at: datetime
    commission: CommissionBreakdown
    released_holds: List[ReleasedHold]
    integrity_hash: str


class SettlementResponse(BaseModel):
    success: bool = True
    status: str
    event_type: str = "ladder.determined"
    voucher: SettlementVoucher

