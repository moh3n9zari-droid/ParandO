/**
 * Parando Auction Kernel (ADR-001) - pure domain logic.
 *
 * Design rules:
 * - No I/O, no framework, no database, no Redis, no payment provider imports.
 * - The kernel never writes ledger entries or holds (K-INV-14). It only asks a
 *   CommitmentGuard (port) for a proof of guaranteed funds (ADR-002 contract).
 * - Exposure must never exceed the guaranteed amount (K-INV-7).
 * - Money is an integer in the smallest unit (Rial). Floats are forbidden.
 * - Time is injected through a Clock port, so the kernel is deterministic.
 */

import {
  AuctionLadder,
  LadderBid,
  LadderBidStatus,
  RankChange,
  StatusTransition,
} from './auction_ladder';

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export class AuctionError extends Error {
  code: string = 'AUCTION_ERROR';

  constructor(message: string = '') {
    super(message || 'AUCTION_ERROR');
    this.name = this.constructor.name;
    if (message) {
      this.message = message;
    }
  }
}

export class AuctionNotActive extends AuctionError {
  override code = 'AUCTION_NOT_ACTIVE';
}

export class AuctionNotStarted extends AuctionError {
  override code = 'AUCTION_NOT_STARTED';
}

export class AuctionEnded extends AuctionError {
  override code = 'AUCTION_ENDED';
}

export class InvalidAmount extends AuctionError {
  override code = 'INVALID_AMOUNT';
}

export class BidBelowMinimum extends AuctionError {
  override code = 'BID_BELOW_MINIMUM';
}

export class BidIncrementTooSmall extends AuctionError {
  override code = 'BID_INCREMENT_TOO_SMALL';
}

export class SellerCannotBid extends AuctionError {
  override code = 'SELLER_CANNOT_BID';
}

export class BidderNotEligible extends AuctionError {
  override code = 'BIDDER_NOT_ELIGIBLE';
}

export class InsufficientCommitment extends AuctionError {
  override code = 'INSUFFICIENT_COMMITMENT';
}

export class DuplicateBid extends AuctionError {
  override code = 'DUPLICATE_BID';
}

export class StaleAuctionVersion extends AuctionError {
  override code = 'STALE_AUCTION_VERSION';
}

// --------------------------------------------------------------------------
// Domain model
// --------------------------------------------------------------------------

export enum AuctionStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export interface Bidder {
  readonly bidderId: string;
  readonly tenantId: string;
  readonly isEligible: boolean; // outcome of identity/compliance
}

export interface Bid {
  readonly bidId: string;
  readonly auctionId: string;
  readonly bidderId: string;
  readonly amount: number;
  readonly placedAt: Date;
  readonly sequence: number; // strictly increasing per auction (Ladder order)
  readonly idempotencyKey: string;
}

export class AuctionRules {
  readonly basePrice: number; // base price (starting price), in Rial
  readonly minIncrement: number; // minimum step above the current highest bid
  readonly depositRateBps: number; // 15% of base price (ADR-001, Q5), basis points default 1500

  constructor(
    basePrice: number,
    minIncrement: number,
    depositRateBps: number = 1500
  ) {
    if (
      typeof basePrice !== 'number' ||
      !Number.isInteger(basePrice) ||
      basePrice <= 0
    ) {
      throw new InvalidAmount('base_price must be positive');
    }
    if (
      typeof minIncrement !== 'number' ||
      !Number.isInteger(minIncrement) ||
      minIncrement <= 0
    ) {
      throw new InvalidAmount('min_increment must be positive');
    }
    if (
      typeof depositRateBps !== 'number' ||
      !Number.isInteger(depositRateBps) ||
      depositRateBps < 0 ||
      depositRateBps > 10000
    ) {
      throw new InvalidAmount('deposit_rate_bps must be within 0..10000');
    }

    this.basePrice = basePrice;
    this.minIncrement = minIncrement;
    this.depositRateBps = depositRateBps;
  }

  /**
   * ExposureRequirement: 15% of the base price, rounded up (ceiling integer division).
   */
  get requiredExposure(): number {
    return Math.ceil((this.basePrice * this.depositRateBps) / 10000);
  }
}

export interface AuctionParams {
  auctionId: string;
  tenantId: string;
  sellerId: string;
  rules: AuctionRules;
  startsAt: Date;
  endsAt: Date;
  status?: AuctionStatus;
  version?: number;
  highestBid?: Bid | null;
  bidCount?: number;
  ladderSize?: number;
  ladder?: readonly Bid[];
}

