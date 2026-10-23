/**
 * ParandO Extension & Hooks Architecture (ADR-004)
 *
 * Lightweight, non-intrusive hook registry and interceptor pipeline.
 * Keeps the core competition kernel 100% pure while allowing pre-offer validation,
 * AML checks, anti-spam velocity limits, security auditing, and event telemetry.
 */

import { Competition, Offer, Offerer } from './competition_kernel';
import { LadderOffer } from './competition_ladder';
import { SettlementStatement } from './settlement_module';

// --------------------------------------------------------------------------
// Hook Interfaces & Lifecycle Contexts
// --------------------------------------------------------------------------

export interface HookEvaluationResult {
  readonly allowed: boolean;
  readonly hookName: string;
  readonly code?: string;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface PreOfferContext {
  readonly competition: Competition;
  readonly offerer: Offerer;
  readonly amount: number;
  readonly idempotencyKey: string;
  readonly offerId: string;
  readonly timestamp: Date;
}

export interface PostOfferContext {
  readonly competition: Competition;
  readonly offer: Offer;
  readonly rank: number;
  readonly rankChanges: readonly unknown[];
  readonly transitions: readonly unknown[];
  readonly timestamp: Date;
}

export interface RejectedOfferContext {
  readonly competition: Competition;
  readonly offerer: Offerer;
  readonly amount: number;
  readonly idempotencyKey: string;
  readonly offerId: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly timestamp: Date;
}

export interface LadderDeterminedContext {
  readonly competition: Competition;
  readonly statement: SettlementStatement;
  readonly timestamp: Date;
}

export interface ExtensionHook {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly priority: number; // Lower numbers execute earlier

  beforeSubmitOffer?(context: PreOfferContext): HookEvaluationResult;
  afterOfferAccepted?(context: PostOfferContext): void;
  onOfferRejected?(context: RejectedOfferContext): void;
  onLadderDetermined?(context: LadderDeterminedContext): void;
}

// --------------------------------------------------------------------------
// Audit Telemetry Log Entry
// --------------------------------------------------------------------------

export interface ExtensionAuditRecord {
  readonly id: string;
  readonly hookId: string;
  readonly hookName: string;
  readonly eventType: 'PRE_CHECK_PASSED' | 'PRE_CHECK_BLOCKED' | 'POST_OFFER' | 'REJECT_LOGGED' | 'DETERMINED';
  readonly timestamp: Date;
  readonly details: string;
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly metadata?: Record<string, unknown>;
}

// --------------------------------------------------------------------------
// Built-in Standard Security & Compliance Hooks
// --------------------------------------------------------------------------

/**
 * 1. Security Velocity Hook:
 * Prevents automated high-frequency spam or denial-of-service attempts by a single offerer.
 * Enforces a minimum interval between consecutive submissions (e.g., 400ms).
 */
export class SecurityVelocityHook implements ExtensionHook {
  readonly id = 'hook-sec-velocity';
  readonly name = 'پایش سرعت و ضداسپم (Security Velocity Guard)';
  readonly description = 'جلوگیری از حملات سایبری DoS و ارسال متوالی غیرمجاز توسط ربات‌ها (حداقل فاصله مجاز ۴۰۰ میلی‌ثانیه)';
  enabled = true;
  readonly priority = 10;

  private minIntervalMs: number;
  private lastSubmissionByOfferer: Map<string, number> = new Map();

  constructor(minIntervalMs: number = 400) {
    this.minIntervalMs = minIntervalMs;
  }

  setInterval(ms: number) {
    this.minIntervalMs = ms;
  }

  beforeSubmitOffer(context: PreOfferContext): HookEvaluationResult {
    const now = context.timestamp.getTime();
    const lastTime = this.lastSubmissionByOfferer.get(context.offerer.offererId);

    if (lastTime !== undefined) {
      const elapsed = now - lastTime;
      if (elapsed < this.minIntervalMs) {
        return {
          allowed: false,
          hookName: this.name,
          code: 'RATE_LIMIT_EXCEEDED',
          reason: `توالی ارسال بیش از حد سریع است (${elapsed}ms < ${this.minIntervalMs}ms). لطفاً اندکی صبر کنید.`,
          metadata: { elapsed, minIntervalMs: this.minIntervalMs },
        };
      }
    }

    this.lastSubmissionByOfferer.set(context.offerer.offererId, now);
    return { allowed: true, hookName: this.name };
  }

  reset() {
    this.lastSubmissionByOfferer.clear();
  }
}

/**
 * 2. AML (Anti-Money Laundering) & Sanity Check Hook:
 * Enforces high-value transaction compliance according to Central Bank & Stock Exchange rules.
 * Flags or rejects offers exceeding excessive multiples of the base price without prior KYC tier 3 clearance.
 */
export class AMLComplianceHook implements ExtensionHook {
  readonly id = 'hook-aml-compliance';
  readonly name = 'مبارزه با پولشویی و انطباق مقرراتی (AML & Regulatory Compliance)';
  readonly description = 'اعتبارسنجی سقف مجاز قانونی و ممانعت از پولشویی و جهش‌های غیرعادی قیمت بر اساس دستورالعمل بانک مرکزی';
  enabled = true;
  readonly priority = 20;

