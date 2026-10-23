/**
 * ماژول تسویه مالی و تسهیم وجوه پاراندو (ParandO Settlement Module - ADR-003)
 *
 * پردازش رویداد ladder.determined پس از بسته شدن حراج
 * محاسبه کارمزد پلتفرم/کارگزاری، مالیات بر ارزش افزوده (VAT ۱۰٪)،
 * عوارض قانونی انتقال، خالص پرداختی به فروشنده،
 * و آزادسازی وثایق رقبا (Unfreeze Authorizations).
 */

import { Competition, Offer } from './competition_kernel';

export interface SettlementConfig {
  readonly platformFeeBps: number; // پیش‌فرض: ۵۰ (۰.۵٪)
  readonly vatBps: number; // پیش‌فرض: ۱۰۰۰ (۱۰٪ روی کارمزد)
  readonly statutoryTransferTaxBps: number; // پیش‌فرض: ۵۰ (۰.۵٪)
  readonly commissionRateBps?: number;
  readonly vatRateBps?: number;
  readonly allLadderWinners?: boolean;
}

export const DEFAULT_SETTLEMENT_CONFIG: SettlementConfig = {
  platformFeeBps: 50,
  vatBps: 1000,
  statutoryTransferTaxBps: 50,
  commissionRateBps: 50,
  vatRateBps: 1000,
  allLadderWinners: false,
};

export interface LadderDeterminedEvent {
  readonly eventId: string;
  readonly eventType: 'ladder.determined';
  readonly eventName: 'ladder.determined'; // Alias
  readonly competitionId: string;
  readonly tenantId: string;
  readonly sellerId: string;
  readonly determinedAt: Date;
  readonly finalLadder: readonly Offer[];
  readonly winnerOffer: Offer | null;
  readonly totalOfferCount: number;
  readonly basePrice: number;
  readonly sealDigest: string; // تمبر امنیتی پلمپ نردبان
}

export interface UnfreezeInstruction {
  readonly offererId: string;
  readonly tenantId: string;
  readonly status: 'UNFREEZE_AUTHORIZED' | 'RETAINED_FOR_SETTLEMENT';
  readonly reason: string;
  readonly explanation?: string;
}

export interface SettlementBreakdown {
  readonly competitionId: string;
  readonly settledAt: Date;
  readonly winnerOffer: Offer | null;
  readonly grossAmount: number;
  readonly platformFeeAmount: number;
  readonly vatAmount: number;
  readonly statutoryTransferTaxAmount: number;
  readonly totalDeductions: number;
  readonly netPayableToSeller: number;
  readonly unfreezeInstructions: readonly UnfreezeInstruction[];
}

export interface WinnerAllocation {
  readonly rank: number;
  readonly offererId: string;
  readonly offerId: string;
  readonly grossAmount: number;
  readonly commissionRateBps: number;
  readonly commissionAmount: number;
  readonly vatRateBps: number;
  readonly vatAmount: number;
  readonly netBuyerPayable: number;
  readonly netSellerReceivable: number;
}

export interface CollateralRelease {
  readonly offererId: string;
  readonly tenantId: string;
  readonly originalGuarantee: number;
  readonly releaseAmount: number;
  readonly reason: 'OUTBID' | 'SUPERSEDED' | 'DID_NOT_WIN';
  readonly status: 'RELEASED' | 'PENDING_BANK_ACK';
  readonly releasedAt: Date;
}

export interface LedgerEntry {
  readonly entryId: string;
  readonly account:
    | 'BUYER_ESCROW'
    | 'SELLER_PAYOUT'
    | 'PLATFORM_COMMISSION'
    | 'TAX_AUTHORITY_VAT'
    | 'COLLATERAL_RETURN';
  readonly debit: number;
  readonly credit: number;
  readonly description: string;
}

export interface SettlementStatement {
  readonly settlementId: string;
  readonly competitionId: string;
  readonly tenantId: string;
  readonly sellerId: string;
  readonly determinedAt: Date;
  readonly settledAt: Date;
  readonly sealDigest: string;
  readonly winners: readonly WinnerAllocation[];
  readonly releases: readonly CollateralRelease[];
  readonly summary: {
    readonly totalGrossAmount: number;
    readonly totalCommission: number;
    readonly totalVat: number;
    readonly totalBuyerPayable: number;
    readonly totalSellerPayout: number;
    readonly totalCollateralReleased: number;
  };
  readonly ledgerEntries: readonly LedgerEntry[];
  readonly breakdown?: SettlementBreakdown;
}

