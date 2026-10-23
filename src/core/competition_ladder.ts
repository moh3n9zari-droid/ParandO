/**
 * Competition Ladder (ADR-001, TR-01, TR-12, TR-13).
 *
 * Maintains top-K ranked offers of one competition.
 * Pure, I/O-free. Deterministic ordering.
 *
 * TR-01: Renamed from Auction/Bid to Competition/Offer.
 * TR-13: Tie-breaking logic: On equal amounts, ranking is determined
 *        strictly by Offer Sequence Number (lower sequence wins).
 * TR-12: Idempotent replay on identical payload, conflict error on payload mismatch.
 *
 * Ordering (rank 1 is best):
 *   1. amount            higher wins
 *   2. sequence          lower wins (TR-13 Offer Sequence Number tie-breaker)
 */

export enum LadderOfferStatus {
  RANKED = 'RANKED',
  OUTBID = 'OUTBID', // fell out of the top K
  SUPERSEDED = 'SUPERSEDED', // replaced by a higher offer of the same offerer
  REJECTED = 'REJECTED', // never entered the ladder
}

// Backwards compatibility alias
export { LadderOfferStatus as LadderBidStatus };

export class LadderError extends Error {
  code: string;

  constructor(code: string, message: string = '') {
    super(message ? `${code}: ${message}` : code);
    this.name = 'LadderError';
    this.code = code;
  }
}

export class IdempotencyConflict extends LadderError {
  constructor(message: string = 'idempotency key payload mismatch') {
    super('IDEMPOTENCY_CONFLICT', message);
  }
}

export interface LadderOffer {
  readonly offerId: string;
  readonly offererId: string;
  readonly amount: number;
  readonly sequence: number; // TR-13 Offer Sequence Number
  readonly timestamp?: number;
}

// Backwards compatibility alias
export type LadderBid = LadderOffer & {
  readonly bidId?: string;
  readonly bidderId?: string;
};

export interface LadderEntry {
  readonly rank: number;
  readonly offer: LadderOffer;
}

export interface StatusTransition {
  readonly offerId: string;
  readonly offererId: string;
  readonly newStatus: LadderOfferStatus;
  readonly previousRank: number | null;
  readonly reason: string;
  // Aliases
  readonly bidId?: string;
  readonly bidderId?: string;
}

export interface RankChange {
  readonly offerId: string;
  readonly offererId: string;
  readonly oldRank: number | null;
  readonly newRank: number;
  // Aliases
  readonly bidId?: string;
  readonly bidderId?: string;
}

export interface LadderResult {
  readonly accepted: boolean;
  readonly status: LadderOfferStatus;
  readonly rank: number | null;
  readonly reason: string;
  readonly transitions: readonly StatusTransition[];
  readonly rankChanges: readonly RankChange[];
  readonly duplicate: boolean;
}

function compareLadderOffers(a: LadderOffer, b: LadderOffer): number {
  // 1. amount desc
  if (a.amount !== b.amount) {
    return b.amount - a.amount;
  }
  // 2. TR-13: Offer Sequence Number asc (lower sequence wins tie)
  return a.sequence - b.sequence;
}

export class CompetitionLadder {
  private readonly _k: number;
  private _seq: number = 0;
  private _items: LadderOffer[] = [];
  private _status: Map<string, LadderOfferStatus> = new Map();
  private _results: Map<string, LadderResult> = new Map();
  private _payloads: Map<string, { offererId: string; amount: number }> = new Map();

