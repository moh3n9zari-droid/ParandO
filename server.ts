// In tsx/Node 22 environments, tsx defines global.__dirname as '.' which causes
// ESM packages like vite-plugin-pwa (using createRequire(_dirname)) to fail.
if ((globalThis as any).__dirname === '.') {
  delete (globalThis as any).__dirname;
}
if ((globalThis as any).__filename === '.') {
  delete (globalThis as any).__filename;
}

import express from 'express';
import http from 'http';
import net from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import crypto from 'crypto';
import {
  Competition,
  CompetitionRules,
  CompetitionStatus,
  Offerer,
  CommitmentGuard,
  CommitmentProof,
  SystemClock,
  submitOffer,
  SubmitOfferCommand,
  SubmitOfferResult,
  CompetitionError,
  OfferBelowMinimum,
  OfferIncrementTooSmall,
  InvalidAmount,
  SellerCannotOffer,
  OffererNotEligible,
  InsufficientCommitment,
  StaleCompetitionVersion,
  CompetitionNotActive,
  CompetitionNotStarted,
  CompetitionEnded,
  Offer,
} from './src/core/competition_kernel';
import { MARKET_MODULES } from './src/data/market_modules';
import {
  authenticateRequest,
  requireAuth,
  requireRole,
  verifyToken,
  AuthenticatedPrincipal,
  UserRole,
} from './src/auth/auth_service';


// ---------------------------------------------------------------------------
// In-Memory State
// ---------------------------------------------------------------------------

const competitionsMap = new Map<string, Competition>();
const proofsMap = new Map<string, CommitmentProof>();
const seenRecordsMap = new Map<string, { command: SubmitOfferCommand; result: SubmitOfferResult }>();
const auditEvents: Array<{
  timestamp: string;
  competition_id?: string;
  offerer_id?: string;
  amount?: number;
  rank?: number;
  is_replay?: boolean;
  idempotency_key?: string;
  event_type?: string;
  winner_id?: string | null;
  clearing_price?: number;
  voucher_id?: string;
  status?: string;
  [key: string]: any;
}> = [];

const clock = new SystemClock();

const guard: CommitmentGuard = {
  getProof(offererId: string, tenantId: string): CommitmentProof | null {
    const key = `${offererId}:${tenantId}`;
    return proofsMap.get(key) || null;
  },
};

// Seed initial competitions & proofs
function seedData() {
  const now = new Date();

  // 1. Gold Module
  const rulesGold = new CompetitionRules(42_500_000_000, 250_000_000, 1500);
  const compGold = new Competition({
    competitionId: 'COMP-GOLD-001',
    tenantId: 'tenant-gold-bourse',
    sellerId: 'central-bullion-vault',
    rules: rulesGold,
    startsAt: new Date(now.getTime() - 15 * 60 * 1000),
    endsAt: new Date(now.getTime() + 3 * 3600 * 1000),
    status: CompetitionStatus.ACTIVE,
    ladderSize: 5,
  });
  competitionsMap.set(compGold.competitionId, compGold);

  // 2. Petrochem Module
  const rulesPetro = new CompetitionRules(85_000_000_000, 500_000_000, 1500);
  const compPetro = new Competition({
    competitionId: 'COMP-PETRO-001',
    tenantId: 'tenant-energy-bourse',
    sellerId: 'persian-petrochem-corp',
    rules: rulesPetro,
    startsAt: new Date(now.getTime() - 10 * 60 * 1000),
    endsAt: new Date(now.getTime() + 2 * 3600 * 1000),
    status: CompetitionStatus.ACTIVE,
    ladderSize: 4,
  });
  competitionsMap.set(compPetro.competitionId, compPetro);

  // Seed default market modules if not already loaded
  for (const mod of MARKET_MODULES) {
    const cid = `COMP-${mod.id.toUpperCase()}-001`;
    if (!competitionsMap.has(cid)) {
      const comp = new Competition({
        competitionId: cid,
        tenantId: mod.tenantId,
        sellerId: mod.sellerId,
        rules: new CompetitionRules(mod.basePrice, mod.minIncrement, mod.depositRateBps),
        startsAt: new Date(now.getTime() - 15 * 60 * 1000),
        endsAt: new Date(now.getTime() + mod.durationMinutes * 60 * 1000),
        status: CompetitionStatus.ACTIVE,
        ladderSize: mod.ladderSize,
      });
      competitionsMap.set(cid, comp);
    }
  }

  // Proofs
  const p1: CommitmentProof = {
    offererId: 'offerer-alpha',
    tenantId: 'tenant-gold-bourse',
    guaranteedAmount: 200_000_000_000,
    validUntil: new Date(now.getTime() + 48 * 3600 * 1000),
  };
  proofsMap.set(`${p1.offererId}:${p1.tenantId}`, p1);

  const p2: CommitmentProof = {
    offererId: 'offerer-beta',
    tenantId: 'tenant-gold-bourse',
    guaranteedAmount: 150_000_000_000,
    validUntil: new Date(now.getTime() + 48 * 3600 * 1000),
  };
  proofsMap.set(`${p2.offererId}:${p2.tenantId}`, p2);
}

