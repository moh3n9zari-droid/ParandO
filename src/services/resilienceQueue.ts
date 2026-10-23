/**
 * سامانه مدیریت پایداری در شبکه ملی (National Network Resilience & Offline Sync Queue)
 *
 * تضمین عدم از دست رفتن داده‌ها در نوسانات یا قطعی‌های موقت شبکه ملی (اینترانت/اینترنت)
 * یکپارچه با پروتکل TR-12 (شناسه یکتای تکرارپذیری) برای ارسال امن مجدد پس از وصل ارتباط
 */

export interface ResilientOffer {
  queueId: string;
  competitionId: string;
  offererId: string;
  tenantId: string;
  amount: number;
  idempotencyKey: string;
  expectedVersion?: number | null;
  queuedAt: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  errorDetail?: string;
}

const STORAGE_KEY = 'parando_national_network_pending_queue';

export class OfflineResilienceManager {
  private static instance: OfflineResilienceManager;
  private queue: ResilientOffer[] = [];
  private listeners: Set<(queue: ResilientOffer[], isSimulatedDisruption: boolean) => void> = new Set();
  private isSimulatedDisruption: boolean = false;

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): OfflineResilienceManager {
    if (!OfflineResilienceManager.instance) {
      OfflineResilienceManager.instance = new OfflineResilienceManager();
    }
    return OfflineResilienceManager.instance;
  }

  public isOnline(): boolean {
    if (this.isSimulatedDisruption) return false;
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  public setSimulatedDisruption(simulate: boolean): void {
    this.isSimulatedDisruption = simulate;
    this.notify();
  }

  public isSimulating(): boolean {
    return this.isSimulatedDisruption;
  }

  public enqueue(offer: {
    competitionId: string;
    offererId: string;
    tenantId: string;
    amount: number;
    idempotencyKey: string;
    expectedVersion?: number | null;
  }): ResilientOffer {
    const item: ResilientOffer = {
      queueId: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      competitionId: offer.competitionId,
      offererId: offer.offererId,
      tenantId: offer.tenantId,
      amount: offer.amount,
      idempotencyKey: offer.idempotencyKey,
      expectedVersion: offer.expectedVersion,
      queuedAt: new Date().toISOString(),
      status: 'PENDING',
      retryCount: 0,
    };

    this.queue.unshift(item);
    this.saveToStorage();
    this.notify();
    return item;
  }

  public markSynced(queueId: string): void {
    this.queue = this.queue.filter((q) => q.queueId !== queueId);
    this.saveToStorage();
    this.notify();
  }

  public markFailed(queueId: string, error: string): void {
    const item = this.queue.find((q) => q.queueId === queueId);
    if (item) {
      item.status = 'FAILED';
      item.retryCount += 1;
      item.errorDetail = error;
      this.saveToStorage();
      this.notify();
    }
  }

  public getPendingQueue(): ResilientOffer[] {
    return [...this.queue];
  }

  public clearQueue(): void {
    this.queue = [];
    this.saveToStorage();
    this.notify();
  }

  public subscribe(cb: (queue: ResilientOffer[], isSimulatedDisruption: boolean) => void): () => void {
    this.listeners.add(cb);
    cb(this.getPendingQueue(), this.isSimulatedDisruption);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    const current = this.getPendingQueue();
    for (const listener of this.listeners) {
      listener(current, this.isSimulatedDisruption);
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this.queue = JSON.parse(raw);
        }
      }
    } catch {
      this.queue = [];
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
      }
    } catch {
      // storage quota fail-safe
    }
  }
}
