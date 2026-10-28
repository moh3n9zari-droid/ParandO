/**
 * هاب ارتباطی زنده وب‌سوکت و رویدادهای آنی پاراندو (ParandO Real-Time WebSocket Hub)
 *
 * در حالت واقعی (Real Mode):
 * به وب‌سوکت معتبر سرور بورس (/ws/competitions/:id) متصل شده و رویدادهای رسمی
 * (ladder.snapshot, ladder.update, ladder.determined, PRESENCE_SYNC) را با توکن احراز هویت
 * دریافت و تاخیر واقعی رفت‌وبرگشت (RTT) را با PING/PONG پایش می‌کند.
 *
 * در حالت نمایشی (Demo Mode):
 * از مجرای رویدادهای شبیه‌سازی‌شده محلی (BroadcastChannel) استفاده می‌کند و کلیه رویدادها
 * به عنوان داده آزمایشی برچسب‌گذاری می‌شوند.
 */

import { Offer } from '../core/competition_kernel';
import { StatusTransition, RankChange } from '../core/competition_ladder';
import { LadderDeterminedEvent, SettlementStatement } from '../core/settlement_module';

export type WebSocketConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED';

export interface LadderUpdatePayload {
  readonly competitionId: string;
  readonly ladder: readonly Offer[];
  readonly highestOffer: Offer | null;
  readonly offerCount: number;
  readonly rankChanges: readonly RankChange[];
  readonly transitions: readonly StatusTransition[];
  readonly timestamp: number;
  readonly version?: number;
  readonly isAuthoritative?: boolean;
}

export interface ClockTickPayload {
  readonly serverTime: number;
  readonly remainingSeconds: number;
  readonly isExpired: boolean;
}

export interface TraderPresence {
  readonly offererId: string;
  readonly name: string;
  readonly isOnline: boolean;
  readonly lastActiveAt: number;
}

export type RealTimeEvent =
  | { type: 'LADDER_UPDATED'; payload: LadderUpdatePayload }
  | { type: 'OFFER_PLACED'; payload: { offer: Offer; rank: number } }
  | { type: 'STATUS_CHANGED'; payload: { competitionId: string; newStatus: string } }
  | { type: 'COUNTDOWN_TICK'; payload: ClockTickPayload }
  | { type: 'PRESENCE_SYNC'; payload: { activeTradersCount: number; traders?: TraderPresence[]; competitionId?: string } }
  | { type: 'LADDER_DETERMINED'; payload: { event: LadderDeterminedEvent; statement?: SettlementStatement; voucher?: any } };

type EventCallback = (event: RealTimeEvent) => void;
type StatusCallback = (status: WebSocketConnectionStatus, latencyMs: number) => void;

const BROADCAST_CHANNEL_NAME = 'parando_auction_ws_channel';

export class RealTimeAuctionHub {
  private static instance: RealTimeAuctionHub;
  private status: WebSocketConnectionStatus = 'DISCONNECTED';
  private latencyMs: number = 0;
  private subscribers: Set<EventCallback> = new Set();
  private statusSubscribers: Set<StatusCallback> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private demoInterval: any = null;
  private realPingInterval: any = null;
  private messagesCount: number = 0;

  // Real Mode WebSocket state
  private activeWs: any = null;
  private currentCompetitionId: string | null = null;
  private activeToken: string | null = null;
  private isReal: boolean = false;
  private pingTimestamp: number = 0;

  private constructor() {
    this.initBroadcastChannel();
  }

