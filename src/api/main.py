"""FastAPI backend application for Parando Auction & Competition Ecosystem (ADR-001 through ADR-004)."""
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException, Header, Response, status
from fastapi.middleware.cors import CORSMiddleware

from src.api.schemas import (
    CommitmentProofRequest,
    CommitmentProofResponse,
    CompetitionResponse,
    CompetitionRulesSchema,
    CreateCompetitionRequest,
    LadderEntrySchema,
    OfferSchema,
    RankChangeSchema,
    StatusTransitionSchema,
    SubmitOfferRequest,
    SubmitOfferResponse,
)
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
    SubmitOfferResult,
    SystemClock,
    submit_offer,
)

app = FastAPI(
    title="Parando National Competition API (سامانه حراج و مزایده ملی پاراندو)",
    description="لایه ارتباطی و وب‌سرویس پلتفرم مزایده ملی بر پایه هسته معماری ADR-001 و ضمانت مالی ADR-002",
    version="2.0.0",
)

# Enable CORS for frontend applications (Port 3000 / National Network Intranet)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------
# In-Memory State Store (Thread-safe)
# --------------------------------------------------------------------------

class InMemoryCommitmentGuard(CommitmentGuard):
    def __init__(self):
        self._proofs: Dict[Tuple[str, str], CommitmentProof] = {}
        self._lock = threading.RLock()

    def set_proof(self, proof: CommitmentProof) -> None:
        with self._lock:
            self._proofs[(proof.offerer_id, proof.tenant_id)] = proof

    def get_proof(self, offerer_id: str, tenant_id: str) -> Optional[CommitmentProof]:
        with self._lock:
            return self._proofs.get((offerer_id, tenant_id))

    def list_proofs(self) -> List[CommitmentProof]:
        with self._lock:
            return list(self._proofs.values())


class CompetitionStore:
    def __init__(self):
        self._competitions: Dict[str, Competition] = {}
        self._seen_records: Dict[str, Tuple[SubmitOfferCommand, SubmitOfferResult]] = {}
        self._events: List[dict] = []
        self._lock = threading.RLock()

    def get(self, comp_id: str) -> Optional[Competition]:
        with self._lock:
            return self._competitions.get(comp_id)

    def set(self, comp: Competition) -> None:
        with self._lock:
            self._competitions[comp.competition_id] = comp

    def list_all(self) -> List[Competition]:
        with self._lock:
            return list(self._competitions.values())

    def get_seen_records(self) -> Dict[str, Tuple[SubmitOfferCommand, SubmitOfferResult]]:
        return self._seen_records

    def add_event(self, event: dict) -> None:
        with self._lock:
            self._events.insert(0, event)
            if len(self._events) > 200:
                self._events.pop()

    def list_events(self) -> List[dict]:
        with self._lock:
            return list(self._events)


guard = InMemoryCommitmentGuard()
store = CompetitionStore()
clock: Clock = SystemClock()


# Initialize default competitions & proofs
def _seed_data():
    now = datetime.now(timezone.utc)

    # 1. Gold Module
    rules_gold = CompetitionRules(base_price=42_500_000_000, min_increment=250_000_000, deposit_rate_bps=1500)
    comp_gold = Competition(
        competition_id="COMP-GOLD-001",
        tenant_id="tenant-gold-bourse",
        seller_id="central-bullion-vault",
        rules=rules_gold,
        starts_at=now - timedelta(minutes=15),
        ends_at=now + timedelta(hours=3),
        status=CompetitionStatus.ACTIVE,
        ladder_size=5,
    )
    store.set(comp_gold)

    # 2. Petrochem Module
    rules_petro = CompetitionRules(base_price=85_000_000_000, min_increment=500_000_000, deposit_rate_bps=1500)
    comp_petro = Competition(
        competition_id="COMP-PETRO-001",
        tenant_id="tenant-energy-bourse",
        seller_id="persian-petrochem-corp",
        rules=rules_petro,
        starts_at=now - timedelta(minutes=10),
        ends_at=now + timedelta(hours=2),
        status=CompetitionStatus.ACTIVE,
        ladder_size=4,
    )
    store.set(comp_petro)

    # Proofs
    guard.set_proof(
        CommitmentProof(
            offerer_id="offerer-alpha",
            tenant_id="tenant-gold-bourse",
            guaranteed_amount=200_000_000_000,
            valid_until=now + timedelta(days=2),
        )
    )
    guard.set_proof(
        CommitmentProof(
            offerer_id="offerer-beta",
            tenant_id="tenant-gold-bourse",
            guaranteed_amount=150_000_000_000,
            valid_until=now + timedelta(days=2),
        )
    )