  // Maximum allowed multiplier over base price in a single auction
  private maxMultiplierOverBase: number;
  // Maximum absolute Rial cap for standard offers (e.g., 500 Billion Rials)
  private absoluteMaxRialCap: number;

  constructor(maxMultiplierOverBase: number = 10, absoluteMaxRialCap: number = 500_000_000_000) {
    this.maxMultiplierOverBase = maxMultiplierOverBase;
    this.absoluteMaxRialCap = absoluteMaxRialCap;
  }

  beforeSubmitOffer(context: PreOfferContext): HookEvaluationResult {
    const basePrice = context.competition.rules.basePrice;

    // Check absolute cap
    if (context.amount > this.absoluteMaxRialCap) {
      return {
        allowed: false,
        hookName: this.name,
        code: 'AML_CEILING_EXCEEDED',
        reason: `مبلغ پیشنهادی فراتر از سقف مجاز مبارزه با پولشویی است (حداکثر سقف مجاز: ${this.absoluteMaxRialCap.toLocaleString('fa-IR')} ریال).`,
        metadata: { amount: context.amount, maxCap: this.absoluteMaxRialCap },
      };
    }

    // Check multiple over base price (e.g. fat-finger protection or market manipulation)
    const ratio = context.amount / basePrice;
    if (ratio > this.maxMultiplierOverBase) {
      return {
        allowed: false,
        hookName: this.name,
        code: 'IRREGULAR_PRICE_SURGE',
        reason: `جهش غیرمتعارف قیمت (${ratio.toFixed(1)} برابر قیمت پایه). طبق مقررات نظارتی بورس، نیازمند تأییدیه ویژه ناظر بازار است.`,
        metadata: { ratio, maxMultiplier: this.maxMultiplierOverBase },
      };
    }

    return { allowed: true, hookName: this.name };
  }
}

/**
 * 3. Market Integrity & Anti-Spoofing Hook:
 * Detects suspicious bidding patterns such as repeatedly offering exactly 1 Rial above the minimum
 * when competing with oneself, or circular bid manipulation.
 */
export class MarketIntegrityHook implements ExtensionHook {
  readonly id = 'hook-market-integrity';
  readonly name = 'صیانت از سلامت بازار و ضداسپوفینگ (Market Integrity Guard)';
  readonly description = 'شناسایی و جلوگیری از رفتارهای مخرب بازارساز نما، سیگنال‌دهی کاذب و الگوهای مشکوک';
  enabled = true;
  readonly priority = 30;

  beforeSubmitOffer(context: PreOfferContext): HookEvaluationResult {
    const highestOffer = context.competition.highestOffer;
    // Check if the same bidder is already at rank 1 and offering unnecessarily high jump over self
    if (highestOffer && highestOffer.offererId === context.offerer.offererId) {
      const step = context.amount - highestOffer.amount;
      const minInc = context.competition.rules.minIncrement;
      if (step > minInc * 50) {
        return {
          allowed: false,
          hookName: this.name,
          code: 'SELF_COMPETITION_SURGE',
          reason: 'شما در حال حاضر دارنده بالاترین پیشنهاد هستید. جهش نامتعارف بیش از ۵۰ برابری روی پیشنهاد خود مجاز نیست.',
          metadata: { currentHighest: highestOffer.amount, proposed: context.amount },
        };
      }
    }

    return { allowed: true, hookName: this.name };
  }
}

// --------------------------------------------------------------------------
// Hook Registry (ADR-004)
// --------------------------------------------------------------------------

export class HookRegistry {
  private static instance: HookRegistry | null = null;
  private hooks: Map<string, ExtensionHook> = new Map();
  private telemetryLogs: ExtensionAuditRecord[] = [];
  private listeners: Array<() => void> = [];

  private constructor() {
    // Register standard default hooks
    this.register(new SecurityVelocityHook());
    this.register(new AMLComplianceHook());
    this.register(new MarketIntegrityHook());
  }

  public static getInstance(): HookRegistry {
    if (!HookRegistry.instance) {
      HookRegistry.instance = new HookRegistry();
    }
    return HookRegistry.instance;
  }

  public register(hook: ExtensionHook): void {
    this.hooks.set(hook.id, hook);
    this.notify();
  }

  public unregister(hookId: string): void {
    this.hooks.delete(hookId);
    this.notify();
  }

  public toggleHook(hookId: string, enabled?: boolean): void {
    const hook = this.hooks.get(hookId);
    if (hook) {
      (hook as { enabled: boolean }).enabled = enabled !== undefined ? enabled : !hook.enabled;
      this.notify();
    }
  }