export class Auction {
  readonly auctionId: string;
  readonly tenantId: string;
  readonly sellerId: string;
  readonly rules: AuctionRules;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: AuctionStatus;
  readonly version: number; // optimistic concurrency token
  readonly highestBid: Bid | null;
  readonly bidCount: number;
  readonly ladderSize: number; // K: number of ranked positions kept (ADR-001 Ladder)
  readonly ladder: readonly Bid[]; // current top-K bids, rank 1 first

  constructor(params: AuctionParams) {
    if (isNaN(params.startsAt.getTime()) || isNaN(params.endsAt.getTime())) {
      throw new Error('auction times must be valid dates');
    }
    if (params.endsAt.getTime() <= params.startsAt.getTime()) {
      throw new Error('ends_at must be after starts_at');
    }
    const ladderSize = params.ladderSize ?? 1;
    if (
      typeof ladderSize !== 'number' ||
      !Number.isInteger(ladderSize) ||
      ladderSize < 1
    ) {
      throw new Error('ladder_size must be >= 1');
    }

    this.auctionId = params.auctionId;
    this.tenantId = params.tenantId;
    this.sellerId = params.sellerId;
    this.rules = params.rules;
    this.startsAt = params.startsAt;
    this.endsAt = params.endsAt;
    this.status = params.status ?? AuctionStatus.SCHEDULED;
    this.version = params.version ?? 0;
    this.highestBid = params.highestBid ?? null;
    this.bidCount = params.bidCount ?? 0;
    this.ladderSize = ladderSize;
    this.ladder = params.ladder ?? [];
  }

  /**
   * Smallest amount a new bid may have right now.
   */
  minimumNextBid(): number {
    if (this.highestBid === null) {
      return this.rules.basePrice;
    }
    return this.highestBid.amount + this.rules.minIncrement;
  }

  /**
   * Return a new Auction state including the bid (immutable).
   */
  accept(bid: Bid, newLadder?: readonly Bid[]): Auction {
    const resolvedLadder = newLadder !== undefined ? newLadder : [bid];
    return new Auction({
      auctionId: this.auctionId,
      tenantId: this.tenantId,
      sellerId: this.sellerId,
      rules: this.rules,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      status: this.status,
      version: this.version + 1,
      highestBid: resolvedLadder.length > 0 ? resolvedLadder[0] : bid,
      bidCount: this.bidCount + 1,
      ladderSize: this.ladderSize,
      ladder: resolvedLadder,
    });
  }
}

// --------------------------------------------------------------------------
// Ports (implemented outside the kernel)
// --------------------------------------------------------------------------

export interface CommitmentProof {
  readonly bidderId: string;
  readonly tenantId: string;
  readonly guaranteedAmount: number; // only provider-confirmed amount counts
  readonly validUntil: Date;
}

export interface CommitmentGuard {
  getProof(bidderId: string, tenantId: string): CommitmentProof | null;
}

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  private _now: Date;

  constructor(now: Date) {
    this._now = now;
  }

  now(): Date {
    return this._now;
  }

  setNow(now: Date): void {
    this._now = now;
  }
}

// --------------------------------------------------------------------------
// SubmitBid use case
// --------------------------------------------------------------------------

export interface SubmitBidCommand {
  readonly auctionId: string;
  readonly bidder: Bidder;
  readonly amount: number;
  readonly bidId: string;
  readonly idempotencyKey: string;
  readonly expectedVersion?: number | null; // optional optimistic lock
}

export interface SubmitBidResult {
  readonly auction: Auction;
  readonly bid: Bid;
  readonly requiredExposure: number;
  readonly guaranteedAmount: number;
  readonly rank: number;
  readonly transitions: readonly StatusTransition[];
  readonly rankChanges: readonly RankChange[];
}

function toLadderBid(bid: Bid): LadderBid {
  return {
    bidId: bid.bidId,
    bidderId: bid.bidderId,
    amount: bid.amount,
    timestamp: bid.placedAt.getTime() * 1000, // convert ms to microseconds for fine grain
  };
}