_seed_data()


# --------------------------------------------------------------------------
# Serializers
# --------------------------------------------------------------------------

def _serialize_offer(o: Optional[Offer]) -> Optional[OfferSchema]:
    if not o:
        return None
    return OfferSchema(
        offer_id=o.offer_id,
        competition_id=o.competition_id,
        offerer_id=o.offerer_id,
        amount=o.amount,
        placed_at=o.placed_at,
        sequence=o.sequence,
        idempotency_key=o.idempotency_key,
    )


def _serialize_competition(c: Competition) -> CompetitionResponse:
    return CompetitionResponse(
        competition_id=c.competition_id,
        tenant_id=c.tenant_id,
        seller_id=c.seller_id,
        status=c.status.value,
        version=c.version,
        starts_at=c.starts_at,
        ends_at=c.ends_at,
        ladder_size=c.ladder_size,
        rules=CompetitionRulesSchema(
            base_price=c.rules.base_price,
            min_increment=c.rules.min_increment,
            deposit_rate_bps=c.rules.deposit_rate_bps,
            required_exposure=c.rules.required_exposure,
        ),
        highest_offer=_serialize_offer(c.highest_offer),
        offer_count=c.offer_count,
        ladder=[_serialize_offer(o) for o in c.ladder],
    )


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "ParandO Competition Kernel API",
        "kernel_conformance": ["ADR-001", "ADR-002", "TR-01", "TR-12", "TR-13"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/competitions", response_model=List[CompetitionResponse], tags=["Competitions"])
def list_competitions():
    return [_serialize_competition(c) for c in store.list_all()]


@app.post("/api/v1/competitions", response_model=CompetitionResponse, status_code=status.HTTP_201_CREATED, tags=["Competitions"])
def create_competition(req: CreateCompetitionRequest):
    if store.get(req.competition_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Competition '{req.competition_id}' already exists",
        )

    now = datetime.now(timezone.utc)
    rules = CompetitionRules(
        base_price=req.base_price,
        min_increment=req.min_increment,
        deposit_rate_bps=req.deposit_rate_bps,
    )
    comp = Competition(
        competition_id=req.competition_id,
        tenant_id=req.tenant_id,
        seller_id=req.seller_id,
        rules=rules,
        starts_at=now,
        ends_at=now + timedelta(minutes=req.duration_minutes),
        status=CompetitionStatus.ACTIVE,
        ladder_size=req.ladder_size,
    )
    store.set(comp)
    return _serialize_competition(comp)


@app.get("/api/v1/competitions/{competition_id}", response_model=CompetitionResponse, tags=["Competitions"])
def get_competition(competition_id: str):
    comp = store.get(competition_id)
    if not comp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Competition '{competition_id}' not found",
        )
    return _serialize_competition(comp)


@app.get("/api/v1/competitions/{competition_id}/ladder", response_model=List[LadderEntrySchema], tags=["Competitions"])
def get_competition_ladder(competition_id: str):
    comp = store.get(competition_id)
    if not comp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Competition '{competition_id}' not found",
        )
    return [
        LadderEntrySchema(rank=i + 1, offer=_serialize_offer(o))
        for i, o in enumerate(comp.ladder)
    ]


