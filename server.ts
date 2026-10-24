import express from 'express';
import http from 'http';
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

  // Health check API
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'parando-auction-ecosystem',
      standards: ['ADR-001', 'ADR-002', 'ADR-003', 'ADR-004'],
      kernel_conformance: ['ADR-001', 'ADR-002', 'TR-01', 'TR-12', 'TR-13'],
      timestamp: new Date().toISOString(),
    });
  });

  // Competitions REST API
  app.get('/api/v1/competitions', (_req, res) => {
    const list = Array.from(competitionsMap.values()).map(serializeCompetition);
    res.json(list);
  });

  app.post('/api/v1/competitions', (req, res) => {
    const { competition_id, tenant_id, seller_id, base_price, min_increment, deposit_rate_bps, duration_minutes, ladder_size } = req.body;
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
  });

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

  // Submit Offer (with TR-12 Idempotency)
  app.post('/api/v1/competitions/:competition_id/offers', (req, res) => {
    const compId = req.params.competition_id;
    const comp = competitionsMap.get(compId);
    if (!comp) {
      res.status(404).json({ detail: `Competition '${compId}' not found` });
      return;
    }

    const headerKey = req.headers['idempotency-key'] as string | undefined;
    const idemKey = headerKey || req.body.idempotency_key;
    const offerId = req.body.offer_id || `off-${crypto.randomUUID().slice(0, 8)}`;

    const offerer: Offerer = {
      offererId: req.body.offerer_id,
      tenantId: req.body.tenant_id,
      isEligible: true,
    };

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
          res.status(500).json({ detail: err.message || 'Internal Server Error' });
        }
        return;
      }
    }

    // Record audit event
    auditEvents.unshift({
      timestamp: new Date().toISOString(),
      competition_id: compId,
      offerer_id: req.body.offerer_id,
      amount: req.body.amount,
      rank: result.rank,
      is_replay: isReplay,
      idempotency_key: idemKey,
    });
    if (auditEvents.length > 200) auditEvents.pop();

    // Broadcast live ladder update
    broadcastWS({
      type: 'ladder.update',
      competition_id: compId,
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

  // Proofs API
  app.post('/api/v1/proofs', (req, res) => {
    const { offerer_id, tenant_id, guaranteed_amount, valid_hours } = req.body;
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
  });

  app.get('/api/v1/proofs/:offerer_id', (req, res) => {
    const offererId = req.params.offerer_id;
    const matched = Array.from(proofsMap.values()).filter((p) => p.offererId === offererId);
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

  // Audit Events API
  app.get('/api/v1/events', (_req, res) => {
    res.json(auditEvents);
  });

  // Settle Competition (ADR-003)
  app.post('/api/v1/competitions/:competition_id/settle', (req, res) => {
    const compId = req.params.competition_id;
    const comp = competitionsMap.get(compId);
    if (!comp) {
      res.status(404).json({ detail: `Competition '${compId}' not found` });
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
      winner_id: winnerId,
      clearing_price: clearingPrice,
      voucher_id: voucherId,
      status: 'SETTLED',
    });

    broadcastWS({
      type: 'ladder.determined',
      competition_id: compId,
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

  // WebSocket Server on /ws and /ws/competitions/:id
  const wss = new WebSocketServer({ noServer: true });
  const connectedClients = new Set<WebSocket>();

  server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  function broadcastPresence() {
    const presencePayload = JSON.stringify({
      type: 'PRESENCE_SYNC',
      payload: { activeWatchers: connectedClients.size },
      timestamp: Date.now(),
    });

    for (const client of connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(presencePayload);
      }
    }
  }

  function broadcastWS(msg: any) {
    const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const client of connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(str);
      }
    }
  }

  wss.on('connection', (ws, req) => {
    connectedClients.add(ws);
    broadcastPresence();

    const url = req.url || '';
    const compMatch = url.match(/\/ws\/competitions\/([^/?]+)/);
    if (compMatch) {
      const compId = compMatch[1];
      const comp = competitionsMap.get(compId);
      if (comp) {
        ws.send(
          JSON.stringify({
            type: 'ladder.snapshot',
            competition_id: compId,
            version: comp.version,
            status: comp.status,
            highest_offer: serializeOffer(comp.highestOffer),
            ladder: comp.ladder.map(serializeOffer),
            ends_at: comp.endsAt.toISOString(),
            server_time: new Date().toISOString(),
          })
        );
      }
    }

    ws.on('message', (data) => {
      try {
        const msgStr = data.toString();
        if (msgStr === 'ping') {
          ws.send('pong');
          return;
        }

        const parsed = JSON.parse(msgStr);
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          return;
        }

        // Broadcast to all other connected clients
        for (const client of connectedClients) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(msgStr);
          }
        }
      } catch (err) {
        console.warn('[WS] Error processing message:', err);
      }
    });

    ws.on('close', () => {
      connectedClients.delete(ws);
      broadcastPresence();
    });

    ws.on('error', () => {
      connectedClients.delete(ws);
      broadcastPresence();
    });
  });

  // Mount Vite in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[ParandO] Server and WebSocket live on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[ParandO] Fatal error starting server:', err);
  process.exit(1);
});

