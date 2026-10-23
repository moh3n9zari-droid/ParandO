/**
 * Auction Ladder: maintains the top-K ranked bids of one auction.
 *
 * Pure domain logic, I/O-free. Deterministic ordering.
 *
 * Ordering (rank 1 is best):
 *   1. amount            higher wins
 *   2. timestamp         earlier wins (tie-breaker)
 *   3. sequence          lower wins (final deterministic tie-breaker)
 *
 * Each bidder holds at most one ladder position (their best bid).
 * Amounts are integer Rial.
 */

export enum LadderBidStatus {
  RANKED = 'RANKED',
  OUTBID = 'OUTBID', // fell out of the top K
  SUPERSEDED = 'SUPERSEDED', // replaced by a higher bid of the same bidder
  REJECTED = 'REJECTED', // never entered the ladder
}

export class LadderError extends Error {
  code: string;

  constructor(code: string, message: string = '') {
    super(message ? `${code}: ${message}` : code);
    this.name = 'LadderError';
    this.code = code;
  }
}

export interface LadderBid {
  readonly bidId: string;
  readonly bidderId: string;
  readonly amount: number;
  readonly timestamp: number; // monotonic/epoch units (e.g. microseconds or ms)
}

export interface LadderEntry {
  readonly rank: number;
  readonly bid: LadderBid;
}

export interface StatusTransition {
  readonly bidId: string;
  readonly bidderId: string;
  readonly newStatus: LadderBidStatus;
  readonly previousRank: number | null;
  readonly reason: string;
}

export interface RankChange {
  readonly bidId: string;
  readonly bidderId: string;
  readonly oldRank: number | null;
  readonly newRank: number;
}

export interface LadderResult {
  readonly accepted: boolean;
  readonly status: LadderBidStatus;
  readonly rank: number | null;
  readonly reason: string;
  readonly transitions: readonly StatusTransition[];
  readonly rankChanges: readonly RankChange[];
  readonly duplicate: boolean;
}

function compareLadderItems(a: [number, LadderBid], b: [number, LadderBid]): number {
  // 1. amount desc
  if (a[1].amount !== b[1].amount) {
    return b[1].amount - a[1].amount;
  }
  // 2. timestamp asc
  if (a[1].timestamp !== b[1].timestamp) {
    return a[1].timestamp - b[1].timestamp;
  }
  // 3. sequence asc
  return a[0] - b[0];
}

