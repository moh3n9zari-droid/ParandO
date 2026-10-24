import {
  CompetitionLadder,
  LadderOffer,
  LadderOfferStatus,
  LadderError,
  IdempotencyConflict,
} from './competition_ladder';
import {
  Competition,
  CompetitionEnded,
  CompetitionNotActive,
  CompetitionNotStarted,
  CompetitionRules,
  CompetitionStatus,
  OfferBelowMinimum,
  Offerer,
  OffererNotEligible,
  OfferIncrementTooSmall,
  CommitmentGuard,
  CommitmentProof,
  FixedClock,
  InsufficientCommitment,
  SellerCannotOffer,
  StaleCompetitionVersion,
  SubmitOfferCommand,
  submitOffer,
  OfferConflict,
} from './competition_kernel';

import {
  createLadderDeterminedEvent,
  calculateSettlement,
  DEFAULT_SETTLEMENT_CONFIG,
} from './settlement_module';
import {
  SecurityVelocityHook,
  AMLComplianceHook,
  MarketIntegrityHook,
  HookRegistry,
} from './extension_hooks';

export interface TestResult {
  name: string;
  category: 'Ladder' | 'Kernel' | 'Integration' | 'Settlement' | 'Extensions';
  status: 'passed' | 'failed';
  error?: string;
  durationMs: number;
}

export class FakeGuard implements CommitmentGuard {
  proof: CommitmentProof | null;
  calls: [string, string][] = [];

  constructor(proof: CommitmentProof | null) {
    this.proof = proof;
  }

  getProof(offererId: string, tenantId: string): CommitmentProof | null {
    this.calls.push([offererId, tenantId]);
    if (this.proof && this.proof.offererId === 'any') {
      return { ...this.proof, offererId, tenantId };
    }
    return this.proof;
  }
}