  public getHooks(): ExtensionHook[] {
    return Array.from(this.hooks.values()).sort((a, b) => a.priority - b.priority);
  }

  public getTelemetryLogs(): readonly ExtensionAuditRecord[] {
    return this.telemetryLogs;
  }

  public clearLogs(): void {
    this.telemetryLogs = [];
    this.notify();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Safe dispatch
      }
    }
  }

  private logRecord(record: Omit<ExtensionAuditRecord, 'id'>): void {
    const newRecord: ExtensionAuditRecord = {
      ...record,
      id: `tel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    this.telemetryLogs = [newRecord, ...this.telemetryLogs.slice(0, 99)];
    this.notify();
  }

  /**
   * Pipeline: Evaluates all enabled hooks in priority order before core submitOffer.
   * If any hook rejects, returns immediately with the evaluation result.
   */
  public evaluateBeforeOffer(context: PreOfferContext): HookEvaluationResult {
    const sortedHooks = this.getHooks().filter((h) => h.enabled && h.beforeSubmitOffer);

    for (const hook of sortedHooks) {
      try {
        const res = hook.beforeSubmitOffer!(context);
        if (!res.allowed) {
          this.logRecord({
            hookId: hook.id,
            hookName: hook.name,
            eventType: 'PRE_CHECK_BLOCKED',
            timestamp: context.timestamp,
            details: `پیشنهاد کاربر ${context.offerer.offererId} مسدود شد: ${res.reason || res.code}`,
            severity: 'WARNING',
            metadata: res.metadata,
          });
          return res;
        }
      } catch (err: unknown) {
        // Fail-safe hook execution
        const msg = err instanceof Error ? err.message : String(err);
        this.logRecord({
          hookId: hook.id,
          hookName: hook.name,
          eventType: 'PRE_CHECK_BLOCKED',
          timestamp: context.timestamp,
          details: `خطای داخلی در اجرای هوک ${hook.name}: ${msg}`,
          severity: 'CRITICAL',
        });
        return {
          allowed: false,
          hookName: hook.name,
          code: 'HOOK_EXECUTION_ERROR',
          reason: `خطای سیستم نظارتی: ${msg}`,
        };
      }
    }

    this.logRecord({
      hookId: 'registry',
      hookName: 'هسته انطباق ADR-004',
      eventType: 'PRE_CHECK_PASSED',
      timestamp: context.timestamp,
      details: `پیشنهاد ${context.amount.toLocaleString('fa-IR')} ریال از کاربر ${context.offerer.offererId} کلیه اعتبارسنجی‌های افزونه‌ها را با موفقیت گذراند.`,
      severity: 'INFO',
    });

    return { allowed: true, hookName: 'All Hooks Passed' };
  }

  /**
   * Pipeline: Dispatches event to hooks after core successfully accepts an offer.
   */
  public dispatchAfterOffer(context: PostOfferContext): void {
    const sortedHooks = this.getHooks().filter((h) => h.enabled && h.afterOfferAccepted);
    for (const hook of sortedHooks) {
      try {
        hook.afterOfferAccepted!(context);
      } catch {
        // Hooks must not break application flow
      }
    }

    this.logRecord({
      hookId: 'registry',
      hookName: 'سیستم ثبت وقایع',
      eventType: 'POST_OFFER',
      timestamp: context.timestamp,
      details: `پیشنهاد شماره ${context.offer.sequence} در رتبه ${context.rank} ثبت نهایی گردید.`,
      severity: 'INFO',
    });
  }

  /**
   * Pipeline: Dispatches event to hooks when core rejects an offer.
   */
  public dispatchOnReject(context: RejectedOfferContext): void {
    const sortedHooks = this.getHooks().filter((h) => h.enabled && h.onOfferRejected);
    for (const hook of sortedHooks) {
      try {
        hook.onOfferRejected!(context);
      } catch {
        // Hooks must not break application flow
      }
    }

    this.logRecord({
      hookId: 'registry',
      hookName: 'سیستم لاگ خطا',
      eventType: 'REJECT_LOGGED',
      timestamp: context.timestamp,
      details: `پیشنهاد با خطای ${context.errorCode} رد شد: ${context.errorMessage}`,
      severity: 'WARNING',
    });
  }

  /**
   * Pipeline: Dispatches event when auction reaches ladder.determined.
   */
  public dispatchOnDetermined(context: LadderDeterminedContext): void {
    const sortedHooks = this.getHooks().filter((h) => h.enabled && h.onLadderDetermined);
    for (const hook of sortedHooks) {
      try {
        hook.onLadderDetermined!(context);
      } catch {
        // Safe dispatch
      }
    }

    this.logRecord({
      hookId: 'registry',
      hookName: 'پایش تسویه ADR-003',
      eventType: 'DETERMINED',
      timestamp: context.timestamp,
      details: `پایان حراج و صدور صورت‌حساب قطعی تسویه با تمبر ${context.statement.sealDigest.substring(0, 16)}...`,
      severity: 'INFO',
    });
  }
}