@app.post("/api/v1/competitions/{competition_id}/offers", response_model=SubmitOfferResponse, tags=["Offers"])
def submit_competition_offer(
    competition_id: str,
    req: SubmitOfferRequest,
    response: Response,
    idempotency_key_header: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    comp = store.get(competition_id)
    if not comp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Competition '{competition_id}' not found",
        )

    # Use header key if provided, else body key
    idem_key = idempotency_key_header or req.idempotency_key
    offer_id = req.offer_id or f"off-{uuid.uuid4().hex[:8]}"

    offerer = Offerer(
        offerer_id=req.offerer_id,
        tenant_id=req.tenant_id,
        is_eligible=True,
    )

    cmd = SubmitOfferCommand(
        competition_id=competition_id,
        offerer=offerer,
        amount=req.amount,
        offer_id=offer_id,
        idempotency_key=idem_key,
        expected_version=req.expected_version,
    )

    seen = store.get_seen_records()
    is_replay = False

    # Check TR-12 Idempotency
    if idem_key in seen:
        recorded_cmd, recorded_res = seen[idem_key]
        if (
            recorded_cmd.competition_id == cmd.competition_id
            and recorded_cmd.offerer.offerer_id == cmd.offerer.offerer_id
            and recorded_cmd.amount == cmd.amount
        ):
            # Identical payload: replay previous result
            is_replay = True
            response.headers["X-Idempotency-Replay"] = "true"
            res = recorded_res
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"OFFER_CONFLICT: Idempotency key '{idem_key}' reused with conflicting payload (TR-12)",
            )
    else:
        try:
            res = submit_offer(comp, cmd, guard, clock, seen)
            store.set(res.competition)
        except OfferBelowMinimum as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"OFFER_BELOW_MINIMUM: {str(e)}")
        except OfferIncrementTooSmall as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"OFFER_INCREMENT_TOO_SMALL: {str(e)}")
        except InvalidAmount as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"INVALID_AMOUNT: {str(e)}")
        except SellerCannotOffer:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SELLER_CANNOT_OFFER: Seller cannot participate in own auction")
        except OffererNotEligible as e:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"OFFERER_NOT_ELIGIBLE: {str(e)}")
        except InsufficientCommitment as e:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=f"INSUFFICIENT_COMMITMENT: {str(e)}")
        except StaleCompetitionVersion as e:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"STALE_COMPETITION_VERSION: {str(e)}")
        except (CompetitionNotActive, CompetitionNotStarted, CompetitionEnded) as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"COMPETITION_NOT_ACTIVE: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    # Audit event record
    store.add_event({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "competition_id": competition_id,
        "offerer_id": req.offerer_id,
        "amount": req.amount,
        "rank": res.rank,
        "is_replay": is_replay,
        "idempotency_key": idem_key,
    })

    return SubmitOfferResponse(
        success=True,
        competition_id=competition_id,
        rank=res.rank,
        offer=_serialize_offer(res.offer),
        version=res.competition.version,
        required_exposure=res.required_exposure,
        guaranteed_amount=res.guaranteed_amount,
        is_duplicate_replay=is_replay,
        transitions=[
            StatusTransitionSchema(
                offer_id=t.offer_id,
                offerer_id=t.offerer_id,
                new_status=t.new_status.value,
                previous_rank=t.previous_rank,
                reason=t.reason,
            )
            for t in res.transitions
        ],
        rank_changes=[
            RankChangeSchema(
                offer_id=rc.offer_id,
                offerer_id=rc.offerer_id,
                old_rank=rc.old_rank,
                new_rank=rc.new_rank,
            )
            for rc in res.rank_changes
        ],
    )


@app.post("/api/v1/proofs", response_model=CommitmentProofResponse, tags=["Commitment Guard"])
def register_commitment_proof(req: CommitmentProofRequest):
    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(hours=req.valid_hours)
    proof = CommitmentProof(
        offerer_id=req.offerer_id,
        tenant_id=req.tenant_id,
        guaranteed_amount=req.guaranteed_amount,
        valid_until=valid_until,
    )
    guard.set_proof(proof)
    return CommitmentProofResponse(
        offerer_id=proof.offerer_id,
        tenant_id=proof.tenant_id,
        guaranteed_amount=proof.guaranteed_amount,
        valid_until=proof.valid_until,
        is_active=True,
    )


@app.get("/api/v1/proofs/{offerer_id}", response_model=List[CommitmentProofResponse], tags=["Commitment Guard"])
def get_offerer_proofs(offerer_id: str):
    all_proofs = guard.list_proofs()
    now = datetime.now(timezone.utc)
    matched = [p for p in all_proofs if p.offerer_id == offerer_id]
    return [
        CommitmentProofResponse(
            offerer_id=p.offerer_id,
            tenant_id=p.tenant_id,
            guaranteed_amount=p.guaranteed_amount,
            valid_until=p.valid_until,
            is_active=p.valid_until > now,
        )
        for p in matched
    ]


@app.get("/api/v1/events", tags=["Audit Log"])
def get_audit_events():
    return store.list_events()