export function runAllCoreTests(): TestResult[] {
  const results: TestResult[] = [];
  const NOW = new Date(Date.UTC(2026, 9, 21, 12, 0, 0));
  const BASE_PRICE = 1_000_000;
  const STEP = 50_000;
  const REQUIRED = 150_000;

  function makeCompetition(overrides: Partial<ConstructorParameters<typeof Competition>[0]> = {}): Competition {
    return new Competition({
      competitionId: 'C1',
      tenantId: 'T1',
      sellerId: 'seller',
      rules: new CompetitionRules(BASE_PRICE, STEP),
      startsAt: new Date(NOW.getTime() - 3600_000),
      endsAt: new Date(NOW.getTime() + 3600_000),
      status: CompetitionStatus.ACTIVE,
      ...overrides,
    });
  }

  function makeOfferer(overrides: Partial<Offerer> = {}): Offerer {
    return {
      offererId: 'o1',
      tenantId: 'T1',
      isEligible: true,
      ...overrides,
    };
  }

  function makeProof(overrides: Partial<CommitmentProof> = {}): CommitmentProof {
    return {
      offererId: 'o1',
      tenantId: 'T1',
      guaranteedAmount: REQUIRED,
      validUntil: new Date(NOW.getTime() + 1800_000),
      ...overrides,
    };
  }

  function makeCommand(overrides: Partial<SubmitOfferCommand> = {}): SubmitOfferCommand {
    return {
      competitionId: 'C1',
      offerer: makeOfferer(),
      amount: BASE_PRICE,
      offerId: 'offer-1',
      idempotencyKey: 'idem-1',
      ...overrides,
    };
  }

  function runTest(name: string, category: TestResult['category'], fn: () => void) {
    const t0 = performance.now();
    try {
      fn();
      results.push({
        name,
        category,
        status: 'passed',
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
      });
    } catch (err: unknown) {
      results.push({
        name,
        category,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
      });
    }
  }

  // --- Ladder Unit Tests ---
  runTest('TR-01 / Ladder: invalid K throws INVALID_K', 'Ladder', () => {
    try {
      new CompetitionLadder(0);
      throw new Error('Expected INVALID_K');
    } catch (e: unknown) {
      if (!(e instanceof LadderError) || e.code !== 'INVALID_K') throw e;
    }
  });

  runTest('TR-01 / Ladder: invalid offer fields throw specific LadderErrors', 'Ladder', () => {
    const ladder = new CompetitionLadder(3);
    const badOffers: [LadderOffer, string][] = [
      [{ offerId: '', offererId: 'u', amount: 10, sequence: 1 }, 'INVALID_BID'],
      [{ offerId: 'x', offererId: '', amount: 10, sequence: 1 }, 'INVALID_BID'],
      [{ offerId: 'x', offererId: 'u', amount: 0, sequence: 1 }, 'INVALID_AMOUNT'],
      [{ offerId: 'x', offererId: 'u', amount: -5, sequence: 1 }, 'INVALID_AMOUNT'],
    ];

    for (const [offer, code] of badOffers) {
      try {
        ladder.place(offer);
        throw new Error(`Expected ${code}`);
      } catch (e: unknown) {
        if (!(e instanceof LadderError) || e.code !== code) throw e;
      }
    }
  });

  runTest('TR-01 / Ladder: sorts by amount desc', 'Ladder', () => {
    const l = new CompetitionLadder(3);
    l.place({ offerId: 'o1', offererId: 'u1', amount: 100, sequence: 1 });
    l.place({ offerId: 'o2', offererId: 'u2', amount: 300, sequence: 2 });
    l.place({ offerId: 'o3', offererId: 'u3', amount: 200, sequence: 3 });
    const ids = l.snapshot().map((e) => e.offer.offerId);
    if (JSON.stringify(ids) !== JSON.stringify(['o2', 'o3', 'o1'])) {
      throw new Error(`Order mismatch: ${ids.join(', ')}`);
    }
    if (l.rankOf('o3') !== 2) throw new Error('Rank of o3 must be 2');
  });

  runTest('TR-13: equal amount tie-break strictly by Offer Sequence Number', 'Ladder', () => {
    const l = new CompetitionLadder(3);
    // Sequence 1 was submitted earlier than Sequence 2
    l.place({ offerId: 'seq2', offererId: 'u2', amount: 100, sequence: 2 });
    l.place({ offerId: 'seq1', offererId: 'u1', amount: 100, sequence: 1 });
    const ids = l.snapshot().map((e) => e.offer.offerId);
    if (JSON.stringify(ids) !== JSON.stringify(['seq1', 'seq2'])) {
      throw new Error(`TR-13 sequence tie-breaker failed: expected seq1 first, got ${ids.join(', ')}`);
    }
  });

  runTest('TR-12 / Ladder: identical payload replays, conflicting payload throws IdempotencyConflict', 'Ladder', () => {
    const l = new CompetitionLadder(3);
    const r1 = l.place({ offerId: 'dup1', offererId: 'u1', amount: 100, sequence: 1 });
    const r2 = l.place({ offerId: 'dup1', offererId: 'u1', amount: 100, sequence: 1 });
    if (!r2.duplicate || r2.rank !== 1) throw new Error('Expected duplicate replay');

    try {
      l.place({ offerId: 'dup1', offererId: 'u1', amount: 200, sequence: 1 });
      throw new Error('Expected conflict error');
    } catch (e: unknown) {
      if (!(e instanceof IdempotencyConflict)) throw e;
    }
  });

  runTest('TR-01 / Ladder: full ladder drops worst and marks OUTBID', 'Ladder', () => {
    const l = new CompetitionLadder(2);
    l.place({ offerId: 'o1', offererId: 'u1', amount: 100, sequence: 1 });
    l.place({ offerId: 'o2', offererId: 'u2', amount: 200, sequence: 2 });
    const r = l.place({ offerId: 'o3', offererId: 'u3', amount: 150, sequence: 3 });
    if (!r.accepted || r.rank !== 2) throw new Error('Offer o3 should rank at 2');
    if (r.transitions.length !== 1 || r.transitions[0].offerId !== 'o1' || r.transitions[0].newStatus !== LadderOfferStatus.OUTBID) {
      throw new Error('Expected o1 outbid transition');
    }
    if (l.statusOf('o1') !== LadderOfferStatus.OUTBID) throw new Error('Status of o1 must be OUTBID');
  });

  runTest('TR-01 / Ladder: same offerer higher offer SUPERSEDES previous', 'Ladder', () => {
    const l = new CompetitionLadder(3);
    l.place({ offerId: 'o1', offererId: 'u1', amount: 100, sequence: 1 });
    l.place({ offerId: 'o2', offererId: 'u2', amount: 150, sequence: 2 });
    const r = l.place({ offerId: 'o3', offererId: 'u1', amount: 200, sequence: 3 });
    if (!r.accepted || r.rank !== 1) throw new Error('Offer o3 should rank at 1');
    if (l.statusOf('o1') !== LadderOfferStatus.SUPERSEDED) throw new Error('o1 must be SUPERSEDED');
    const ids = l.snapshot().map((e) => e.offer.offerId);
    if (JSON.stringify(ids) !== JSON.stringify(['o3', 'o2'])) throw new Error(`Snapshot mismatch: ${ids.join(',')}`);
  });

  // --- Kernel Unit Tests ---
  runTest('TR-01 / Kernel: first offer at base price is accepted', 'Kernel', () => {
    const competition = makeCompetition();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    const result = submitOffer(competition, makeCommand(), guard, clock);
    if (result.offer.amount !== BASE_PRICE) throw new Error('Amount mismatch');
    if (result.offer.sequence !== 1) throw new Error('Sequence should be 1');
    if (result.competition.offerCount !== 1) throw new Error('Offer count should be 1');
    if (result.competition.version !== 1) throw new Error('Version should be 1');
  });

  runTest('TR-12 / Kernel: identical payload returns previous response (Idempotent Replay)', 'Kernel', () => {
    const competition = makeCompetition();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    const seen = new Map();
    const cmd = makeCommand();
    const r1 = submitOffer(competition, cmd, guard, clock, seen);
    const r2 = submitOffer(competition, cmd, guard, clock, seen);
    if (r1 !== r2) throw new Error('Expected identical response reference on idempotent replay');
    if (r2.offer.offerId !== cmd.offerId) throw new Error('Offer ID mismatch');
  });

  runTest('TR-12 / Kernel: conflicting payload for same key raises OfferConflict', 'Kernel', () => {
    const competition = makeCompetition();
    const guard = new FakeGuard(makeProof({ guaranteedAmount: REQUIRED * 5 }));
    const clock = new FixedClock(NOW);
    const seen = new Map();
    const cmd1 = makeCommand({ amount: BASE_PRICE });
    submitOffer(competition, cmd1, guard, clock, seen);

    try {
      const cmd2 = makeCommand({ amount: BASE_PRICE + STEP });
      submitOffer(competition, cmd2, guard, clock, seen);
      throw new Error('Should have raised OfferConflict');
    } catch (e: unknown) {
      if (!(e instanceof OfferConflict)) throw e;
    }
  });

  runTest('TR-01 / Kernel: offer below minimum rejected', 'Kernel', () => {
    const competition = makeCompetition();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitOffer(competition, makeCommand({ amount: BASE_PRICE - 1 }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof OfferBelowMinimum)) throw e;
    }
  });

  runTest('TR-01 / Kernel: offer increment too small rejected', 'Kernel', () => {
    const competition = makeCompetition();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    const r1 = submitOffer(competition, makeCommand({ amount: BASE_PRICE }), guard, clock);
    try {
      submitOffer(r1.competition, makeCommand({ offerId: 'offer-2', idempotencyKey: 'idem-2', amount: BASE_PRICE + 10 }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof OfferIncrementTooSmall)) throw e;
    }
  });

  runTest('TR-01 / Kernel: seller cannot offer', 'Kernel', () => {
    const competition = makeCompetition();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitOffer(competition, makeCommand({ offerer: makeOfferer({ offererId: 'seller' }) }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof SellerCannotOffer)) throw e;
    }
  });

  runTest('TR-01 / Kernel: ineligible offerer rejected', 'Kernel', () => {
    const competition = makeCompetition();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitOffer(competition, makeCommand({ offerer: makeOfferer({ isEligible: false }) }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof OffererNotEligible)) throw e;
    }
  });

  runTest('TR-01 / Kernel: insufficient commitment proof rejected', 'Kernel', () => {
    const competition = makeCompetition();
    const guard = new FakeGuard(makeProof({ guaranteedAmount: REQUIRED - 1 }));
    const clock = new FixedClock(NOW);
    try {
      submitOffer(competition, makeCommand(), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof InsufficientCommitment)) throw e;
    }
  });

  runTest('TR-01 / Kernel: stale competition version rejected', 'Kernel', () => {
    const competition = makeCompetition({ version: 2 });
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitOffer(competition, makeCommand({ expectedVersion: 1 }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof StaleCompetitionVersion)) throw e;
    }
  });

  runTest('TR-01 / Kernel: inactive or expired competition rejected', 'Kernel', () => {
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitOffer(makeCompetition({ status: CompetitionStatus.SCHEDULED }), makeCommand(), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof CompetitionNotActive)) throw e;
    }

    try {
      submitOffer(makeCompetition({ startsAt: new Date(NOW.getTime() + 1000) }), makeCommand(), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof CompetitionNotStarted)) throw e;
    }

    try {
      submitOffer(makeCompetition({ endsAt: new Date(NOW.getTime() - 1000) }), makeCommand(), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof CompetitionEnded)) throw e;
    }
  });

  // --- Integration Tests ---
  runTest('Integration: ladder keeps top-K highest first', 'Integration', () => {
    let c = makeCompetition({ ladderSize: 3 });
    const clock = new FixedClock(NOW);
    for (let i = 0; i < 5; i++) {
      const offererId = `o${i}`;
      const guard = new FakeGuard(makeProof({ offererId, guaranteedAmount: BASE_PRICE * 10 }));
      const cmd = makeCommand({
        offerer: makeOfferer({ offererId }),
        amount: BASE_PRICE + i * STEP,
        offerId: `x${i}`,
        idempotencyKey: `k-x${i}`,
      });
      c = submitOffer(c, cmd, guard, clock).competition;
    }
    const ladderIds = c.ladder.map((o) => o.offerId);
    if (JSON.stringify(ladderIds) !== JSON.stringify(['x4', 'x3', 'x2'])) {
      throw new Error(`Ladder top-3 mismatch: ${ladderIds.join(',')}`);
    }
    if (c.highestOffer?.offerId !== 'x4' || c.offerCount !== 5) {
      throw new Error('Leader or offer count mismatch');
    }
  });

  runTest('Integration: outbid transition reported on ladder drop', 'Integration', () => {
    let c = makeCompetition({ ladderSize: 2 });
    const clock = new FixedClock(NOW);
    const placeOffer = (offererId: string, amt: number, offerId: string) => {
      const guard = new FakeGuard(makeProof({ offererId, guaranteedAmount: BASE_PRICE * 10 }));
      const cmd = makeCommand({
        offerer: makeOfferer({ offererId }),
        amount: amt,
        offerId,
        idempotencyKey: `k-${offerId}`,
      });
      return submitOffer(c, cmd, guard, clock);
    };

    c = placeOffer('o0', BASE_PRICE, 'x0').competition;
    c = placeOffer('o1', BASE_PRICE + STEP, 'x1').competition;
    const r = placeOffer('o2', BASE_PRICE + 2 * STEP, 'x2');

    const outbidList = r.transitions.map((t) => [t.offerId, t.newStatus]);
    if (JSON.stringify(outbidList) !== JSON.stringify([['x0', LadderOfferStatus.OUTBID]])) {
      throw new Error(`Transition mismatch: ${JSON.stringify(outbidList)}`);
    }
    if (r.rank !== 1) throw new Error('Rank should be 1');
    const ladderIds = r.competition.ladder.map((o) => o.offerId);
    if (JSON.stringify(ladderIds) !== JSON.stringify(['x2', 'x1'])) {
      throw new Error(`Ladder mismatch: ${ladderIds.join(',')}`);
    }
  });

  // --- ADR-003: Settlement & Post-Competition Accounting Tests ---
  runTest('ADR-003 / Settlement: ladder.determined event emitted with seal and ladder snapshot', 'Settlement', () => {
    let c = makeCompetition({ ladderSize: 3 });
    const clock = new FixedClock(NOW);
    const guard = new FakeGuard(makeProof({ offererId: 'winner-1', guaranteedAmount: BASE_PRICE * 2 }));
    const cmd = makeCommand({
      offerer: makeOfferer({ offererId: 'winner-1' }),
      amount: BASE_PRICE + 100_000,
      offerId: 'win-off-1',
      idempotencyKey: 'idem-win',
    });
    c = submitOffer(c, cmd, guard, clock).competition;

    const event = createLadderDeterminedEvent(c, NOW);
    if (event.eventType !== 'ladder.determined') throw new Error('Event type must be ladder.determined');
    if (event.competitionId !== 'C1') throw new Error('Competition ID mismatch');
    if (event.winnerOffer?.offerId !== 'win-off-1') throw new Error('Winner offer ID mismatch');
    if (event.finalLadder.length !== 1) throw new Error('Final ladder length mismatch');
    if (!event.sealDigest.startsWith('SEAL-')) throw new Error('Invalid seal digest format');
  });

  runTest('ADR-003 / Settlement: calculate platform fee, VAT (10%), transfer tax, and unfreeze losers', 'Settlement', () => {
    let c = makeCompetition({ ladderSize: 3 });
    const clock = new FixedClock(NOW);
    
    // Bidder 1
    const guard1 = new FakeGuard(makeProof({ offererId: 'o1', guaranteedAmount: 2_000_000 }));
    c = submitOffer(c, makeCommand({ offerer: makeOfferer({ offererId: 'o1' }), amount: 1_000_000, offerId: 'off-1', idempotencyKey: 'id-1' }), guard1, clock).competition;
    
    // Bidder 2 (Winner)
    const guard2 = new FakeGuard(makeProof({ offererId: 'o2', guaranteedAmount: 2_000_000 }));
    c = submitOffer(c, makeCommand({ offerer: makeOfferer({ offererId: 'o2' }), amount: 1_200_000, offerId: 'off-2', idempotencyKey: 'id-2' }), guard2, clock).competition;

    const participants = [
      { offererId: 'o1', tenantId: 'T1' },
      { offererId: 'o2', tenantId: 'T1' },
      { offererId: 'seller', tenantId: 'T1' },
    ];

    const breakdown = calculateSettlement(c, participants, DEFAULT_SETTLEMENT_CONFIG, NOW);

    // Gross: 1,200,000
    // Platform fee (50 bps = 0.5%): 6,000
    // VAT (1000 bps = 10% on platform fee): 600
    // Transfer Tax (50 bps = 0.5%): 6,000
    // Total Deductions: 12,600
    // Net Payable: 1,200,000 - 12,600 = 1,187,400
    if (breakdown.grossAmount !== 1_200_000) throw new Error(`Gross amount mismatch: got ${breakdown.grossAmount}`);
    if (breakdown.platformFeeAmount !== 6_000) throw new Error(`Platform fee mismatch: got ${breakdown.platformFeeAmount}`);
    if (breakdown.vatAmount !== 600) throw new Error(`VAT mismatch: got ${breakdown.vatAmount}`);
    if (breakdown.statutoryTransferTaxAmount !== 6_000) throw new Error(`Transfer tax mismatch: got ${breakdown.statutoryTransferTaxAmount}`);
    if (breakdown.totalDeductions !== 12_600) throw new Error(`Total deductions mismatch: got ${breakdown.totalDeductions}`);
    if (breakdown.netPayableToSeller !== 1_187_400) throw new Error(`Net payable mismatch: got ${breakdown.netPayableToSeller}`);

    // Verify unfreeze authorizations
    const o1Instruction = breakdown.unfreezeInstructions.find((i) => i.offererId === 'o1');
    if (!o1Instruction || o1Instruction.status !== 'UNFREEZE_AUTHORIZED') {
      throw new Error('Outbid participant o1 should have UNFREEZE_AUTHORIZED status');
    }
    const o2Instruction = breakdown.unfreezeInstructions.find((i) => i.offererId === 'o2');
    if (!o2Instruction || o2Instruction.status !== 'RETAINED_FOR_SETTLEMENT') {
      throw new Error('Winner o2 should have RETAINED_FOR_SETTLEMENT status');
    }
  });

  // --------------------------------------------------------------------------
  // ADR-004: Extension Hooks & Deterministic Replay Tests
  // --------------------------------------------------------------------------

  runTest('ADR-004 / Hooks: SecurityVelocityHook rejects high-frequency spam submissions', 'Extensions', () => {
    const velocityHook = new SecurityVelocityHook(500); // 500ms required interval
    const comp = makeCompetition();
    const offerer = makeOfferer({ offererId: 'rapid-bidder' });

    // First offer at t=0
    const eval1 = velocityHook.beforeSubmitOffer({
      competition: comp,
      offerer,
      amount: 1_000_000,
      idempotencyKey: 'vel-1',
      offerId: 'off-1',
      timestamp: new Date(NOW.getTime()),
    });
    if (!eval1.allowed) throw new Error('First offer should be permitted by velocity hook');

    // Immediate second offer at t=100ms (< 500ms)
    const eval2 = velocityHook.beforeSubmitOffer({
      competition: comp,
      offerer,
      amount: 1_100_000,
      idempotencyKey: 'vel-2',
      offerId: 'off-2',
      timestamp: new Date(NOW.getTime() + 100),
    });
    if (eval2.allowed || eval2.code !== 'RATE_LIMIT_EXCEEDED') {
      throw new Error('Immediate successive offer should be rejected with RATE_LIMIT_EXCEEDED');
    }

    // Subsequent offer at t=600ms (>= 500ms)
    const eval3 = velocityHook.beforeSubmitOffer({
      competition: comp,
      offerer,
      amount: 1_200_000,
      idempotencyKey: 'vel-3',
      offerId: 'off-3',
      timestamp: new Date(NOW.getTime() + 600),
    });
    if (!eval3.allowed) throw new Error('Offer after interval expiry should be permitted');
  });

  runTest('ADR-004 / Hooks: AMLComplianceHook blocks abnormal price surge and regulatory ceiling', 'Extensions', () => {
    const amlHook = new AMLComplianceHook(10, 500_000_000_000);
    const comp = makeCompetition(); // basePrice: 1,000,000
    const offerer = makeOfferer({ offererId: 'aml-check' });

    // Normal offer: 2,000,000 (2x base price) -> allowed
    const evalNormal = amlHook.beforeSubmitOffer({
      competition: comp,
      offerer,
      amount: 2_000_000,
      idempotencyKey: 'aml-1',
      offerId: 'off-1',
      timestamp: NOW,
    });
    if (!evalNormal.allowed) throw new Error('Normal offer should be allowed by AML hook');

    // Excessive multiplier offer: 15,000,000 (15x base price > 10x limit) -> rejected
    const evalSurge = amlHook.beforeSubmitOffer({
      competition: comp,
      offerer,
      amount: 15_000_000,
      idempotencyKey: 'aml-2',
      offerId: 'off-2',
      timestamp: NOW,
    });
    if (evalSurge.allowed || evalSurge.code !== 'IRREGULAR_PRICE_SURGE') {
      throw new Error('Excessive price multiplier should be rejected with IRREGULAR_PRICE_SURGE');
    }

    // Absolute cap exceeded: > 500 Billion Rials -> rejected
    const evalCeiling = amlHook.beforeSubmitOffer({
      competition: comp,
      offerer,
      amount: 600_000_000_000,
      idempotencyKey: 'aml-3',
      offerId: 'off-3',
      timestamp: NOW,
    });
    if (evalCeiling.allowed || evalCeiling.code !== 'AML_CEILING_EXCEEDED') {
      throw new Error('Offer exceeding AML ceiling should be rejected with AML_CEILING_EXCEEDED');
    }
  });

  runTest('ADR-004 / Hooks: MarketIntegrityHook guards against self-competition jump', 'Extensions', () => {
    const integrityHook = new MarketIntegrityHook();
    let comp = makeCompetition();
    const offerer = makeOfferer({ offererId: 'solo-bidder' });
    const guard = new FakeGuard(makeProof({ offererId: 'solo-bidder', guaranteedAmount: 200_000_000 }));
    const clock = new FixedClock(NOW);

    // Initial offer: 1,000,000
    comp = submitOffer(
      comp,
      makeCommand({ offerer, amount: 1_000_000, offerId: 'off-init', idempotencyKey: 'idem-init' }),
      guard,
      clock
    ).competition;

    // Solo bidder attempts to jump over own highest offer by 100 increments (limit is 50)
    const evalSelf = integrityHook.beforeSubmitOffer({
      competition: comp,
      offerer,
      amount: 1_000_000 + comp.rules.minIncrement * 100, // 100x minIncrement jump over self
      idempotencyKey: 'idem-self-jump',
      offerId: 'off-jump',
      timestamp: NOW,
    });

    if (evalSelf.allowed || evalSelf.code !== 'SELF_COMPETITION_SURGE') {
      throw new Error('Self-competition surge should be blocked with SELF_COMPETITION_SURGE');
    }
  });

  runTest('ADR-004 / Replay: Deterministic Replay yields 100% Top-K match and zero drift', 'Extensions', () => {
    // 1. Run live stream
    let liveComp = makeCompetition({ ladderSize: 3 });
    const guard = new FakeGuard(makeProof({ offererId: 'any', guaranteedAmount: 50_000_000 }));
    const recordedEvents: Array<{ offererId: string; amount: number; offerId: string; idKey: string; rank: number }> = [];

    const offersData = [
      { offererId: 'user-a', amount: 1_000_000, offerId: 'off-a', idKey: 'k-a' },
      { offererId: 'user-c', amount: 1_100_000, offerId: 'off-c', idKey: 'k-c' },
      { offererId: 'user-b', amount: 1_200_000, offerId: 'off-b', idKey: 'k-b' },
      { offererId: 'user-d', amount: 1_300_000, offerId: 'off-d', idKey: 'k-d' },
      { offererId: 'user-e', amount: 1_350_000, offerId: 'off-e', idKey: 'k-e' },
    ];

    for (let i = 0; i < offersData.length; i++) {
      const d = offersData[i];
      const clock = new FixedClock(new Date(NOW.getTime() + i * 1000));
      const res = submitOffer(
        liveComp,
        makeCommand({
          offerer: makeOfferer({ offererId: d.offererId }),
          amount: d.amount,
          offerId: d.offerId,
          idempotencyKey: d.idKey,
        }),
        guard,
        clock
      );
      liveComp = res.competition;
      recordedEvents.push({ ...d, rank: res.rank });
    }

    // 2. Replay in a fresh isolated sandbox
    let replayComp = makeCompetition({ ladderSize: 3 });
    const replaySeenMap = new Map();
    let driftCount = 0;

    for (let i = 0; i < recordedEvents.length; i++) {
      const evt = recordedEvents[i];
      const clock = new FixedClock(new Date(NOW.getTime() + i * 1000));
      const res = submitOffer(
        replayComp,
        makeCommand({
          offerer: makeOfferer({ offererId: evt.offererId }),
          amount: evt.amount,
          offerId: evt.offerId,
          idempotencyKey: `replay-${evt.idKey}`,
        }),
        guard,
        clock,
        replaySeenMap
      );
      replayComp = res.competition;
      if (res.rank !== evt.rank) {
        driftCount++;
      }
    }

    if (driftCount !== 0) {
      throw new Error(`Deterministic replay detected ${driftCount} rank drifts! Expected 0.`);
    }

    // Compare ladders
    if (liveComp.ladder.length !== replayComp.ladder.length) {
      throw new Error('Replayed ladder size does not match live ladder size');
    }
    for (let i = 0; i < liveComp.ladder.length; i++) {
      if (
        liveComp.ladder[i].amount !== replayComp.ladder[i].amount ||
        liveComp.ladder[i].offererId !== replayComp.ladder[i].offererId
      ) {
        throw new Error(`Ladder entry at rank ${i + 1} diverged between live and replayed state`);
      }
    }
  });

  runTest('ADR-004 / Telemetry: HookRegistry logs audit telemetry events with proper schema', 'Extensions', () => {
    const registry = HookRegistry.getInstance();
    const initialLogCount = registry.getTelemetryLogs().length;

    const comp = makeCompetition();
    const offerer = makeOfferer({ offererId: 'telemetry-test-user' });

    // Trigger evaluateBeforeOffer
    const res = registry.evaluateBeforeOffer({
      competition: comp,
      offerer,
      amount: 1_500_000,
      idempotencyKey: 'tel-test-key',
      offerId: 'tel-test-offer',
      timestamp: NOW,
    });

    if (!res.allowed) throw new Error('Evaluation should pass for valid offer');

    const logsAfter = registry.getTelemetryLogs();
    if (logsAfter.length <= initialLogCount) {
      throw new Error('Telemetry log was not recorded by HookRegistry');
    }

    const latest = logsAfter[0];
    if (latest.eventType !== 'PRE_CHECK_PASSED') {
      throw new Error(`Expected PRE_CHECK_PASSED eventType, got ${latest.eventType}`);
    }
  });

  return results;
}