export function submitBid(
  auction: Auction,
  command: SubmitBidCommand,
  guard: CommitmentGuard,
  clock: Clock,
  seenIdempotencyKeys: ReadonlySet<string> = new Set()
): SubmitBidResult {
  const now = clock.now();

  // 0. Idempotency and concurrency
  if (seenIdempotencyKeys.has(command.idempotencyKey)) {
    throw new DuplicateBid(command.idempotencyKey);
  }
  if (command.auctionId !== auction.auctionId) {
    throw new AuctionNotActive('auction id mismatch');
  }
  if (
    command.expectedVersion !== undefined &&
    command.expectedVersion !== null &&
    command.expectedVersion !== auction.version
  ) {
    throw new StaleAuctionVersion(
      `expected ${command.expectedVersion}, actual ${auction.version}`
    );
  }

  // 1. Auction must be active and inside its time window
  if (auction.status !== AuctionStatus.ACTIVE) {
    throw new AuctionNotActive(`status is ${auction.status}`);
  }
  if (now.getTime() < auction.startsAt.getTime()) {
    throw new AuctionNotStarted();
  }
  if (now.getTime() >= auction.endsAt.getTime()) {
    throw new AuctionEnded();
  }

  // 2. Bidder rules (tenant isolation, eligibility, seller conflict)
  const bidder = command.bidder;
  if (bidder.tenantId !== auction.tenantId) {
    throw new BidderNotEligible('tenant mismatch');
  }
  if (!bidder.isEligible) {
    throw new BidderNotEligible();
  }
  if (bidder.bidderId === auction.sellerId) {
    throw new SellerCannotBid();
  }

  // 3. Amount validation: minimum price and incremental step
  if (
    typeof command.amount !== 'number' ||
    !Number.isInteger(command.amount)
  ) {
    throw new InvalidAmount('amount must be an integer (Rial)');
  }
  if (command.amount <= 0) {
    throw new InvalidAmount('amount must be positive');
  }
  if (auction.highestBid === null) {
    if (command.amount < auction.rules.basePrice) {
      throw new BidBelowMinimum(
        `minimum is ${auction.rules.basePrice}, got ${command.amount}`
      );
    }
  } else {
    const minimum = auction.minimumNextBid();
    if (command.amount < minimum) {
      throw new BidIncrementTooSmall(
        `minimum next bid is ${minimum}, got ${command.amount}`
      );
    }
  }

  // 4. Financial pre-authorization hook (K-INV-7: exposure <= guaranteed)
  const required = auction.rules.requiredExposure;
  const proof = guard.getProof(bidder.bidderId, bidder.tenantId);
  if (proof === null || proof === undefined) {
    throw new InsufficientCommitment('no commitment proof');
  }
  if (
    proof.bidderId !== bidder.bidderId ||
    proof.tenantId !== auction.tenantId
  ) {
    throw new InsufficientCommitment('proof does not match bidder or tenant');
  }
  if (proof.validUntil.getTime() <= now.getTime()) {
    throw new InsufficientCommitment('commitment proof expired');
  }
  if (proof.guaranteedAmount < required) {
    throw new InsufficientCommitment(
      `required ${required}, guaranteed ${proof.guaranteedAmount}`
    );
  }

  // 5. Accept the bid (new immutable state)
  const bid: Bid = {
    bidId: command.bidId,
    auctionId: auction.auctionId,
    bidderId: bidder.bidderId,
    amount: command.amount,
    placedAt: now,
    sequence: auction.bidCount + 1,
    idempotencyKey: command.idempotencyKey,
  };

  // 6. Ladder: rebuild current top-K deterministically, then place the new bid.
  const ladder = new AuctionLadder(auction.ladderSize);
  const existingSorted = [...auction.ladder].sort(
    (a, b) => a.sequence - b.sequence
  );
  for (const existing of existingSorted) {
    ladder.place(toLadderBid(existing));
  }
  const outcome = ladder.place(toLadderBid(bid));

  if (!outcome.accepted) {
    throw new BidBelowMinimum(
      `bid does not rank in top ${auction.ladderSize}: ${outcome.reason}`
    );
  }

  const byId = new Map<string, Bid>();
  for (const b of auction.ladder) {
    byId.set(b.bidId, b);
  }
  byId.set(bid.bidId, bid);

  const newLadder: Bid[] = ladder
    .snapshot()
    .map((e) => byId.get(e.bid.bidId)!)
    .filter(Boolean);

  return {
    auction: auction.accept(bid, newLadder),
    bid,
    requiredExposure: required,
    guaranteedAmount: proof.guaranteedAmount,
    rank: outcome.rank ?? 1,
    transitions: outcome.transitions,
    rankChanges: outcome.rankChanges,
  };
}

export { LadderBidStatus };
