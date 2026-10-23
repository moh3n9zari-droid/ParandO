/**
 * Parando Competition Kernel (ADR-001, TR-01, TR-12, TR-13) - pure domain logic.
 *
 * TR-01: Renamed Auction/Bid to Competition/Offer.
 * TR-12: Idempotent replay on identical payload, conflict error on payload mismatch.
 * TR-13: Sequence tie-breaker on equal amounts.
 * K-INV-7: Exposure <= guaranteed funds proof.
 * K-INV-14: Read-only commitment guard port.
 */

import {
  CompetitionLadder,
  LadderOffer,
  LadderOfferStatus,
  RankChange,
  StatusTransition,
} from './competition_ladder';

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export class CompetitionError extends Error {
  code: string = 'COMPETITION_ERROR';

  constructor(message: string = '') {
    super(message || 'COMPETITION_ERROR');
    this.name = this.constructor.name;
    if (message) {
      this.message = message;
    }
  }
}

export const AuctionError = CompetitionError;

export class CompetitionNotActive extends CompetitionError {
  override code = 'COMPETITION_NOT_ACTIVE';
}
export const AuctionNotActive = CompetitionNotActive;

export class CompetitionNotStarted extends CompetitionError {
  override code = 'COMPETITION_NOT_STARTED';
}
export const AuctionNotStarted = CompetitionNotStarted;

export class CompetitionEnded extends CompetitionError {
  override code = 'COMPETITION_ENDED';
}
export const AuctionEnded = CompetitionEnded;

export class InvalidAmount extends CompetitionError {
  override code = 'INVALID_AMOUNT';
}

export class OfferBelowMinimum extends CompetitionError {
  override code = 'OFFER_BELOW_MINIMUM';
}
export const BidBelowMinimum = OfferBelowMinimum;

export class OfferIncrementTooSmall extends CompetitionError {
  override code = 'OFFER_INCREMENT_TOO_SMALL';
}
export const BidIncrementTooSmall = OfferIncrementTooSmall;

export class SellerCannotOffer extends CompetitionError {
  override code = 'SELLER_CANNOT_OFFER';
}
export const SellerCannotBid = SellerCannotOffer;

export class OffererNotEligible extends CompetitionError {
  override code = 'OFFERER_NOT_ELIGIBLE';
}
export const BidderNotEligible = OffererNotEligible;

export class InsufficientCommitment extends CompetitionError {
  override code = 'INSUFFICIENT_COMMITMENT';
}

export class DuplicateOffer extends CompetitionError {
  override code = 'DUPLICATE_OFFER';
}
export const DuplicateBid = DuplicateOffer;

export class OfferConflict extends CompetitionError {
  override code = 'OFFER_CONFLICT';
}
export const IdempotencyConflict = OfferConflict;

export class StaleCompetitionVersion extends CompetitionError {
  override code = 'STALE_COMPETITION_VERSION';
}
export const StaleAuctionVersion = StaleCompetitionVersion;

// --------------------------------------------------------------------------
// Domain model
// --------------------------------------------------------------------------

export enum CompetitionStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}
export { CompetitionStatus as AuctionStatus };

export interface Offerer {
  readonly offererId: string;
  readonly tenantId: string;
  readonly isEligible: boolean;
  // Alias
  readonly bidderId?: string;
}
export type Bidder = Offerer;

export interface Offer {
  readonly offerId: string;
  readonly competitionId: string;
  readonly offererId: string;
  readonly amount: number;
  readonly placedAt: Date;
  readonly sequence: number; // strictly increasing per competition (TR-13 ladder order)
  readonly idempotencyKey: string;
  // Aliases
  readonly bidId?: string;
  readonly auctionId?: string;
  readonly bidderId?: string;
}
export type Bid = Offer;

export class CompetitionRules {
  readonly basePrice: number;
  readonly minIncrement: number;
  readonly depositRateBps: number;

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

  get requiredExposure(): number {
    return Math.ceil((this.basePrice * this.depositRateBps) / 10000);
  }
}
export const AuctionRules = CompetitionRules;

export interface CompetitionParams {
  competitionId: string;
  tenantId: string;
  sellerId: string;
  rules: CompetitionRules;
  startsAt: Date;
  endsAt: Date;
  status?: CompetitionStatus;
  version?: number;
  highestOffer?: Offer | null;
  offerCount?: number;
  ladderSize?: number;
  ladder?: readonly Offer[];
  // Backwards compatibility params
  auctionId?: string;
  highestBid?: Offer | null;
  bidCount?: number;
}

export class Competition {
  readonly competitionId: string;
  readonly tenantId: string;
  readonly sellerId: string;
  readonly rules: CompetitionRules;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: CompetitionStatus;
  readonly version: number;
  readonly highestOffer: Offer | null;
  readonly offerCount: number;
  readonly ladderSize: number;
  readonly ladder: readonly Offer[];