seedData();

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeOffer(o: Offer | null) {
  if (!o) return null;
  return {
    offer_id: o.offerId,
    competition_id: o.competitionId,
    offerer_id: o.offererId,
    amount: o.amount,
    placed_at: o.placedAt.toISOString(),
    sequence: o.sequence,
    idempotency_key: o.idempotencyKey,
  };
}

function serializeCompetition(c: Competition) {
  return {
    competition_id: c.competitionId,
    tenant_id: c.tenantId,
    seller_id: c.sellerId,
    status: c.status,
    version: c.version,
    starts_at: c.startsAt.toISOString(),
    ends_at: c.endsAt.toISOString(),
    ladder_size: c.ladderSize,
    rules: {
      base_price: c.rules.basePrice,
      min_increment: c.rules.minIncrement,
      deposit_rate_bps: c.rules.depositRateBps,
      required_exposure: c.rules.requiredExposure,
    },
    highest_offer: serializeOffer(c.highestOffer),
    offer_count: c.offerCount,
    ladder: c.ladder.map(serializeOffer),
  };
}

// ---------------------------------------------------------------------------
// Server Bootstrap
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(authenticateRequest);

  // Helper: Log security alerts without leaking secrets or tokens
  function auditSecurityAlert(alert: {
    sub_type: string;
    reason: string;
    path: string;
    method: string;
    principal_id?: string | null;
    tenant_id?: string | null;
  }) {
    auditEvents.unshift({
      timestamp: new Date().toISOString(),
      event_type: 'SECURITY_ALERT',
      sub_type: alert.sub_type,
      reason: alert.reason,
      path: alert.path,
      method: alert.method,
      principal_id: alert.principal_id || null,
      tenant_id: alert.tenant_id || null,
    });
    if (auditEvents.length > 200) auditEvents.pop();
  }

  // Health check API (/health and /api/v1/health) - Preserved Public
  const handleHealth = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'healthy',
      service: 'parando-auction-ecosystem',
      standards: ['ADR-001', 'ADR-002', 'ADR-003', 'ADR-004'],
      kernel_conformance: ['ADR-001', 'ADR-002', 'TR-01', 'TR-12', 'TR-13'],
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/health', handleHealth);
  app.get('/api/v1/health', handleHealth);

  // Competitions REST API - Preserved Public Read-Only
  app.get('/api/v1/competitions', (_req, res) => {
    const list = Array.from(competitionsMap.values()).map(serializeCompetition);
    res.json(list);
  });

  // Create Competition - Sensitive: Restricted to SELLER or EXCHANGE_ADMIN
  app.post(
    '/api/v1/competitions',
    requireAuth,
    requireRole(['SELLER', 'EXCHANGE_ADMIN']),
    (req, res) => {
      const {
        competition_id,
        tenant_id,
        seller_id,
        base_price,
        min_increment,
        deposit_rate_bps,
        duration_minutes,
        ladder_size,
      } = req.body;

      const principal = req.principal!;

      // Tenant isolation check
      if (principal.tenantId !== tenant_id) {
        auditSecurityAlert({
          sub_type: 'TENANT_MISMATCH',
          reason: `Principal tenant '${principal.tenantId}' does not match target tenant '${tenant_id}'`,
          path: req.path,
          method: req.method,
          principal_id: principal.userId,
          tenant_id: principal.tenantId,
        });
        res.status(403).json({
          error: 'FORBIDDEN',
          detail: `TENANT_MISMATCH: Authenticated tenant '${principal.tenantId}' does not match competition tenant '${tenant_id}'`,
        });
        return;
      }

      // Ownership check: Non-admin sellers can only create competitions under their own identity
      if (principal.roles.includes('SELLER') && !principal.roles.includes('EXCHANGE_ADMIN')) {
        if (principal.userId !== seller_id) {
          auditSecurityAlert({
            sub_type: 'OWNERSHIP_MISMATCH',
            reason: `Seller principal '${principal.userId}' attempted to create competition under '${seller_id}'`,
            path: req.path,
            method: req.method,
            principal_id: principal.userId,
            tenant_id: principal.tenantId,
          });
          res.status(403).json({
            error: 'FORBIDDEN',
            detail: `OWNERSHIP_MISMATCH: Seller can only create competitions under their own verified identity '${principal.userId}'`,
          });
          return;
        }
      }

      if (competitionsMap.has(competition_id)) {
        res.status(409).json({ detail: `Competition '${competition_id}' already exists` });
        return;
      }

      const now = new Date();
      const rules = new CompetitionRules(base_price, min_increment, deposit_rate_bps);
      const comp = new Competition({
        competitionId: competition_id,
        tenantId: tenant_id,
        sellerId: seller_id,
        rules,
        startsAt: now,
        endsAt: new Date(now.getTime() + (duration_minutes || 60) * 60 * 1000),
        status: CompetitionStatus.ACTIVE,
        ladderSize: ladder_size || 5,
      });
      competitionsMap.set(comp.competitionId, comp);
      res.status(201).json(serializeCompetition(comp));
    }
  );

  // Single competition details & ladder - Preserved Public Read-Only
  app.get('/api/v1/competitions/:competition_id', (req, res) => {
    const comp = competitionsMap.get(req.params.competition_id);
    if (!comp) {
      res.status(404).json({ detail: `Competition '${req.params.competition_id}' not found` });
      return;
    }
    res.json(serializeCompetition(comp));
  });

  app.get('/api/v1/competitions/:competition_id/ladder', (req, res) => {
    const comp = competitionsMap.get(req.params.competition_id);
    if (!comp) {
      res.status(404).json({ detail: `Competition '${req.params.competition_id}' not found` });
      return;
    }
    const ladder = comp.ladder.map((o, idx) => ({
      rank: idx + 1,
      offer: serializeOffer(o),
    }));
    res.json(ladder);
  });

  // Submit Offer (with Server-Enforced Auth, Role, Tenant Isolation, Ownership & TR-12)
  app.post('/api/v1/competitions/:competition_id/offers', requireAuth, (req, res) => {
    const compId = req.params.competition_id;
    const comp = competitionsMap.get(compId);
    if (!comp) {
      res.status(404).json({ detail: `Competition '${compId}' not found` });
      return;
    }

    const principal = req.principal!;

    // 1. Role Authorization: Must have OFFERER role
    if (!principal.roles.includes('OFFERER')) {
      auditSecurityAlert({
        sub_type: 'UNAUTHORIZED_ROLE',
        reason: `Principal '${principal.userId}' lacks OFFERER role to place offers`,
        path: req.path,
        method: req.method,
        principal_id: principal.userId,
        tenant_id: principal.tenantId,
      });
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: 'INSUFFICIENT_PERMISSIONS: Offerer role required to submit offers',
      });
      return;
    }

    // 2. Server-verified Eligibility check: Client-supplied isEligible is NEVER trusted
    if (!principal.isEligible) {
      auditSecurityAlert({
        sub_type: 'INELIGIBLE_OFFERER',
        reason: `Principal '${principal.userId}' is marked not eligible on server`,
        path: req.path,
        method: req.method,
        principal_id: principal.userId,
        tenant_id: principal.tenantId,
      });
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: 'OFFERER_NOT_ELIGIBLE: Offerer is not eligible to participate in competitions',
      });
      return;
    }

    // 3. Tenant Isolation: Offerer tenant must strictly match competition tenant
    if (principal.tenantId !== comp.tenantId) {
      auditSecurityAlert({
        sub_type: 'TENANT_MISMATCH',
        reason: `Offerer tenant '${principal.tenantId}' does not match competition tenant '${comp.tenantId}'`,
        path: req.path,
        method: req.method,
        principal_id: principal.userId,
        tenant_id: principal.tenantId,
      });
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: `TENANT_MISMATCH: Offerer tenant '${principal.tenantId}' cannot participate in competition tenant '${comp.tenantId}'`,
      });
      return;
    }

    // 4. Ownership & Identity Spoofing Protection:
    // If client supplied offerer_id or tenant_id, reject if mismatched
    if (req.body.offerer_id && req.body.offerer_id !== principal.userId) {
      auditSecurityAlert({
        sub_type: 'IDENTITY_SPOOFING_ATTEMPT',
        reason: `Client offerer_id '${req.body.offerer_id}' mismatched principal '${principal.userId}'`,
        path: req.path,
        method: req.method,
        principal_id: principal.userId,
        tenant_id: principal.tenantId,
      });
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: `IDENTITY_MISMATCH: Client-supplied offerer_id '${req.body.offerer_id}' does not match authenticated principal '${principal.userId}'`,
      });
      return;
    }

    if (req.body.tenant_id && req.body.tenant_id !== principal.tenantId) {
      auditSecurityAlert({
        sub_type: 'TENANT_SPOOFING_ATTEMPT',
        reason: `Client tenant_id '${req.body.tenant_id}' mismatched principal '${principal.tenantId}'`,
        path: req.path,
        method: req.method,
        principal_id: principal.userId,
        tenant_id: principal.tenantId,
      });
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: 'TENANT_MISMATCH: Client-supplied tenant_id does not match authenticated principal',
      });
      return;
    }

    // 5. Build Offerer strictly from server-verified principal
    const offerer: Offerer = {
      offererId: principal.userId,
      tenantId: principal.tenantId,
      isEligible: principal.isEligible,
    };

    const headerKey = req.headers['idempotency-key'] as string | undefined;
    const idemKey = headerKey || req.body.idempotency_key;
    const offerId = req.body.offer_id || `off-${crypto.randomUUID().slice(0, 8)}`;

    const cmd: SubmitOfferCommand = {
      competitionId: compId,
      offerer,
      amount: req.body.amount,
      offerId,
      idempotencyKey: idemKey,
      expectedVersion: req.body.expected_version,
    };

    let result: SubmitOfferResult;
    let isReplay = false;

    if (seenRecordsMap.has(idemKey)) {
      const recorded = seenRecordsMap.get(idemKey)!;
      if (
        recorded.command.competitionId === cmd.competitionId &&
        recorded.command.offerer.offererId === cmd.offerer.offererId &&
        recorded.command.amount === cmd.amount
      ) {
        isReplay = true;
        res.setHeader('X-Idempotency-Replay', 'true');
        result = recorded.result;
      } else {
        res.status(409).json({
          detail: `OFFER_CONFLICT: Idempotency key '${idemKey}' reused with conflicting payload (TR-12)`,
        });
        return;
      }
    } else {
      try {
        result = submitOffer(comp, cmd, guard, clock, seenRecordsMap);
        competitionsMap.set(compId, result.competition);
      } catch (err: any) {
        if (err instanceof OfferBelowMinimum) {
          res.status(400).json({ detail: `OFFER_BELOW_MINIMUM: ${err.message}` });
        } else if (err instanceof OfferIncrementTooSmall) {
          res.status(400).json({ detail: `OFFER_INCREMENT_TOO_SMALL: ${err.message}` });
        } else if (err instanceof InvalidAmount) {
          res.status(400).json({ detail: `INVALID_AMOUNT: ${err.message}` });
        } else if (err instanceof SellerCannotOffer) {
          res.status(403).json({ detail: 'SELLER_CANNOT_OFFER: Seller cannot participate in own auction' });
        } else if (err instanceof OffererNotEligible) {
          res.status(403).json({ detail: `OFFERER_NOT_ELIGIBLE: ${err.message}` });
        } else if (err instanceof InsufficientCommitment) {
          res.status(402).json({ detail: `INSUFFICIENT_COMMITMENT: ${err.message}` });
        } else if (err instanceof StaleCompetitionVersion) {
          res.status(409).json({ detail: `STALE_COMPETITION_VERSION: ${err.message}` });
        } else if (
          err instanceof CompetitionNotActive ||
          err instanceof CompetitionNotStarted ||
          err instanceof CompetitionEnded
        ) {
          res.status(400).json({ detail: `COMPETITION_NOT_ACTIVE: ${err.message}` });
        } else {
          res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', detail: 'An unexpected processing error occurred' });
        }
        return;
      }
    }

    // Record audit event with tenant scoping
    auditEvents.unshift({
      timestamp: new Date().toISOString(),
      competition_id: compId,
      tenant_id: comp.tenantId,
      offerer_id: principal.userId,
      amount: req.body.amount,
      rank: result.rank,
      is_replay: isReplay,
      idempotency_key: idemKey,
    });
    if (auditEvents.length > 200) auditEvents.pop();

    // Broadcast live ladder update (scoped to competition and tenant)
    broadcastToCompetition(compId, comp.tenantId, {
      type: 'ladder.update',
      competition_id: compId,
      tenant_id: comp.tenantId,
      version: result.competition.version,
      rank: result.rank,
      new_offer: serializeOffer(result.offer),
      ladder: result.competition.ladder.map(serializeOffer),
      highest_offer: serializeOffer(result.competition.highestOffer),
      server_time: new Date().toISOString(),
    });

    res.json({
      success: true,
      competition_id: compId,
      rank: result.rank,
      offer: serializeOffer(result.offer),
      version: result.competition.version,
      required_exposure: result.requiredExposure,
      guaranteed_amount: result.guaranteedAmount,
      is_duplicate_replay: isReplay,
      transitions: result.transitions.map((t) => ({
        offer_id: t.offerId,
        offerer_id: t.offererId,
        new_status: t.newStatus,
        previous_rank: t.previousRank,
        reason: t.reason,
      })),
      rank_changes: result.rankChanges.map((rc) => ({
        offer_id: rc.offerId,
        offerer_id: rc.offererId,
        old_rank: rc.oldRank,
        new_rank: rc.newRank,
      })),
    });
  });

  // Proofs API - Restricted to EXCHANGE_ADMIN
  app.post(
    '/api/v1/proofs',
    requireAuth,
    requireRole(['EXCHANGE_ADMIN']),
    (req, res) => {
      const { offerer_id, tenant_id, guaranteed_amount, valid_hours } = req.body;
      const principal = req.principal!;

      // Tenant isolation: Admin can only issue proofs within their own tenant
      if (principal.tenantId !== tenant_id) {
        auditSecurityAlert({
          sub_type: 'TENANT_MISMATCH',
          reason: `Admin tenant '${principal.tenantId}' cannot issue proof for tenant '${tenant_id}'`,
          path: req.path,
          method: req.method,
          principal_id: principal.userId,
          tenant_id: principal.tenantId,
        });
        res.status(403).json({
          error: 'FORBIDDEN',
          detail: `TENANT_MISMATCH: Administrator tenant '${principal.tenantId}' cannot issue proofs for tenant '${tenant_id}'`,
        });
        return;
      }

      const now = new Date();
      const validUntil = new Date(now.getTime() + (valid_hours || 48) * 3600 * 1000);
      const proof: CommitmentProof = {
        offererId: offerer_id,
        tenantId: tenant_id,
        guaranteedAmount: guaranteed_amount,
        validUntil,
      };
      proofsMap.set(`${offerer_id}:${tenant_id}`, proof);
      res.json({
        offerer_id: proof.offererId,
        tenant_id: proof.tenantId,
        guaranteed_amount: proof.guaranteedAmount,
        valid_until: proof.validUntil.toISOString(),
        is_active: true,
      });
    }
  );

  // Proofs Inspection - Scope-limited & Ownership enforced
  app.get('/api/v1/proofs/:offerer_id', requireAuth, (req, res) => {
    const requestedOffererId = req.params.offerer_id;
    const principal = req.principal!;

    const isAdminOrAuditor =
      principal.roles.includes('EXCHANGE_ADMIN') || principal.roles.includes('AUDITOR');

    // Ownership check: If not admin/auditor, user can ONLY read their own proof
    if (!isAdminOrAuditor && principal.userId !== requestedOffererId) {
      auditSecurityAlert({
        sub_type: 'UNAUTHORIZED_PROOF_READ',
        reason: `Principal '${principal.userId}' attempted to read proofs of '${requestedOffererId}'`,
        path: req.path,
        method: req.method,
        principal_id: principal.userId,
        tenant_id: principal.tenantId,
      });
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: 'ACCESS_DENIED: Cannot view financial commitment proofs of other participants',
      });
      return;
    }

    // Tenant isolation: Only return proofs matching the principal's tenant
    const matched = Array.from(proofsMap.values()).filter(
      (p) => p.offererId === requestedOffererId && p.tenantId === principal.tenantId
    );
    const now = new Date();
    res.json(
      matched.map((p) => ({
        offerer_id: p.offererId,
        tenant_id: p.tenantId,
        guaranteed_amount: p.guaranteedAmount,
        valid_until: p.validUntil.toISOString(),
        is_active: p.validUntil > now,
      }))
    );
  });

  // Audit Events API - Restricted to AUDITOR or EXCHANGE_ADMIN, Tenant-Scoped
  app.get(
    '/api/v1/events',
    requireAuth,
    requireRole(['AUDITOR', 'EXCHANGE_ADMIN']),
    (req, res) => {
      const principal = req.principal!;

      // Scope-limited read: Only return events relevant to the principal's tenant
      const scopedEvents = auditEvents.filter((e) => {
        if (!e.tenant_id) return true; // generic system events
        return e.tenant_id === principal.tenantId;
      });

      res.json(scopedEvents);
    }
  );

  // Settle Competition (ADR-003) - Restricted to EXCHANGE_ADMIN or verified SELLER of matching tenant
  app.post('/api/v1/competitions/:competition_id/settle', requireAuth, (req, res) => {
    const compId = req.params.competition_id;
    const comp = competitionsMap.get(compId);
    if (!comp) {
      res.status(404).json({ detail: `Competition '${compId}' not found` });
      return;
    }

    const principal = req.principal!;

    // 1. Tenant Isolation: Principal tenant must match competition tenant
    if (principal.tenantId !== comp.tenantId) {
      auditSecurityAlert({
        sub_type: 'TENANT_MISMATCH_SETTLE',
        reason: `Principal tenant '${principal.tenantId}' cannot settle competition in tenant '${comp.tenantId}'`,
        path: req.path,
        method: req.method,
        principal_id: principal.userId,
        tenant_id: principal.tenantId,
      });
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: `TENANT_MISMATCH: Principal tenant '${principal.tenantId}' cannot settle competition belonging to '${comp.tenantId}'`,
      });
      return;
    }

    // 2. Role & Ownership check: Must be EXCHANGE_ADMIN of that tenant, or the verified SELLER of that competition
    const isTenantAdmin = principal.roles.includes('EXCHANGE_ADMIN');
    const isCompetitionSeller =
      principal.roles.includes('SELLER') && principal.userId === comp.sellerId;

    if (!isTenantAdmin && !isCompetitionSeller) {
      auditSecurityAlert({
        sub_type: 'UNAUTHORIZED_SETTLEMENT_ATTEMPT',
        reason: `Principal '${principal.userId}' is not authorized to settle competition '${compId}'`,
        path: req.path,
        method: req.method,
        principal_id: principal.userId,
        tenant_id: principal.tenantId,
      });
      res.status(403).json({
        error: 'FORBIDDEN',
        detail: `INSUFFICIENT_PERMISSIONS: Not authorized to settle competition '${compId}'. Must be exchange administrator or competition seller.`,
      });
      return;
    }

    const now = new Date();
    const winner = comp.highestOffer;
    const clearingPrice = winner ? winner.amount : 0;
    const winnerId = winner ? winner.offererId : null;

    // 50 bps commission (0.50%)
    const commissionBps = 50;
    const platformCommission = Math.floor((clearingPrice * commissionBps) / 10000);

    // 10% VAT on platform fee
    const vatRatePct = 10;
    const vatAmount = Math.floor((platformCommission * vatRatePct) / 100);

    const totalDeductions = platformCommission + vatAmount;
    const netSellerPayout = clearingPrice - totalDeductions;

    // Compute released holds for outbid participants
    const outbidOffererIds = new Set(
      auditEvents
        .filter((e) => e.competition_id === compId && e.offerer_id && e.offerer_id !== winnerId)
        .map((e) => e.offerer_id!)
    );

    const depositRateBps = comp.rules.depositRateBps;
    const releasedHolds = Array.from(outbidOffererIds).map((oId) => {
      const maxBid = Math.max(
        ...auditEvents
          .filter((e) => e.competition_id === compId && e.offerer_id === oId)
          .map((e) => e.amount || 0),
        0
      );
      const heldAmt = Math.ceil((maxBid * depositRateBps) / 10000);
      return {
        offerer_id: oId,
        tenant_id: comp.tenantId,
        held_amount: heldAmt,
        released_at: now.toISOString(),
        reason: 'Outbid in final ladder determination (escrow.hold.released)',
      };
    });

    // Mark competition closed/ended
    const settledComp = new Competition({
      competitionId: comp.competitionId,
      tenantId: comp.tenantId,
      sellerId: comp.sellerId,
      rules: comp.rules,
      startsAt: comp.startsAt,
      endsAt: comp.endsAt,
      status: CompetitionStatus.CLOSED,
      ladderSize: comp.ladderSize,
      ladder: comp.ladder,
      version: comp.version + 1,
      highestOffer: comp.highestOffer,
      offerCount: comp.offerCount,
    });
    competitionsMap.set(compId, settledComp);

    // Deterministic SHA-256 voucher
    const voucherId = `VCH-${compId}-${Math.floor(now.getTime() / 1000)}`;
    const rawHash = `${voucherId}:${compId}:${winnerId}:${clearingPrice}:${now.toISOString()}`;
    const integrityHash = crypto.createHash('sha256').update(rawHash).digest('hex');

    const voucher = {
      voucher_id: voucherId,
      competition_id: compId,
      winner_id: winnerId,
      clearing_price: clearingPrice,
      settled_at: now.toISOString(),
      commission: {
        clearing_price: clearingPrice,
        commission_bps: commissionBps,
        platform_commission: platformCommission,
        vat_rate_pct: vatRatePct,
        vat_amount: vatAmount,
        total_deductions: totalDeductions,
        net_seller_payout: netSellerPayout,
      },
      released_holds: releasedHolds,
      integrity_hash: integrityHash,
    };

    auditEvents.unshift({
      timestamp: now.toISOString(),
      event_type: 'ladder.determined',
      competition_id: compId,
      tenant_id: comp.tenantId,
      winner_id: winnerId,
      clearing_price: clearingPrice,
      voucher_id: voucherId,
      status: 'SETTLED',
    });

    broadcastToCompetition(compId, comp.tenantId, {
      type: 'ladder.determined',
      competition_id: compId,
      tenant_id: comp.tenantId,
      winner_id: winnerId,
      clearing_price: clearingPrice,
      voucher_id: voucherId,
      integrity_hash: integrityHash,
      settled_at: now.toISOString(),
    });

    res.json({
      success: true,
      status: 'SETTLED',
      event_type: 'ladder.determined',
      voucher,
    });
  });

  const server = http.createServer(app);

  // ---------------------------------------------------------------------------
  // WebSocket Server & Strict Tenant Isolation (P0-03)
  // ---------------------------------------------------------------------------

  interface ScopedClient {
    ws: WebSocket;
    principal: AuthenticatedPrincipal;
    tenantId: string;
    competitionId?: string;
    connectedAt: number;
  }

  // Safe application subprotocols that can be negotiated without disclosing credentials
  const SAFE_WS_SUBPROTOCOLS = new Set(['parando-v1', 'parando-auth', 'bearer']);

  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols, req) => {
      const candidate = (req as any).selectedProtocol;
      if (!candidate || typeof candidate !== 'string') {
        return false;
      }
      const lower = candidate.toLowerCase();
      // Zero-tolerance guard: NEVER echo a credential, JWT, or bearer.<token>
      if (
        lower.startsWith('bearer.') ||
        candidate.split('.').length === 3 ||
        candidate.length > 32 ||
        !SAFE_WS_SUBPROTOCOLS.has(lower)
      ) {
        return false;
      }
      if (protocols.has(candidate)) {
        return candidate;
      }
      return false;
    },
  });
  const connectedClients = new Map<WebSocket, ScopedClient>();

  function rejectUpgrade(
    socket: net.Socket,
    statusCode: number,
    statusText: string,
    message: string
  ) {
    try {
      if (socket.writable) {
        const body = `${statusCode} ${statusText}: ${message}\r\n`;
        const response =
          `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
          `Content-Type: text/plain; charset=utf-8\r\n` +
          `Content-Length: ${Buffer.byteLength(body)}\r\n` +
          `Connection: close\r\n\r\n` +
          body;
        socket.write(response);
      }
    } finally {
      socket.destroy();
    }
  }

  function extractWsToken(request: http.IncomingMessage): { token: string | null; selectedProtocol?: string } {
    let token: string | null = null;
    let selectedProtocol: string | undefined = undefined;

    // 1. Authorization header: "Bearer <token>"
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.trim().split(/\s+/);
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    // 2. Sec-WebSocket-Protocol header:
    // Supports:
    //   - "parando-v1, bearer.<token>" (negotiates 'parando-v1')
    //   - "bearer, <token>" (negotiates 'bearer')
    //   - "parando-auth, bearer.<token>" (negotiates 'parando-auth')
    //   - "bearer.<token>" (extracts token, negotiates NOTHING to prevent credential disclosure)
    const protoHeader = request.headers['sec-websocket-protocol'];
    if (protoHeader && typeof protoHeader === 'string') {
      const subprotocols = protoHeader.split(',').map((p) => p.trim());

      // Pass 1: Extract credential token
      for (const subproto of subprotocols) {
        if (subproto.toLowerCase().startsWith('bearer.')) {
          if (!token) token = subproto.slice(7);
        } else if (subproto.split('.').length === 3 && subproto.length > 20) {
          if (!token) token = subproto;
        }
      }

      // Handle pair convention: Sec-WebSocket-Protocol: "bearer, <token>"
      if (!token && subprotocols.length === 2 && subprotocols[0].toLowerCase() === 'bearer') {
        token = subprotocols[1];
      }

      // Pass 2: Select non-sensitive protocol ONLY
      // CRITICAL SECURITY INVARIANT:
      // The negotiated protocol MUST NEVER be or contain the token, start with "bearer.",
      // or look like a JWT. Only whitelisted non-sensitive application protocol names are selected.
      for (const subproto of subprotocols) {
        const lower = subproto.toLowerCase();
        if (SAFE_WS_SUBPROTOCOLS.has(lower) || SAFE_WS_SUBPROTOCOLS.has(subproto)) {
          selectedProtocol = SAFE_WS_SUBPROTOCOLS.has(subproto) ? subproto : lower;
          break;
        }
      }
    }

    return { token, selectedProtocol };
  }

  server.on('upgrade', (request, socket: net.Socket, head) => {
    const rawUrl = request.url || '';
    const protocol = request.headers['sec-websocket-protocol'];

    // Allow Vite HMR in development mode
    if (
      protocol === 'vite-hmr' ||
      protocol === 'vite-ping' ||
      rawUrl.startsWith('/@vite')
    ) {
      return;
    }

    // Validate path structure
    let pathname = '';
    try {
      const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
      pathname = parsedUrl.pathname;
    } catch {
      rejectUpgrade(socket, 400, 'Bad Request', 'Malformed request URL');
      return;
    }

    const isGeneralWs = pathname === '/ws';
    const compMatch = pathname.match(/^\/ws\/competitions\/([^/?]+)$/);

    if (!isGeneralWs && !compMatch) {
      rejectUpgrade(socket, 404, 'Not Found', 'Unsupported WebSocket route');
      return;
    }

    // Authenticate WebSocket upgrade request via established server-side trust boundary
    const { token, selectedProtocol } = extractWsToken(request);
    if (!token) {
      auditSecurityAlert({
        sub_type: 'WS_UNAUTHENTICATED',
        reason: 'Missing authentication credentials on WebSocket upgrade',
        path: pathname,
        method: 'GET',
      });
      rejectUpgrade(socket, 401, 'Unauthorized', 'Authentication credentials required for WebSocket connection');
      return;
    }

    const verification = verifyToken(token);
    if (!verification.valid || !verification.principal) {
      auditSecurityAlert({
        sub_type: 'WS_INVALID_TOKEN',
        reason: verification.message || 'Invalid or expired credentials on WebSocket upgrade',
        path: pathname,
        method: 'GET',
      });
      rejectUpgrade(socket, 401, 'Unauthorized', verification.message || 'Invalid or expired token');
      return;
    }

    const principal = verification.principal;

    // Competition-specific authorization & strict tenant isolation
    let compId: string | undefined = undefined;
    if (compMatch) {
      compId = compMatch[1];
      const comp = competitionsMap.get(compId);
      if (!comp) {
        rejectUpgrade(socket, 404, 'Not Found', `Competition '${compId}' not found`);
        return;
      }

      // Tenant isolation: Principal must belong to competition's tenant
      if (principal.tenantId !== comp.tenantId) {
        auditSecurityAlert({
          sub_type: 'WS_TENANT_MISMATCH',
          reason: `Principal tenant '${principal.tenantId}' attempted to access competition '${compId}' belonging to '${comp.tenantId}'`,
          path: pathname,
          method: 'GET',
          principal_id: principal.userId,
          tenant_id: principal.tenantId,
        });
        rejectUpgrade(
          socket,
          403,
          'Forbidden',
          `TENANT_MISMATCH: Principal tenant '${principal.tenantId}' not authorized for competition '${compId}' (tenant: '${comp.tenantId}')`
        );
        return;
      }
    }

    (request as any).authenticatedPrincipal = principal;
    (request as any).tenantId = principal.tenantId;
    (request as any).competitionId = compId;
    (request as any).selectedProtocol = selectedProtocol;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  function broadcastPresenceForCompetition(competitionId: string, tenantId: string) {
    let count = 0;
    for (const client of connectedClients.values()) {
      if (client.competitionId === competitionId && client.tenantId === tenantId) {
        count++;
      }
    }
    const presencePayload = JSON.stringify({
      type: 'PRESENCE_SYNC',
      competition_id: competitionId,
      tenant_id: tenantId,
      payload: { activeWatchers: count },
      timestamp: Date.now(),
    });

    for (const client of connectedClients.values()) {
      if (
        client.competitionId === competitionId &&
        client.tenantId === tenantId &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(presencePayload);
      }
    }
  }

  function broadcastPresenceForTenant(tenantId: string) {
    let count = 0;
    for (const client of connectedClients.values()) {
      if (client.tenantId === tenantId && !client.competitionId) {
        count++;
      }
    }
    const presencePayload = JSON.stringify({
      type: 'PRESENCE_SYNC',
      tenant_id: tenantId,
      payload: { activeWatchers: count },
      timestamp: Date.now(),
    });

    for (const client of connectedClients.values()) {
      if (
        client.tenantId === tenantId &&
        !client.competitionId &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(presencePayload);
      }
    }
  }

  function broadcastToCompetition(competitionId: string, tenantId: string, msg: any) {
    const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const client of connectedClients.values()) {
      if (
        client.competitionId === competitionId &&
        client.tenantId === tenantId &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(str);
      }
    }
  }

  function broadcastToTenant(tenantId: string, msg: any) {
    const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const client of connectedClients.values()) {
      if (client.tenantId === tenantId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(str);
      }
    }
  }

  wss.on('connection', (ws, req) => {
    const principal = (req as any).authenticatedPrincipal as AuthenticatedPrincipal;
    const compId = (req as any).competitionId as string | undefined;
    const tenantId = (req as any).tenantId as string;

    const scopedClient: ScopedClient = {
      ws,
      principal,
      tenantId,
      competitionId: compId,
      connectedAt: Date.now(),
    };
    connectedClients.set(ws, scopedClient);

    if (compId) {
      const comp = competitionsMap.get(compId);
      if (comp) {
        ws.send(
          JSON.stringify({
            type: 'ladder.snapshot',
            competition_id: compId,
            tenant_id: comp.tenantId,
            version: comp.version,
            status: comp.status,
            highest_offer: serializeOffer(comp.highestOffer),
            ladder: comp.ladder.map(serializeOffer),
            ends_at: comp.endsAt.toISOString(),
            server_time: new Date().toISOString(),
          })
        );
      }
      broadcastPresenceForCompetition(compId, tenantId);
    } else {
      broadcastPresenceForTenant(tenantId);
    }

    const cleanupClient = () => {
      const info = connectedClients.get(ws);
      if (info) {
        connectedClients.delete(ws);
        if (info.competitionId) {
          broadcastPresenceForCompetition(info.competitionId, info.tenantId);
        } else {
          broadcastPresenceForTenant(info.tenantId);
        }
      }
    };

    ws.on('close', cleanupClient);
    ws.on('error', cleanupClient);

    ws.on('message', (data) => {
      try {
        const msgStr = data.toString();
        if (msgStr === 'ping') {
          ws.send('pong');
          return;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(msgStr);
        } catch {
          return;
        }

        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          return;
        }

        // Relaying message: STRICTLY isolated to the same competition and same tenant
        const sender = connectedClients.get(ws);
        if (!sender) return;

        for (const recipient of connectedClients.values()) {
          if (
            recipient.ws !== ws &&
            recipient.ws.readyState === WebSocket.OPEN &&
            recipient.tenantId === sender.tenantId &&
            recipient.competitionId === sender.competitionId
          ) {
            recipient.ws.send(msgStr);
          }
        }
      } catch (err) {
        console.warn('[WS] Error processing message:', err);
      }
    });
  });

  // 404 handler for unknown API routes
  app.all('/api/{*splat}', (_req, res) => {
    res.status(404).json({ detail: 'API endpoint not found' });
  });

  // Mount Vite in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.use('/src/assets', express.static('src/assets'));
    app.get('{/*splat}', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ detail: 'API endpoint not found' });
        return;
      }
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  function resolvePort(): number {
    const portArgIdx = process.argv.indexOf('--port');
    if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
      const p = parseInt(process.argv[portArgIdx + 1], 10);
      if (!isNaN(p)) return p;
    }
    if (process.env.NODE_ENV !== 'production') {
      return 3000;
    }
    if (process.env.APP_PORT) {
      return parseInt(process.env.APP_PORT, 10);
    }
    if (process.env.PORT && process.env.PORT !== '8080') {
      return parseInt(process.env.PORT, 10);
    }
    return 3000;
  }

  const PORT = resolvePort();
  server.on('error', (err: any) => {
    console.error('[ParandO] HTTP server error:', err);
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[ParandO] Server and WebSocket live on http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    console.log('[ParandO] Received shutdown signal, closing server...');
    wss.close();
    for (const client of connectedClients.keys()) {
      client.terminate();
    }
    connectedClients.clear();
    server.close(() => {
      console.log('[ParandO] Server and WebSockets closed gracefully');
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(0);
    }, 2000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('[ParandO] Fatal error starting server:', err);
  process.exit(1);
});

