import {
  AuctionLadder,
  LadderBid,
  LadderBidStatus,
  LadderError,
} from './auction_ladder';
import {
  Auction,
  AuctionEnded,
  AuctionNotActive,
  AuctionNotStarted,
  AuctionRules,
  AuctionStatus,
  Bid,
  BidBelowMinimum,
  Bidder,
  BidderNotEligible,
  BidIncrementTooSmall,
  CommitmentGuard,
  CommitmentProof,
  DuplicateBid,
  FixedClock,
  InsufficientCommitment,
  InvalidAmount,
  SellerCannotBid,
  StaleAuctionVersion,
  SubmitBidCommand,
  submitBid,
} from './auction_kernel';

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

  getProof(bidderId: string, tenantId: string): CommitmentProof | null {
    this.calls.push([bidderId, tenantId]);
    return this.proof;
  }
}

export function runAllCoreTests(): TestResult[] {
  const results: TestResult[] = [];
  const NOW = new Date(Date.UTC(2026, 9, 21, 12, 0, 0));
  const BASE_PRICE = 1_000_000;
  const STEP = 50_000;
  const REQUIRED = 150_000;

  function makeAuction(overrides: Partial<ConstructorParameters<typeof Auction>[0]> = {}): Auction {
    return new Auction({
      auctionId: 'A1',
      tenantId: 'T1',
      sellerId: 'seller',
      rules: new AuctionRules(BASE_PRICE, STEP),
      startsAt: new Date(NOW.getTime() - 3600_000),
      endsAt: new Date(NOW.getTime() + 3600_000),
      status: AuctionStatus.ACTIVE,
      ...overrides,
    });
  }

  function makeBidder(overrides: Partial<Bidder> = {}): Bidder {
    return {
      bidderId: 'b1',
      tenantId: 'T1',
      isEligible: true,
      ...overrides,
    };
  }

  function makeProof(overrides: Partial<CommitmentProof> = {}): CommitmentProof {
    return {
      bidderId: 'b1',
      tenantId: 'T1',
      guaranteedAmount: REQUIRED,
      validUntil: new Date(NOW.getTime() + 1800_000),
      ...overrides,
    };
  }

  function makeCommand(overrides: Partial<SubmitBidCommand> = {}): SubmitBidCommand {
    return {
      auctionId: 'A1',
      bidder: makeBidder(),
      amount: BASE_PRICE,
      bidId: 'bid-1',
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
  runTest('AuctionLadder: invalid K throws INVALID_K', 'Ladder', () => {
    try {
      new AuctionLadder(0);
      throw new Error('Expected INVALID_K');
    } catch (e: unknown) {
      if (!(e instanceof LadderError) || e.code !== 'INVALID_K') throw e;
    }
  });

  runTest('AuctionLadder: invalid bid fields throw specific LadderErrors', 'Ladder', () => {
    const ladder = new AuctionLadder(3);
    const badBids: [LadderBid, string][] = [
      [{ bidId: '', bidderId: 'u', amount: 10, timestamp: 1 }, 'INVALID_BID'],
      [{ bidId: 'x', bidderId: '', amount: 10, timestamp: 1 }, 'INVALID_BID'],
      [{ bidId: 'x', bidderId: 'u', amount: 0, timestamp: 1 }, 'INVALID_AMOUNT'],
      [{ bidId: 'x', bidderId: 'u', amount: -5, timestamp: 1 }, 'INVALID_AMOUNT'],
      [{ bidId: 'x', bidderId: 'u', amount: 10, timestamp: -1 }, 'INVALID_TIMESTAMP'],
    ];

    for (const [bid, code] of badBids) {
      try {
        ladder.place(bid);
        throw new Error(`Expected ${code}`);
      } catch (e: unknown) {
        if (!(e instanceof LadderError) || e.code !== code) throw e;
      }
    }
  });

  runTest('AuctionLadder: sorts by amount desc', 'Ladder', () => {
    const l = new AuctionLadder(3);
    l.place({ bidId: 'b1', bidderId: 'u1', amount: 100, timestamp: 1 });
    l.place({ bidId: 'b2', bidderId: 'u2', amount: 300, timestamp: 2 });
    l.place({ bidId: 'b3', bidderId: 'u3', amount: 200, timestamp: 3 });
    const ids = l.snapshot().map((e) => e.bid.bidId);
    if (JSON.stringify(ids) !== JSON.stringify(['b2', 'b3', 'b1'])) {
      throw new Error(`Order mismatch: ${ids.join(', ')}`);
    }
    if (l.rankOf('b3') !== 2) throw new Error('Rank of b3 must be 2');
  });

  runTest('AuctionLadder: earlier timestamp wins on tie', 'Ladder', () => {
    const l = new AuctionLadder(3);
    l.place({ bidId: 'late', bidderId: 'u1', amount: 100, timestamp: 20 });
    l.place({ bidId: 'early', bidderId: 'u2', amount: 100, timestamp: 10 });
    const ids = l.snapshot().map((e) => e.bid.bidId);
    if (JSON.stringify(ids) !== JSON.stringify(['early', 'late'])) {
      throw new Error(`Tie-breaker failed: ${ids.join(', ')}`);
    }
  });

  runTest('AuctionLadder: full ladder drops worst and marks OUTBID', 'Ladder', () => {
    const l = new AuctionLadder(2);
    l.place({ bidId: 'b1', bidderId: 'u1', amount: 100, timestamp: 1 });
    l.place({ bidId: 'b2', bidderId: 'u2', amount: 200, timestamp: 2 });
    const r = l.place({ bidId: 'b3', bidderId: 'u3', amount: 150, timestamp: 3 });
    if (!r.accepted || r.rank !== 2) throw new Error('Bid b3 should rank at 2');
    if (r.transitions.length !== 1 || r.transitions[0].bidId !== 'b1' || r.transitions[0].newStatus !== LadderBidStatus.OUTBID) {
      throw new Error('Expected b1 outbid transition');
    }
    if (l.statusOf('b1') !== LadderBidStatus.OUTBID) throw new Error('Status of b1 must be OUTBID');
  });

  runTest('AuctionLadder: same bidder higher bid SUPERSEDES previous', 'Ladder', () => {
    const l = new AuctionLadder(3);
    l.place({ bidId: 'b1', bidderId: 'u1', amount: 100, timestamp: 1 });
    l.place({ bidId: 'b2', bidderId: 'u2', amount: 150, timestamp: 2 });
    const r = l.place({ bidId: 'b3', bidderId: 'u1', amount: 200, timestamp: 3 });
    if (!r.accepted || r.rank !== 1) throw new Error('Bid b3 should rank at 1');
    if (l.statusOf('b1') !== LadderBidStatus.SUPERSEDED) throw new Error('b1 must be SUPERSEDED');
    const ids = l.snapshot().map((e) => e.bid.bidId);
    if (JSON.stringify(ids) !== JSON.stringify(['b3', 'b2'])) throw new Error(`Snapshot mismatch: ${ids.join(',')}`);
  });

  runTest('AuctionLadder: same bidder lower or equal rejected with NOT_HIGHER_THAN_OWN_BID', 'Ladder', () => {
    const l = new AuctionLadder(3);
    l.place({ bidId: 'b1', bidderId: 'u1', amount: 100, timestamp: 1 });
    const r1 = l.place({ bidId: 'b2', bidderId: 'u1', amount: 100, timestamp: 2 });
    const r2 = l.place({ bidId: 'b3', bidderId: 'u1', amount: 50, timestamp: 2 });
    if (r1.accepted || r1.reason !== 'NOT_HIGHER_THAN_OWN_BID') throw new Error('r1 should be rejected');
    if (r2.accepted || r2.reason !== 'NOT_HIGHER_THAN_OWN_BID') throw new Error('r2 should be rejected');
  });

  // --- Kernel Unit Tests ---
  runTest('AuctionKernel: first bid at base price is accepted', 'Kernel', () => {
    const auction = makeAuction();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    const result = submitBid(auction, makeCommand(), guard, clock);
    if (result.bid.amount !== BASE_PRICE) throw new Error('Amount mismatch');
    if (result.bid.sequence !== 1) throw new Error('Sequence should be 1');
    if (result.auction.bidCount !== 1) throw new Error('Bid count should be 1');
    if (result.auction.version !== 1) throw new Error('Version should be 1');
  });

  runTest('AuctionKernel: bid below minimum rejected', 'Kernel', () => {
    const auction = makeAuction();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitBid(auction, makeCommand({ amount: BASE_PRICE - 1 }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof BidBelowMinimum)) throw e;
    }
  });

  runTest('AuctionKernel: bid increment too small rejected', 'Kernel', () => {
    const auction = makeAuction();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    const r1 = submitBid(auction, makeCommand({ amount: BASE_PRICE }), guard, clock);
    try {
      submitBid(r1.auction, makeCommand({ bidId: 'bid-2', idempotencyKey: 'idem-2', amount: BASE_PRICE + 10 }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof BidIncrementTooSmall)) throw e;
    }
  });

  runTest('AuctionKernel: seller cannot bid', 'Kernel', () => {
    const auction = makeAuction();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitBid(auction, makeCommand({ bidder: makeBidder({ bidderId: 'seller' }) }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof SellerCannotBid)) throw e;
    }
  });

  runTest('AuctionKernel: ineligible bidder rejected', 'Kernel', () => {
    const auction = makeAuction();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitBid(auction, makeCommand({ bidder: makeBidder({ isEligible: false }) }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof BidderNotEligible)) throw e;
    }
  });

  runTest('AuctionKernel: insufficient commitment proof rejected', 'Kernel', () => {
    const auction = makeAuction();
    const guard = new FakeGuard(makeProof({ guaranteedAmount: REQUIRED - 1 }));
    const clock = new FixedClock(NOW);
    try {
      submitBid(auction, makeCommand(), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof InsufficientCommitment)) throw e;
    }
  });

  runTest('AuctionKernel: duplicate idempotency key rejected', 'Kernel', () => {
    const auction = makeAuction();
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    const seen = new Set(['idem-1']);
    try {
      submitBid(auction, makeCommand({ idempotencyKey: 'idem-1' }), guard, clock, seen);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof DuplicateBid)) throw e;
    }
  });

  runTest('AuctionKernel: stale auction version rejected', 'Kernel', () => {
    const auction = makeAuction({ version: 2 });
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitBid(auction, makeCommand({ expectedVersion: 1 }), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof StaleAuctionVersion)) throw e;
    }
  });

  runTest('AuctionKernel: inactive/expired auction rejected', 'Kernel', () => {
    const guard = new FakeGuard(makeProof());
    const clock = new FixedClock(NOW);
    try {
      submitBid(makeAuction({ status: AuctionStatus.SCHEDULED }), makeCommand(), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof AuctionNotActive)) throw e;
    }

    try {
      submitBid(makeAuction({ startsAt: new Date(NOW.getTime() + 1000) }), makeCommand(), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof AuctionNotStarted)) throw e;
    }

    try {
      submitBid(makeAuction({ endsAt: new Date(NOW.getTime() - 1000) }), makeCommand(), guard, clock);
      throw new Error('Should have failed');
    } catch (e: unknown) {
      if (!(e instanceof AuctionEnded)) throw e;
    }
  });

  // --- Integration Tests (test_kernel_ladder_integration.py) ---
  runTest('Integration: ladder keeps top-K highest first', 'Integration', () => {
    let a = makeAuction({ ladderSize: 3 });
    const clock = new FixedClock(NOW);
    for (let i = 0; i < 5; i++) {
      const bidderId = `b${i}`;
      const guard = new FakeGuard(makeProof({ bidderId }));
      const cmd = makeCommand({
        bidder: makeBidder({ bidderId }),
        amount: BASE_PRICE + i * STEP,
        bidId: `x${i}`,
        idempotencyKey: `k-x${i}`,
      });
      a = submitBid(a, cmd, guard, clock).auction;
    }
    const ladderIds = a.ladder.map((b) => b.bidId);
    if (JSON.stringify(ladderIds) !== JSON.stringify(['x4', 'x3', 'x2'])) {
      throw new Error(`Ladder top-3 mismatch: ${ladderIds.join(',')}`);
    }
    if (a.highestBid?.bidId !== 'x4' || a.bidCount !== 5) {
      throw new Error('Leader or bid count mismatch');
    }
  });

  runTest('Integration: outbid transition reported on ladder drop', 'Integration', () => {
    let a = makeAuction({ ladderSize: 2 });
    const clock = new FixedClock(NOW);
    const placeBid = (bidderId: string, amt: number, bidId: string) => {
      const guard = new FakeGuard(makeProof({ bidderId }));
      const cmd = makeCommand({
        bidder: makeBidder({ bidderId }),
        amount: amt,
        bidId,
        idempotencyKey: `k-${bidId}`,
      });
      return submitBid(a, cmd, guard, clock);
    };

    a = placeBid('b0', BASE_PRICE, 'x0').auction;
    a = placeBid('b1', BASE_PRICE + STEP, 'x1').auction;
    const r = placeBid('b2', BASE_PRICE + 2 * STEP, 'x2');

    const outbidList = r.transitions.map((t) => [t.bidId, t.newStatus]);
    if (JSON.stringify(outbidList) !== JSON.stringify([['x0', LadderBidStatus.OUTBID]])) {
      throw new Error(`Transition mismatch: ${JSON.stringify(outbidList)}`);
    }
    if (r.rank !== 1) throw new Error('Rank should be 1');
    const ladderIds = r.auction.ladder.map((b) => b.bidId);
    if (JSON.stringify(ladderIds) !== JSON.stringify(['x2', 'x1'])) {
      throw new Error(`Ladder mismatch: ${ladderIds.join(',')}`);
    }
  });

  runTest('Integration: input auction is strictly immutable', 'Integration', () => {
    const a = makeAuction({ ladderSize: 2 });
    const guard = new FakeGuard(makeProof({ bidderId: 'b0' }));
    const cmd = makeCommand({
      bidder: makeBidder({ bidderId: 'b0' }),
      amount: BASE_PRICE,
      bidId: 'x0',
      idempotencyKey: 'k-x0',
    });
    submitBid(a, cmd, guard, new FixedClock(NOW));
    if (a.ladder.length !== 0 || a.highestBid !== null) {
      throw new Error('Original auction was mutated!');
    }
  });

  return results;
}
