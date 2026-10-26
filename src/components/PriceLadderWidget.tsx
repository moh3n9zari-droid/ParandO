import React from 'react';
import {
  Trophy,
  Medal,
  Award,
  Hash,
  Clock,
  Radio,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Zap,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { Offer } from '../core/competition_kernel';
import { formatDualCurrency, formatTimestamp, toPersianDigits } from '../utils/formatters';

export interface PriceLadderWidgetProps {
  ladder: readonly Offer[];
  ladderSize: number;
  basePrice: number;
  isDarkTheme?: boolean;
  competitionId?: string;
  isLiveConnected?: boolean;
  onQuickBidClick?: () => void;
  compact?: boolean;
  guaranteedAmount?: number;
  depositRateBps?: number;
}

export const PriceLadderWidget: React.FC<PriceLadderWidgetProps> = ({
  ladder,
  ladderSize,
  basePrice,
  isDarkTheme = false,
  competitionId,
  isLiveConnected = true,
  onQuickBidClick,
  compact = false,
  guaranteedAmount = 200_000_000_000,
  depositRateBps = 1500,
}) => {
  // Sort ladder descending by amount, then ascending by sequence (TR-13)
  const sortedOffers = [...ladder].sort((a, b) => {
    if (b.amount !== a.amount) {
      return b.amount - a.amount;
    }
    return a.sequence - b.sequence; // TR-13: Lower sequence wins tie
  });

  const slots = Array.from({ length: ladderSize }, (_, index) => {
    return sortedOffers[index] || null;
  });

  const getRankBadge = (rankIndex: number) => {
    if (rankIndex === 0) {
      return {
        label: 'رتبه ۱ (پیشتاز)',
        badgeClass: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40',
        icon: Trophy,
      };
    }
    if (rankIndex === 1) {
      return {
        label: 'رتبه ۲ (نایب)',
        badgeClass: 'bg-slate-400/20 text-slate-700 dark:text-slate-300 border-slate-400/40',
        icon: Medal,
      };
    }
    if (rankIndex === 2) {
      return {
        label: 'رتبه ۳',
        badgeClass: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/40',
        icon: Award,
      };
    }
    return {
      label: `رتبه ${toPersianDigits(rankIndex + 1)}`,
      badgeClass: 'bg-slate-200/60 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300/40',
      icon: TrendingUp,
    };
  };

  // Check deposit sufficiency for current top bid (K-INV-7)
  const topBidAmount = sortedOffers[0]?.amount || basePrice;
  const requiredExposure = Math.ceil((topBidAmount * depositRateBps) / 10000);
  const isDepositSufficient = guaranteedAmount >= requiredExposure;

  if (compact) {
    return (
      <div
        className={`p-3 rounded-xl border text-xs ${
          isDarkTheme ? 'bg-[#1E1E24] border-slate-800' : 'bg-white border-[#E5E7EB] shadow-xs'
        }`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
          <span className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
            <Radio className="w-3.5 h-3.5 text-[#00A86B] animate-pulse" />
            <span>نردبان زنده (Top {toPersianDigits(ladderSize)})</span>
          </span>
          <span className="text-[10px] text-[#FF5000] font-bold font-mono">
            TR-13 فعال
          </span>
        </div>

        <div className="space-y-1.5">
          {slots.slice(0, 3).map((offer, idx) => {
            const rank = getRankBadge(idx);
            const Icon = rank.icon;

            if (!offer) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg text-[11px] text-slate-400 border border-dashed border-slate-200 dark:border-slate-800"
                >
                  <span>جایگاه {toPersianDigits(idx + 1)}</span>
                  <span>در انتظار پیشنهاد</span>
                </div>
              );
            }

            const currency = formatDualCurrency(offer.amount);
            return (
              <div
                key={offer.offerId}
                className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-all animate-price-pulse ${
                  idx === 0
                    ? 'bg-amber-500/10 border border-amber-500/30 font-bold'
                    : 'bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="font-mono text-[11px] truncate max-w-[90px]">{offer.offererId}</span>
                  <span className="text-[9px] text-slate-400 font-mono">#{toPersianDigits(offer.sequence)}</span>
                </div>
                <div className="text-left font-black font-tnum text-[11px] text-[#00A86B]">
                  {currency.toman}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 transition-all shadow-sm ${
        isDarkTheme
          ? 'bg-[#1E1E24] border-slate-800 text-slate-100'
          : 'bg-white border-[#E5E7EB] text-slate-800'
      }`}
      dir="rtl"
    >
      {/* Widget Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#FF5000]/10 text-[#FF5000] border border-[#FF5000]/20">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
              <span>نردبان قیمت زنده و تقدم رتبه‌ها</span>
              {competitionId && (
                <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {competitionId}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              چینش آنی بر اساس بیشترین قیمت و حل برابری‌ها با توالی ثبت (TR-01 / TR-13)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* WebSocket Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#00A86B]/10 text-[#00A86B] border border-[#00A86B]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00A86B] animate-ping" />
            <span>{isLiveConnected ? 'کانال وب‌سوکت برخط' : 'همگام‌سازی شبکه'}</span>
          </div>

          {onQuickBidClick && (
            <button
              onClick={onQuickBidClick}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#FF5000] hover:bg-[#E64A00] text-white shadow-xs flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>ثبت پیشنهاد</span>
            </button>
          )}
        </div>
      </div>

      {/* Deposit Sufficiency Bar (K-INV-7 Indicator) */}
      <div
        className={`p-2.5 rounded-lg border text-xs mb-3 flex items-center justify-between ${
          isDepositSufficient
            ? 'bg-[#00A86B]/10 border-[#00A86B]/25 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-[#00A86B]" />
          <span>
            سقف تعهد مسدودی ۱۵٪: <strong>{formatDualCurrency(requiredExposure).toman}</strong>
          </span>
        </div>
        <span className="font-bold font-mono text-[11px]">
          {isDepositSufficient ? 'کفایت تعهد تایید شد (K-INV-7)' : 'کسری سپرده تضمین'}
        </span>
      </div>

      {/* Ladder Slots */}
      <div className="space-y-2">
        {slots.map((offer, index) => {
          const rank = getRankBadge(index);
          const Icon = rank.icon;

          if (!offer) {
            return (
              <div
                key={`empty-slot-${index}`}
                className={`p-3 rounded-xl border border-dashed flex items-center justify-between text-xs transition-all ${
                  isDarkTheme
                    ? 'border-slate-800 text-slate-500 bg-slate-900/30'
                    : 'border-slate-200 text-slate-400 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full border border-dashed flex items-center justify-center font-mono text-[11px]">
                    {toPersianDigits(index + 1)}
                  </span>
                  <span>جایگاه خالی نردبان (در انتظار ثبت پیشنهاد قانونی بالاتر)</span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  حداقل پایه: {formatDualCurrency(basePrice).toman}
                </span>
              </div>
            );
          }

          const currency = formatDualCurrency(offer.amount);
          const isLeader = index === 0;

          return (
            <div
              key={offer.offerId}
              className={`p-3 rounded-xl border transition-all duration-300 relative overflow-hidden animate-price-pulse ${
                isLeader
                  ? isDarkTheme
                    ? 'bg-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/30'
                    : 'bg-amber-50/90 border-amber-300 shadow-xs ring-1 ring-amber-400/20'
                  : isDarkTheme
                  ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                {/* Left: Rank & Offerer Identity */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border shrink-0 ${rank.badgeClass}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm font-mono tracking-tight truncate">
                        {offer.offererId}
                      </span>
                      {isLeader && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#FF5000] text-white">
                          پیشتاز حراج
                        </span>
                      )}
                    </div>

                    {/* TR-13 Tie-Breaker Tag: Offer Sequence */}
                    <div className="flex items-center gap-2.5 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="flex items-center gap-0.5 font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                        <Hash className="w-3 h-3 text-[#FF5000]" />
                        <span>ترتیب: {toPersianDigits(offer.sequence)}</span>
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formatTimestamp(offer.placedAt)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Amounts Dual Display */}
                <div className="text-left shrink-0">
                  <div className="text-sm sm:text-base font-black text-[#00A86B] font-tnum">
                    {currency.toman}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                    {currency.rial}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* TR-13 Conformance Footer Notice */}
      <div
        className={`mt-3.5 pt-2.5 border-t text-[11px] flex items-start gap-2 ${
          isDarkTheme ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
        }`}
      >
        <ShieldCheck className="w-4 h-4 text-[#FF5000] shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          <strong>ضابطه TR-13:</strong> اولویت نردبان در مبالغ پیشنهادی یکسان، منحصراً بر مبنای شماره توالی ثبت در هسته مرکزی (Sequence Number) تعیین می‌شود و هیچ تقدم خارج از صف امکان‌پذیر نیست.
        </span>
      </div>
    </div>
  );
};