/**
 * ایجاد رویداد رسمی ladder.determined از وضعیت پایانی رقابت
 */
export function createLadderDeterminedEvent(
  competition: Competition,
  timestamp: Date = new Date()
): LadderDeterminedEvent {
  const winnerOffer = competition.ladder.length > 0 ? competition.ladder[0] : null;
  const sealHex = `${competition.competitionId}-${timestamp.getTime()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  return {
    eventId: `evt-det-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    eventType: 'ladder.determined',
    eventName: 'ladder.determined',
    competitionId: competition.competitionId,
    tenantId: competition.tenantId,
    sellerId: competition.sellerId,
    determinedAt: timestamp,
    finalLadder: [...competition.ladder],
    winnerOffer,
    totalOfferCount: competition.offerCount,
    basePrice: competition.rules.basePrice,
    sealDigest: `SEAL-${sealHex}`,
  };
}

/**
 * محاسبه رسمی تسویه مسابقه بر اساس تنظیمات ADR-003 و صدور دستورات آزادسازی وثایق
 */
export function calculateSettlement(
  competition: Competition,
  participants: { offererId: string; tenantId: string }[],
  config: SettlementConfig = DEFAULT_SETTLEMENT_CONFIG,
  timestamp: Date = new Date()
): SettlementBreakdown {
  const winnerOffer = competition.ladder.length > 0 ? competition.ladder[0] : null;
  const grossAmount = winnerOffer ? winnerOffer.amount : 0;

  // Platform Fee (مثلاً ۰.۵٪ = ۵۰ bps)
  const platformFeeAmount = Math.ceil((grossAmount * config.platformFeeBps) / 10000);

  // VAT (۱۰٪ روی کارمزد پلتفرم طبق قانون مالیات بر ارزش افزوده)
  const vatAmount = Math.ceil((platformFeeAmount * config.vatBps) / 10000);

  // Statutory Transfer Tax (مثلاً ۰.۵٪ = ۵۰ bps)
  const statutoryTransferTaxAmount = Math.ceil(
    (grossAmount * config.statutoryTransferTaxBps) / 10000
  );

  const totalDeductions = platformFeeAmount + vatAmount + statutoryTransferTaxAmount;
  const netPayableToSeller = grossAmount - totalDeductions;

  const winnerOffererId = winnerOffer ? winnerOffer.offererId : null;

  const unfreezeInstructions: UnfreezeInstruction[] = participants.map((p) => {
    if (winnerOffererId && p.offererId === winnerOffererId) {
      return {
        offererId: p.offererId,
        tenantId: p.tenantId,
        status: 'RETAINED_FOR_SETTLEMENT',
        reason: 'WINNING_BIDDER',
        explanation: 'برنده جایگاه اول؛ وثیقه جهت تسویه نهایی نگه‌داشته می‌شود',
      };
    }
    return {
      offererId: p.offererId,
      tenantId: p.tenantId,
      status: 'UNFREEZE_AUTHORIZED',
      reason: 'OUTBID_OR_SELLER',
      explanation: 'عدم برنده شدن در رقابت؛ آزادسازی فوری ودیعه در بانک',
    };
  });

  return {
    competitionId: competition.competitionId,
    settledAt: timestamp,
    winnerOffer,
    grossAmount,
    platformFeeAmount,
    vatAmount,
    statutoryTransferTaxAmount,
    totalDeductions,
    netPayableToSeller,
    unfreezeInstructions,
  };
}

/**
 * پردازش رویداد ladder.determined و ایجاد سند تسویه جامع ADR-003 برای نمایش در UI و دفتر کل
 */