  // Aliases
  get auctionId(): string {
    return this.competitionId;
  }
  get highestBid(): Offer | null {
    return this.highestOffer;
  }
  get bidCount(): number {
    return this.offerCount;
  }

  constructor(params: CompetitionParams) {
    const competitionId = params.competitionId || params.auctionId || '';
    if (isNaN(params.startsAt.getTime()) || isNaN(params.endsAt.getTime())) {
      throw new Error('competition times must be valid dates');
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

    this.competitionId = competitionId;
    this.tenantId = params.tenantId;
    this.sellerId = params.sellerId;
    this.rules = params.rules;
    this.startsAt = params.startsAt;
    this.endsAt = params.endsAt;
    this.status = params.status ?? CompetitionStatus.SCHEDULED;
    this.version = params.version ?? 0;
    this.highestOffer = params.highestOffer ?? params.highestBid ?? null;
    this.offerCount = params.offerCount ?? params.bidCount ?? 0;
    this.ladderSize = ladderSize;
    this.ladder = params.ladder ?? [];
  }

  minimumNextOffer(): number {
    if (this.highestOffer === null) {
      return this.rules.basePrice;
    }
    return this.highestOffer.amount + this.rules.minIncrement;
  }

  minimumNextBid(): number {
    return this.minimumNextOffer();
  }

  accept(offer: Offer, newLadder?: readonly Offer[]): Competition {
    const resolvedLadder = newLadder !== undefined ? newLadder : [offer];
    return new Competition({
      competitionId: this.competitionId,
      tenantId: this.tenantId,
      sellerId: this.sellerId,
      rules: this.rules,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      status: this.status,
      version: this.version + 1,
      highestOffer: resolvedLadder.length > 0 ? resolvedLadder[0] : offer,
      offerCount: this.offerCount + 1,
      ladderSize: this.ladderSize,
      ladder: resolvedLadder,
    });
  }
}
export const Auction = Competition;

// --------------------------------------------------------------------------
// Ports
// --------------------------------------------------------------------------

export interface CommitmentProof {
  readonly offererId: string;
  readonly tenantId: string;
  readonly guaranteedAmount: number;
  readonly validUntil: Date;
  readonly bidderId?: string;
}

export interface CommitmentGuard {
  getProof(offererId: string, tenantId: string): CommitmentProof | null;
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
// SubmitOffer use case
// --------------------------------------------------------------------------

export interface SubmitOfferCommand {
  readonly competitionId: string;
  readonly offerer: Offerer;
  readonly amount: number;
  readonly offerId: string;
  readonly idempotencyKey: string;
  readonly expectedVersion?: number | null;
  // Aliases
  readonly auctionId?: string;
  readonly bidder?: Offerer;
  readonly bidId?: string;
}
export type SubmitBidCommand = SubmitOfferCommand;

export interface SubmitOfferResult {
  readonly competition: Competition;
  readonly offer: Offer;
  readonly requiredExposure: number;
  readonly guaranteedAmount: number;
  readonly rank: number;
  readonly transitions: readonly StatusTransition[];
  readonly rankChanges: readonly RankChange[];
  // Aliases
  readonly auction?: Competition;
  readonly bid?: Offer;
}
export type SubmitBidResult = SubmitOfferResult;

function toLadderOffer(offer: Offer): LadderOffer {
  return {
    offerId: offer.offerId,
    offererId: offer.offererId,
    amount: offer.amount,
    sequence: offer.sequence,
    timestamp: offer.placedAt.getTime(),
  };
}

export function submitOffer(
  competition: Competition,
  commandInput: SubmitOfferCommand,
  guard: CommitmentGuard,
  clock: Clock,
  seenIdempotencyRecords?: Map<string, { command: SubmitOfferCommand; result: SubmitOfferResult }> | Set<string>
): SubmitOfferResult {
  const command: SubmitOfferCommand = {
    competitionId: commandInput.competitionId || commandInput.auctionId || '',
    offerer: commandInput.offerer || commandInput.bidder!,
    amount: commandInput.amount,
    offerId: commandInput.offerId || commandInput.bidId || '',
    idempotencyKey: commandInput.idempotencyKey,
    expectedVersion: commandInput.expectedVersion,
  };

  const now = clock.now();

  // TR-12: Idempotency & Conflict Check
  if (seenIdempotencyRecords) {
    if (seenIdempotencyRecords instanceof Map) {
      if (seenIdempotencyRecords.has(command.idempotencyKey)) {
        const prior = seenIdempotencyRecords.get(command.idempotencyKey)!;
        // Compare payload
        if (
          prior.command.competitionId === command.competitionId &&
          prior.command.offerer.offererId === command.offerer.offererId &&
          prior.command.amount === command.amount &&
          prior.command.offerId === command.offerId
        ) {
          return prior.result; // Identical payload: replay previous response
        } else {
          throw new OfferConflict(
            `idempotency key '${command.idempotencyKey}' reused with conflicting payload`
          );
        }
      }
    } else if (seenIdempotencyRecords instanceof Set) {
      if (seenIdempotencyRecords.has(command.idempotencyKey)) {
        throw new DuplicateOffer(command.idempotencyKey);
      }
    }
  }

  if (command.competitionId !== competition.competitionId) {
    throw new CompetitionNotActive('competition id mismatch');
  }
  if (
    command.expectedVersion !== undefined &&
    command.expectedVersion !== null &&
    command.expectedVersion !== competition.version
  ) {
    throw new StaleCompetitionVersion(
      `expected ${command.expectedVersion}, actual ${competition.version}`
    );
  }

  // 1. Competition active window
  if (competition.status !== CompetitionStatus.ACTIVE) {
    throw new CompetitionNotActive(`status is ${competition.status}`);
  }
  if (now.getTime() < competition.startsAt.getTime()) {
    throw new CompetitionNotStarted();
  }
  if (now.getTime() >= competition.endsAt.getTime()) {
    throw new CompetitionEnded();
  }

  // 2. Offerer eligibility & seller conflict
  const offerer = command.offerer;
  if (offerer.tenantId !== competition.tenantId) {
    throw new OffererNotEligible('tenant mismatch');
  }
  if (!offerer.isEligible) {
    throw new OffererNotEligible();
  }
  if (offerer.offererId === competition.sellerId) {
    throw new SellerCannotOffer();
  }

  // 3. Amount validation
  if (typeof command.amount !== 'number' || !Number.isInteger(command.amount)) {
    throw new InvalidAmount('amount must be an integer (Rial)');
  }
  if (command.amount <= 0) {
    throw new InvalidAmount('amount must be positive');
  }
  if (competition.highestOffer === null) {
    if (command.amount < competition.rules.basePrice) {
      throw new OfferBelowMinimum(
        `minimum is ${competition.rules.basePrice}, got ${command.amount}`
      );
    }
  } else {
    const minimum = competition.minimumNextOffer();
    if (command.amount < minimum) {
      throw new OfferIncrementTooSmall(
        `minimum next offer is ${minimum}, got ${command.amount}`
      );
    }
  }

  // 4. Financial pre-authorization hook (K-INV-7)
  const required = competition.rules.requiredExposure;
  const proof = guard.getProof(offerer.offererId, offerer.tenantId);
  if (!proof) {
    throw new InsufficientCommitment('no commitment proof');
  }
  if (
    proof.offererId !== offerer.offererId ||
    proof.tenantId !== competition.tenantId
  ) {
    throw new InsufficientCommitment('proof does not match offerer or tenant');
  }
  if (proof.validUntil.getTime() <= now.getTime()) {
    throw new InsufficientCommitment('commitment proof expired');
  }
  if (proof.guaranteedAmount < required) {
    throw new InsufficientCommitment(
      `required ${required}, guaranteed ${proof.guaranteedAmount}`
    );
  }

  // 5. Accept the offer (TR-13: Sequence incremented)
  const nextSeq = competition.offerCount + 1;
  const offer: Offer = {
    offerId: command.offerId,
    competitionId: competition.competitionId,
    offererId: offerer.offererId,
    amount: command.amount,
    placedAt: now,
    sequence: nextSeq,
    idempotencyKey: command.idempotencyKey,
    // Aliases
    bidId: command.offerId,
    auctionId: competition.competitionId,
    bidderId: offerer.offererId,
  };

  // 6. Ladder: rebuild current top-K deterministically, then place new offer
  const ladder = new CompetitionLadder(competition.ladderSize);
  const existingSorted = [...competition.ladder].sort(
    (a, b) => a.sequence - b.sequence
  );
  for (const existing of existingSorted) {
    ladder.place(toLadderOffer(existing));
  }
  const outcome = ladder.place(toLadderOffer(offer));

  if (!outcome.accepted) {
    throw new OfferBelowMinimum(
      `offer does not rank in top ${competition.ladderSize}: ${outcome.reason}`
    );
  }

  const byId = new Map<string, Offer>();
  for (const o of competition.ladder) {
    byId.set(o.offerId, o);
  }
  byId.set(offer.offerId, offer);

  const newLadder: Offer[] = ladder
    .snapshot()
    .map((e) => byId.get(e.offer.offerId)!)
    .filter(Boolean);

  const updatedComp = competition.accept(offer, newLadder);
  const result: SubmitOfferResult = {
    competition: updatedComp,
    offer,
    requiredExposure: required,
    guaranteedAmount: proof.guaranteedAmount,
    rank: outcome.rank ?? 1,
    transitions: outcome.transitions,
    rankChanges: outcome.rankChanges,
    auction: updatedComp,
    bid: offer,
  };

  if (seenIdempotencyRecords && seenIdempotencyRecords instanceof Map) {
    seenIdempotencyRecords.set(command.idempotencyKey, { command, result });
  }

  return result;
}

export const submitBid = submitOffer;
export { LadderOfferStatus };