export class AuctionLadder {
  private readonly _k: number;
  private _seq: number = 0;
  private _items: [number, LadderBid][] = [];
  private _status: Map<string, LadderBidStatus> = new Map();
  private _results: Map<string, LadderResult> = new Map();

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
    return this._items.map(([_, bid], index) => ({
      rank: index + 1,
      bid,
    }));
  }

  rankOf(bidId: string): number | null {
    for (let i = 0; i < this._items.length; i++) {
      if (this._items[i][1].bidId === bidId) {
        return i + 1;
      }
    }
    return null;
  }

  statusOf(bidId: string): LadderBidStatus | null {
    return this._status.get(bidId) ?? null;
  }

  leader(): LadderBid | null {
    return this._items.length > 0 ? this._items[0][1] : null;
  }

  threshold(): number | null {
    if (this._items.length < this._k) {
      return null;
    }
    return this._items[this._items.length - 1][1].amount;
  }

  place(bid: LadderBid): LadderResult {
    AuctionLadder.validate(bid);

    const prior = this._results.get(bid.bidId);
    if (prior !== undefined) {
      return {
        accepted: prior.accepted,
        status: this._status.get(bid.bidId) ?? LadderBidStatus.REJECTED,
        rank: this.rankOf(bid.bidId),
        reason: prior.reason,
        transitions: [],
        rankChanges: [],
        duplicate: true,
      };
    }

    const oldRanks = new Map<string, number>();
    for (let i = 0; i < this._items.length; i++) {
      oldRanks.set(this._items[i][1].bidId, i + 1);
    }

    const transitions: StatusTransition[] = [];

    const existingIdx = this._items.findIndex(([_, b]) => b.bidderId === bid.bidderId);
    let existingItem: [number, LadderBid] | null = null;

    if (existingIdx !== -1) {
      existingItem = this._items[existingIdx];
      const exBid = existingItem[1];
      if (bid.amount <= exBid.amount) {
        return this.reject(
          bid,
          'NOT_HIGHER_THAN_OWN_BID',
          'bidder already holds an equal or higher bid'
        );
      }
      this._items.splice(existingIdx, 1);
      this._status.set(exBid.bidId, LadderBidStatus.SUPERSEDED);
      transitions.push({
        bidId: exBid.bidId,
        bidderId: exBid.bidderId,
        newStatus: LadderBidStatus.SUPERSEDED,
        previousRank: oldRanks.get(exBid.bidId) ?? null,
        reason: 'REPLACED_BY_OWN_HIGHER_BID',
      });
    }

    this._seq += 1;
    const candidate: [number, LadderBid] = [this._seq, bid];

    if (this._items.length >= this._k) {
      const worst = this._items[this._items.length - 1];
      if (compareLadderItems(candidate, worst) >= 0) {
        if (existingItem !== null) {
          return this.restoreAndReject(existingItem, bid);
        }
        return this.reject(bid, 'BELOW_LADDER', 'does not rank within the top K');
      }
    }

    this._items.push(candidate);
    this._items.sort(compareLadderItems);

    if (this._items.length > this._k) {
      const droppedItem = this._items.pop();
      if (droppedItem) {
        const dropped = droppedItem[1];
        this._status.set(dropped.bidId, LadderBidStatus.OUTBID);
        transitions.push({
          bidId: dropped.bidId,
          bidderId: dropped.bidderId,
          newStatus: LadderBidStatus.OUTBID,
          previousRank: oldRanks.get(dropped.bidId) ?? null,
          reason: 'FELL_OUT_OF_TOP_K',
        });
      }
    }

    this._status.set(bid.bidId, LadderBidStatus.RANKED);
    const newRanks = new Map<string, number>();
    for (let i = 0; i < this._items.length; i++) {
      newRanks.set(this._items[i][1].bidId, i + 1);
    }

    const changes: RankChange[] = [];
    for (let i = 0; i < this._items.length; i++) {
      const b = this._items[i][1];
      const oldRank = oldRanks.get(b.bidId) ?? null;
      const newRank = newRanks.get(b.bidId)!;
      if (oldRank !== newRank) {
        changes.push({
          bidId: b.bidId,
          bidderId: b.bidderId,
          oldRank,
          newRank,
        });
      }
    }

    const result: LadderResult = {
      accepted: true,
      status: LadderBidStatus.RANKED,
      rank: newRanks.get(bid.bidId) ?? null,
      reason: 'ACCEPTED',
      transitions,
      rankChanges: changes,
      duplicate: false,
    };
    this._results.set(bid.bidId, result);
    return result;
  }

  private static validate(bid: LadderBid): void {
    if (!bid.bidId || !bid.bidderId) {
      throw new LadderError('INVALID_BID', 'bid_id and bidder_id are required');
    }
    if (
      typeof bid.amount !== 'number' ||
      !Number.isInteger(bid.amount) ||
      bid.amount <= 0
    ) {
      throw new LadderError('INVALID_AMOUNT', 'amount must be a positive integer');
    }
    if (
      typeof bid.timestamp !== 'number' ||
      !Number.isInteger(bid.timestamp) ||
      bid.timestamp < 0
    ) {
      throw new LadderError(
        'INVALID_TIMESTAMP',
        'timestamp must be a non-negative integer'
      );
    }
  }

  private reject(bid: LadderBid, code: string, message: string = ''): LadderResult {
    void message;
    this._status.set(bid.bidId, LadderBidStatus.REJECTED);
    const res: LadderResult = {
      accepted: false,
      status: LadderBidStatus.REJECTED,
      rank: null,
      reason: code,
      transitions: [],
      rankChanges: [],
      duplicate: false,
    };
    this._results.set(bid.bidId, res);
    return res;
  }

  private restoreAndReject(
    existing: [number, LadderBid],
    bid: LadderBid
  ): LadderResult {
    this._items.push(existing);
    this._items.sort(compareLadderItems);
    this._status.set(existing[1].bidId, LadderBidStatus.RANKED);
    return this.reject(bid, 'BELOW_LADDER', 'does not rank within the top K');
  }
}