export function processSettlement(
  event: LadderDeterminedEvent,
  allParticipants: { offererId: string; tenantId: string; guaranteedAmount: number }[],
  config: Partial<SettlementConfig> = {}
): SettlementStatement {
  const mergedConfig: SettlementConfig = {
    ...DEFAULT_SETTLEMENT_CONFIG,
    ...config,
  };
  const now = new Date();

  // ۱. تعیین برنده(ها)
  const winningOffers = mergedConfig.allLadderWinners
    ? event.finalLadder
    : event.finalLadder.slice(0, 1);

  const winners: WinnerAllocation[] = winningOffers.map((offer, index) => {
    const grossAmount = offer.amount;
    const commissionAmount = Math.ceil((grossAmount * mergedConfig.platformFeeBps) / 10000);
    const vatAmount = Math.ceil((commissionAmount * mergedConfig.vatBps) / 10000);
    const netBuyerPayable = grossAmount + commissionAmount + vatAmount;
    const netSellerReceivable = grossAmount - commissionAmount;

    return {
      rank: index + 1,
      offererId: offer.offererId,
      offerId: offer.offerId,
      grossAmount,
      commissionRateBps: mergedConfig.platformFeeBps,
      commissionAmount,
      vatRateBps: mergedConfig.vatBps,
      vatAmount,
      netBuyerPayable,
      netSellerReceivable,
    };
  });

  const winnerOffererIds = new Set(winners.map((w) => w.offererId));

  // ۲. آزادسازی وثایق رقبا
  const releases: CollateralRelease[] = allParticipants
    .filter((p) => !winnerOffererIds.has(p.offererId) && p.offererId !== event.sellerId)
    .map((p) => ({
      offererId: p.offererId,
      tenantId: p.tenantId,
      originalGuarantee: p.guaranteedAmount,
      releaseAmount: p.guaranteedAmount,
      reason: 'DID_NOT_WIN',
      status: 'RELEASED',
      releasedAt: now,
    }));

  const totalGrossAmount = winners.reduce((sum, w) => sum + w.grossAmount, 0);
  const totalCommission = winners.reduce((sum, w) => sum + w.commissionAmount, 0);
  const totalVat = winners.reduce((sum, w) => sum + w.vatAmount, 0);
  const totalBuyerPayable = winners.reduce((sum, w) => sum + w.netBuyerPayable, 0);
  const totalSellerPayout = winners.reduce((sum, w) => sum + w.netSellerReceivable, 0);
  const totalCollateralReleased = releases.reduce((sum, r) => sum + r.releaseAmount, 0);

  // ۳. دفتر کل حسابداری دوبل
  const ledgerEntries: LedgerEntry[] = [];
  let seq = 1;

  if (totalGrossAmount > 0) {
    ledgerEntries.push({
      entryId: `led-${seq++}`,
      account: 'BUYER_ESCROW',
      debit: totalBuyerPayable,
      credit: 0,
      description: `وصول کل مطالبات حراج از حساب برنده (${winners[0]?.offererId})`,
    });

    ledgerEntries.push({
      entryId: `led-${seq++}`,
      account: 'SELLER_PAYOUT',
      debit: 0,
      credit: totalSellerPayout,
      description: `خالص واریزی ارزش کالای عرضه شده به حساب فروشنده (${event.sellerId})`,
    });

    ledgerEntries.push({
      entryId: `led-${seq++}`,
      account: 'PLATFORM_COMMISSION',
      debit: 0,
      credit: totalCommission,
      description: `شناسایی درآمد کارمزد مصوب سامانه و کارگزاری بورس (۰.۵٪)`,
    });

    ledgerEntries.push({
      entryId: `led-${seq++}`,
      account: 'TAX_AUTHORITY_VAT',
      debit: 0,
      credit: totalVat,
      description: `مالیات بر ارزش افزوده قانونی کارمزد خدمات معاملات (۱۰٪ VAT)`,
    });
  }

  if (totalCollateralReleased > 0) {
    ledgerEntries.push({
      entryId: `led-${seq++}`,
      account: 'COLLATERAL_RETURN',
      debit: totalCollateralReleased,
      credit: totalCollateralReleased,
      description: `رفع مسدودی و آزادسازی تضمین‌های مالی ودیعه شرکت‌کنندگان ناموفق`,
    });
  }

  return {
    settlementId: `SETTLE-${event.competitionId}-${Date.now().toString(36).toUpperCase()}`,
    competitionId: event.competitionId,
    tenantId: event.tenantId,
    sellerId: event.sellerId,
    determinedAt: event.determinedAt,
    settledAt: now,
    sealDigest: event.sealDigest,
    winners,
    releases,
    summary: {
      totalGrossAmount,
      totalCommission,
      totalVat,
      totalBuyerPayable,
      totalSellerPayout,
      totalCollateralReleased,
    },
    ledgerEntries,
  };
}
