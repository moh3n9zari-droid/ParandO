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

export interface TestResult {
  name: string;
  category: 'Ladder' | 'Kernel' | 'Integration';
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

  return results;
}