  constructor(k: number) {
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 1) {
      throw new LadderError('INVALID_K', 'k must be an integer >= 1');
    }
    this._k = k;
  }

  get k(): number {
    return this._k;
  }

  snapshot(): LadderEntry[] {
    return this._items.map((offer, index) => ({
      rank: index + 1,
      offer,
    }));
  }

  rankOf(offerId: string): number | null {
    for (let i = 0; i < this._items.length; i++) {
      if (this._items[i].offerId === offerId) {
        return i + 1;
      }
    }
    return null;
  }

  statusOf(offerId: string): LadderOfferStatus | null {
    return this._status.get(offerId) ?? null;
  }

  leader(): LadderOffer | null {
    return this._items.length > 0 ? this._items[0] : null;
  }

  threshold(): number | null {
    if (this._items.length < this._k) {
      return null;
    }
    return this._items[this._items.length - 1].amount;
  }

  place(offerInput: LadderOffer): LadderResult {
    CompetitionLadder.validate(offerInput);

    const prior = this._results.get(offerInput.offerId);
    if (prior !== undefined) {
      // TR-12: Check identical payload
      const recorded = this._payloads.get(offerInput.offerId);
      if (
        recorded &&
        (recorded.offererId !== offerInput.offererId ||
          recorded.amount !== offerInput.amount)
      ) {
        throw new IdempotencyConflict(
          `offer ${offerInput.offerId} payload mismatch with previous submission`
        );
      }
      return {
        accepted: prior.accepted,
        status: this._status.get(offerInput.offerId) ?? LadderOfferStatus.REJECTED,
        rank: this.rankOf(offerInput.offerId),
        reason: prior.reason,
        transitions: [],
        rankChanges: [],
        duplicate: true,
      };
    }

    let offer = offerInput;
    if (!offer.sequence || offer.sequence === 0) {
      this._seq += 1;
      offer = {
        offerId: offerInput.offerId,
        offererId: offerInput.offererId,
        amount: offerInput.amount,
        sequence: this._seq,
        timestamp: offerInput.timestamp,
      };
    }

    const oldRanks = new Map<string, number>();
    for (let i = 0; i < this._items.length; i++) {
      oldRanks.set(this._items[i].offerId, i + 1);
    }

    const transitions: StatusTransition[] = [];

    const existingIdx = this._items.findIndex((o) => o.offererId === offer.offererId);
    let existingItem: LadderOffer | null = null;

    if (existingIdx !== -1) {
      existingItem = this._items[existingIdx];
      if (offer.amount <= existingItem.amount) {
        return this.reject(
          offer,
          'NOT_HIGHER_THAN_OWN_BID',
          'offerer already holds an equal or higher offer'
        );
      }
      this._items.splice(existingIdx, 1);
      this._status.set(existingItem.offerId, LadderOfferStatus.SUPERSEDED);
      transitions.push({
        offerId: existingItem.offerId,
        offererId: existingItem.offererId,
        newStatus: LadderOfferStatus.SUPERSEDED,
        previousRank: oldRanks.get(existingItem.offerId) ?? null,
        reason: 'REPLACED_BY_OWN_HIGHER_BID',
        bidId: existingItem.offerId,
        bidderId: existingItem.offererId,
      });
    }

    if (this._items.length >= this._k) {
      const worst = this._items[this._items.length - 1];
      if (compareLadderOffers(offer, worst) >= 0) {
        if (existingItem !== null) {
          return this.restoreAndReject(existingItem, offer);
        }
        return this.reject(offer, 'BELOW_LADDER', 'does not rank within the top K');
      }
    }

    this._items.push(offer);
    this._items.sort(compareLadderOffers);

    if (this._items.length > this._k) {
      const dropped = this._items.pop();
      if (dropped) {
        this._status.set(dropped.offerId, LadderOfferStatus.OUTBID);
        transitions.push({
          offerId: dropped.offerId,
          offererId: dropped.offererId,
          newStatus: LadderOfferStatus.OUTBID,
          previousRank: oldRanks.get(dropped.offerId) ?? null,
          reason: 'FELL_OUT_OF_TOP_K',
          bidId: dropped.offerId,
          bidderId: dropped.offererId,
        });
      }
    }

    this._status.set(offer.offerId, LadderOfferStatus.RANKED);
    this._payloads.set(offer.offerId, {
      offererId: offer.offererId,
      amount: offer.amount,
    });

    const newRanks = new Map<string, number>();
    for (let i = 0; i < this._items.length; i++) {
      newRanks.set(this._items[i].offerId, i + 1);
    }

    const changes: RankChange[] = [];
    for (let i = 0; i < this._items.length; i++) {
      const o = this._items[i];
      const oldRank = oldRanks.get(o.offerId) ?? null;
      const newRank = newRanks.get(o.offerId)!;
      if (oldRank !== newRank) {
        changes.push({
          offerId: o.offerId,
          offererId: o.offererId,
          oldRank,
          newRank,
          bidId: o.offerId,
          bidderId: o.offererId,
        });
      }
    }

    const result: LadderResult = {
      accepted: true,
      status: LadderOfferStatus.RANKED,
      rank: newRanks.get(offer.offerId) ?? null,
      reason: 'ACCEPTED',
      transitions,
      rankChanges: changes,
      duplicate: false,
    };
    this._results.set(offer.offerId, result);
    return result;
  }

  private static validate(offer: LadderOffer): void {
    if (!offer.offerId || !offer.offererId) {
      throw new LadderError('INVALID_BID', 'offer_id and offerer_id are required');
    }
    if (
      typeof offer.amount !== 'number' ||
      !Number.isInteger(offer.amount) ||
      offer.amount <= 0
    ) {
      throw new LadderError('INVALID_AMOUNT', 'amount must be a positive integer');
    }
  }

  private reject(offer: LadderOffer, code: string, message: string = ''): LadderResult {
    void message;
    this._status.set(offer.offerId, LadderOfferStatus.REJECTED);
    this._payloads.set(offer.offerId, {
      offererId: offer.offererId,
      amount: offer.amount,
    });
    const res: LadderResult = {
      accepted: false,
      status: LadderOfferStatus.REJECTED,
      rank: null,
      reason: code,
      transitions: [],
      rankChanges: [],
      duplicate: false,
    };
    this._results.set(offer.offerId, res);
    return res;
  }

  private restoreAndReject(existing: LadderOffer, offer: LadderOffer): LadderResult {
    this._items.push(existing);
    this._items.sort(compareLadderOffers);
    this._status.set(existing.offerId, LadderOfferStatus.RANKED);
    return this.reject(offer, 'BELOW_LADDER', 'does not rank within the top K');
  }
}

// Backwards compatibility alias
export { CompetitionLadder as AuctionLadder };