  public static getInstance(): RealTimeAuctionHub {
    if (!RealTimeAuctionHub.instance) {
      RealTimeAuctionHub.instance = new RealTimeAuctionHub();
    }
    return RealTimeAuctionHub.instance;
  }

  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (ev) => {
          if (!this.isReal && ev.data && ev.data.type) {
            this.notifyLocalSubscribers(ev.data, false);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported in this environment', e);
      }
    }
  }

  public isRealConnection(): boolean {
    return this.isReal && this.status === 'CONNECTED';
  }

  public getStatus(): WebSocketConnectionStatus {
    return this.status;
  }

  public getLatency(): number {
    return this.latencyMs;
  }

  public getMessagesCount(): number {
    return this.messagesCount;
  }

  public setStatus(newStatus: WebSocketConnectionStatus) {
    this.status = newStatus;
    this.notifyStatus();
  }

  public subscribe(cb: EventCallback): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  public subscribeStatus(cb: StatusCallback): () => void {
    this.statusSubscribers.add(cb);
    cb(this.status, this.latencyMs);
    return () => this.statusSubscribers.delete(cb);
  }

  private notifyStatus() {
    this.statusSubscribers.forEach((cb) => {
      try {
        cb(this.status, this.latencyMs);
      } catch (err) {
        console.error('Error in status subscriber', err);
      }
    });
  }

  public notifyLocalSubscribers(event: RealTimeEvent, broadcast: boolean = true) {
    this.messagesCount++;
    this.subscribers.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error('Error in event subscriber', err);
      }
    });

    if (broadcast && !this.isReal && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(event);
      } catch (err) {
        console.error('Error posting to BroadcastChannel', err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Real Mode Authoritative WebSocket Connection
  // ---------------------------------------------------------------------------

  public connectReal(competitionId: string, token: string, customWsUrl?: string): void {
    const WsConstructor = typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any).WebSocket;
    if (!WsConstructor) return;

    // If already connected to same competition with same token, keep active
    if (
      this.isReal &&
      this.activeWs &&
      this.activeWs.readyState === 1 &&
      this.currentCompetitionId === competitionId &&
      this.activeToken === token
    ) {
      return;
    }

    this.disconnectReal();
    this.isReal = true;
    this.currentCompetitionId = competitionId;
    this.activeToken = token;
    this.setStatus('CONNECTING');

    let wsUrl: string;
    if (customWsUrl) {
      wsUrl = customWsUrl;
    } else if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws/competitions/${competitionId}`;
    } else {
      wsUrl = `ws://127.0.0.1:3000/ws/competitions/${competitionId}`;
    }

    try {
      // Browser & Node standard WebSocket subprotocol authentication (AC-07, SAFE_WS_SUBPROTOCOLS)
      const ws = new WsConstructor(wsUrl, ['parando-v1', 'bearer.' + token]);
      this.activeWs = ws;

      ws.onopen = () => {
        if (this.activeWs !== ws) return;
        this.status = 'CONNECTED';
        this.latencyMs = 20; // Initial baseline
        this.notifyStatus();
        this.startRealHeartbeat();
      };

      ws.onmessage = (event: any) => {
        if (this.activeWs !== ws) return;
        try {
          if (event.data === 'pong') {
            if (this.pingTimestamp > 0) {
              this.latencyMs = Math.max(1, Math.round(performance.now() - this.pingTimestamp));
              this.notifyStatus();
            }
            return;
          }

          const data = JSON.parse(event.data);

          if (data.type === 'PONG') {
            if (this.pingTimestamp > 0) {
              this.latencyMs = Math.max(1, Math.round(performance.now() - this.pingTimestamp));
              this.notifyStatus();
            }
            return;
          }

          if (data.type === 'ladder.snapshot') {
            const ladderOffers: Offer[] = (data.ladder || []).map((o: any) => ({
              offerId: o.offer_id,
              competitionId: o.competition_id || competitionId,
              offererId: o.offerer_id,
              amount: o.amount,
              placedAt: new Date(o.placed_at || Date.now()),
              sequence: o.sequence || 1,
              idempotencyKey: o.idempotency_key || `srv-${o.offer_id}`,
            }));

            const highestOffer: Offer | null = data.highest_offer
              ? {
                  offerId: data.highest_offer.offer_id,
                  competitionId: data.highest_offer.competition_id || competitionId,
                  offererId: data.highest_offer.offerer_id,
                  amount: data.highest_offer.amount,
                  placedAt: new Date(data.highest_offer.placed_at || Date.now()),
                  sequence: data.highest_offer.sequence || 1,
                  idempotencyKey: data.highest_offer.idempotency_key || `srv-${data.highest_offer.offer_id}`,
                }
              : null;

            this.notifyLocalSubscribers(
              {
                type: 'LADDER_UPDATED',
                payload: {
                  competitionId,
                  ladder: ladderOffers,
                  highestOffer,
                  offerCount: ladderOffers.length,
                  rankChanges: [],
                  transitions: [],
                  timestamp: Date.now(),
                  version: data.version,
                  isAuthoritative: true,
                },
              },
              false
            );
          } else if (data.type === 'ladder.update') {
            const ladderOffers: Offer[] = (data.ladder || []).map((o: any) => ({
              offerId: o.offer_id,
              competitionId: o.competition_id || competitionId,
              offererId: o.offerer_id,
              amount: o.amount,
              placedAt: new Date(o.placed_at || Date.now()),
              sequence: o.sequence || 1,
              idempotencyKey: o.idempotency_key || `srv-${o.offer_id}`,
            }));

            const highestOffer: Offer | null = data.highest_offer
              ? {
                  offerId: data.highest_offer.offer_id,
                  competitionId: data.highest_offer.competition_id || competitionId,
                  offererId: data.highest_offer.offerer_id,
                  amount: data.highest_offer.amount,
                  placedAt: new Date(data.highest_offer.placed_at || Date.now()),
                  sequence: data.highest_offer.sequence || 1,
                  idempotencyKey: data.highest_offer.idempotency_key || `srv-${data.highest_offer.offer_id}`,
                }
              : null;

            this.notifyLocalSubscribers(
              {
                type: 'LADDER_UPDATED',
                payload: {
                  competitionId,
                  ladder: ladderOffers,
                  highestOffer,
                  offerCount: ladderOffers.length,
                  rankChanges: [],
                  transitions: [],
                  timestamp: Date.now(),
                  version: data.version,
                  isAuthoritative: true,
                },
              },
              false
            );
          } else if (data.type === 'ladder.determined') {
            this.notifyLocalSubscribers(
              {
                type: 'LADDER_DETERMINED',
                payload: {
                  event: {
                    eventId: data.event_id || `det-${Date.now()}`,
                    eventType: 'ladder.determined',
                    eventName: 'ladder.determined',
                    competitionId: data.competition_id || competitionId,
                    tenantId: data.tenant_id || 'ir-gov-tehran-01',
                    sellerId: data.seller_id || 'seller-central',
                    determinedAt: new Date(data.settled_at || Date.now()),
                    finalLadder: (data.ladder || []) as readonly Offer[],
                    winnerOffer: data.winner_id
                      ? ({
                          offerId: `off-win-${data.winner_id}`,
                          competitionId: data.competition_id || competitionId,
                          offerer: { offererId: data.winner_id, tenantId: data.tenant_id || 'ir-gov-tehran-01' },
                          amount: data.clearing_price || 0,
                          createdAt: new Date(data.settled_at || Date.now()),
                          rank: 1,
                        } as any)
                      : null,
                    totalOfferCount: data.total_offer_count || 0,
                    basePrice: data.base_price || 0,
                    sealDigest: data.voucher_id || 'server-sealed',
                  },
                  statement: data.statement,
                  voucher: data.voucher,
                },
              },
              false
            );
          } else if (data.type === 'PRESENCE_SYNC') {
            this.notifyLocalSubscribers(
              {
                type: 'PRESENCE_SYNC',
                payload: {
                  activeTradersCount: data.count || 1,
                  competitionId: data.competition_id,
                },
              },
              false
            );
          }
        } catch (err) {
          console.warn('Error parsing WebSocket message', err);
        }
      };

      ws.onerror = () => {
        if (this.activeWs !== ws) return;
        this.status = 'DISCONNECTED';
        this.latencyMs = 0;
        this.notifyStatus();
      };

      ws.onclose = () => {
        if (this.activeWs !== ws) return;
        this.stopRealHeartbeat();
        this.status = 'DISCONNECTED';
        this.latencyMs = 0;
        this.notifyStatus();
      };
    } catch {
      this.status = 'DISCONNECTED';
      this.latencyMs = 0;
      this.notifyStatus();
    }
  }

  public disconnectReal(): void {
    this.stopRealHeartbeat();
    if (this.activeWs) {
      try {
        this.activeWs.close();
      } catch {}
      this.activeWs = null;
    }
    this.isReal = false;
    this.currentCompetitionId = null;
    this.activeToken = null;
    this.status = 'DISCONNECTED';
    this.latencyMs = 0;
    this.notifyStatus();
  }

  private startRealHeartbeat(): void {
    this.stopRealHeartbeat();
    this.realPingInterval = setInterval(() => {
      if (this.activeWs && this.activeWs.readyState === 1) {
        this.pingTimestamp = performance.now();
        try {
          this.activeWs.send(JSON.stringify({ type: 'PING', id: Date.now().toString() }));
        } catch {
          this.status = 'DISCONNECTED';
          this.notifyStatus();
        }
      }
    }, 4000);
  }

  private stopRealHeartbeat(): void {
    if (this.realPingInterval) {
      clearInterval(this.realPingInterval);
      this.realPingInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Demo Mode Simulation Methods (Explicitly demarcated as Demo/Simulated)
  // ---------------------------------------------------------------------------

  public initDemoMode(): void {
    this.disconnectReal();
    this.isReal = false;
    this.status = 'DISCONNECTED';
    this.latencyMs = 0;
    this.notifyStatus();
    this.stopDemoHeartbeat();
  }

  private startDemoHeartbeat() {
    this.stopDemoHeartbeat();
  }

  private stopDemoHeartbeat() {
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
  }

  public broadcastLadderUpdate(payload: LadderUpdatePayload) {
    if (this.isReal) return; // In Real mode, only server messages update ladder
    this.notifyLocalSubscribers({
      type: 'LADDER_UPDATED',
      payload: { ...payload, isAuthoritative: false },
    });
  }

  public broadcastOfferPlaced(offer: Offer, rank: number) {
    if (this.isReal) return;
    this.notifyLocalSubscribers({
      type: 'OFFER_PLACED',
      payload: { offer, rank },
    });
  }

  public broadcastTick(serverTime: number, remainingSeconds: number, isExpired: boolean) {
    this.notifyLocalSubscribers({
      type: 'COUNTDOWN_TICK',
      payload: { serverTime, remainingSeconds, isExpired },
    });
  }

  public broadcastStatusChanged(competitionId: string, newStatus: string) {
    if (this.isReal) return;
    this.notifyLocalSubscribers({
      type: 'STATUS_CHANGED',
      payload: { competitionId, newStatus },
    });
  }

  public broadcastLadderDetermined(event: LadderDeterminedEvent, statement?: SettlementStatement) {
    if (this.isReal) return;
    this.notifyLocalSubscribers({
      type: 'LADDER_DETERMINED',
      payload: { event, statement },
    });
  }

  public simulateDisconnect() {
    this.setStatus('DISCONNECTED');
  }

  public simulateReconnect() {
    this.setStatus('RECONNECTING');
    setTimeout(() => {
      this.setStatus('CONNECTED');
    }, 600);
  }
}
