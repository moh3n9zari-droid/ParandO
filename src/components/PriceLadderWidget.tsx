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
}) => {
  // Sort ladder descending by amount, then ascending by sequence (TR-13)
  const sortedOffers = [...ladder].sort((a, b) => {
    if (b.amount !== a.amount) {
      return b.amount - a.amount;
    }
    return a.sequence - b.sequence; // TR-13: Lower sequence wins
  });

  const slots = Array.from({ length: ladderSize }, (_, index) => {
    return sortedOffers[index] || null;
  });

  const getRankBadge = (rankIndex: number) => {
    if (rankIndex === 0) {
      return {
        label: 'رتبه ۱ (پیشتاز)',
        bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: Trophy,
        ring: 'ring-1 ring-amber-500/40',
      };
    }
    if (rankIndex === 1) {
      return {
        label: 'رتبه ۲ (نایب)',
        bg: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/30',
        icon: Medal,
        ring: '',
      };
    }
    if (rankIndex === 2) {
      return {
        label: 'رتبه ۳',
        bg: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
        icon: Award,
        ring: '',
      };
    }
    return {
      label: `رتبه ${toPersianDigits(rankIndex + 1)}`,
      bg: 'bg-slate-200/50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300/40',
      icon: TrendingUp,
      ring: '',
    };
  };

  if (compact) {
    return (
      <div className={`p-2 rounded-lg border text-xs ${
        isDarkTheme ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center justify-between mb-1.5 font-medium">
          <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <Radio className="w-3 h-3 text-red-500 animate-pulse" />
            نردبان زنده (Top {ladderSize})
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
            TR-13 فعال
          </span>
        </div>
        <div className="space-y-1">
          {slots.slice(0, 3).map((offer, idx) => {
            const rank = getRankBadge(idx);
            const Icon = rank.icon;
            if (!offer) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="flex items-center justify-between py-1 px-1.5 rounded text-[10px] text-slate-400 dark:text-slate-500 border border-dashed border-slate-300/40 dark:border-slate-700"
                >
                  <span>جایگاه {toPersianDigits(idx + 1)}</span>
                  <span>خالی</span>
                </div>
              );
            }
            const currency = formatDualCurrency(offer.amount);
            return (
              <div
                key={offer.offerId}
                className={`flex items-center justify-between py-1 px-1.5 rounded transition-all ${
                  idx === 0
                    ? 'bg-amber-500/10 border border-amber-500/25 font-semibold'
                    : 'bg-slate-100/60 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Icon className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-mono">{offer.offererId.substring(0, 12)}</span>
                </div>
                <div className="text-left font-bold text-[11px] text-emerald-600 dark:text-emerald-400">
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
      className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${
        isDarkTheme
          ? 'bg-slate-900 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      {/* Widget Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-1.5">
              <span>نردبان زنده قیمت و رتبه‌بندی</span>
              {competitionId && (
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {competitionId}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              چینش آنی بر اساس سقف قیمت و اولویت شماره ترتیب (انطباق با TR-01 و TR-13)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* WebSocket Status */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>{isLiveConnected ? 'کانال وب‌سوکت متصل' : 'حالت همگام‌سازی'}</span>
          </div>

          {onQuickBidClick && (
            <button
              onClick={onQuickBidClick}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white shadow-xs flex items-center gap-1 transition-transform active:scale-95 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>ثبت پیشنهاد</span>
            </button>
          )}
        </div>
      </div>

      {/* Ladder Slots */}
      <div className="space-y-2.5">
        {slots.map((offer, index) => {
          const rank = getRankBadge(index);
          const Icon = rank.icon;

          if (!offer) {
            return (
              <div
                key={`empty-slot-${index}`}
                className={`p-3 rounded-xl border border-dashed flex items-center justify-between text-xs transition-all ${
                  isDarkTheme
                    ? 'border-slate-800 text-slate-500 bg-slate-900/40'
                    : 'border-slate-200 text-slate-400 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full border border-dashed flex items-center justify-center font-mono text-[11px]">
                    {toPersianDigits(index + 1)}
                  </span>
                  <span>جایگاه خالی نردبان (در انتظار پیشنهاد بالاتر از پایه)</span>
                </div>
                <span className="text-[11px] font-mono">
                  حداقل: {formatDualCurrency(basePrice).toman}
                </span>
              </div>
            );
          }

          const currency = formatDualCurrency(offer.amount);
          const isLeader = index === 0;

          return (
            <div
              key={offer.offerId}
              className={`p-3 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                isLeader
                  ? isDarkTheme
                    ? 'bg-amber-950/30 border-amber-500/40 ring-1 ring-amber-500/30'
                    : 'bg-amber-50/80 border-amber-300/80 shadow-xs ring-1 ring-amber-400/30'
                  : isDarkTheme
                  ? 'bg-slate-800/70 border-slate-700/80 hover:border-slate-600'
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                {/* Left: Rank & Offerer Identity */}
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs border ${rank.bg}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs sm:text-sm font-mono tracking-tight">
                        {offer.offererId}
                      </span>
                      {isLeader && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500 text-slate-900">
                          پیشتاز حراج
                        </span>
                      )}
                    </div>
                    {/* TR-13 Tie-Breaker Tag: Offer Sequence */}
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700 font-mono">
                        <Hash className="w-2.5 h-2.5 text-amber-500" />
                        <span>ترتیب: {toPersianDigits(offer.sequence)}</span>
                      </span>
                      <span className="flex items-center gap-0.5 font-mono">
                        <Clock className="w-2.5 h-2.5 text-slate-400" />
                        <span>{formatTimestamp(offer.placedAt)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Amounts Dual Display */}
                <div className="text-left">
                  <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                    {currency.toman}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {currency.rial}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* TR-13 Conformance Footer Notice */}
      <div className={`mt-3.5 pt-2.5 border-t text-[11px] flex items-start gap-1.5 ${
        isDarkTheme ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
      }`}>
        <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span>
          <strong>استاندارد TR-13:</strong> در صورت پیشنهادهای هم‌قیمت، اولویت نردبان منحصراً بر اساس شماره ترتیب ثبت پیشنهاد (Offer Sequence Number) تعیین می‌گردد و تاریخچه در صف غیرقابل دخل و تصرف است.
        </span>
      </div>
    </div>
  );
};
