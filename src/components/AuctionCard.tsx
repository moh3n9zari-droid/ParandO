import React from 'react';
import {
  Timer,
  Zap,
  ShieldCheck,
  Building,
  Flame,
  ArrowUpRight,
  TrendingUp,
  Award,
  Heart,
  Star,
  CheckCircle2,
  Clock,
  Hash,
} from 'lucide-react';
import { MarketModuleConfig } from '../data/market_modules';
import { Offer } from '../core/competition_kernel';
import { formatDualCurrency, formatDuration, toPersianDigits } from '../utils/formatters';

export interface AuctionCardProps {
  module: MarketModuleConfig;
  highestOffer?: Offer | null;
  ladder: readonly Offer[];
  currentTime: Date;
  endsAt: Date;
  onQuickBid: (module: MarketModuleConfig) => void;
  onSelectDetails: (module: MarketModuleConfig) => void;
  isDarkTheme?: boolean;
  isWatchlisted?: boolean;
  onToggleWatchlist?: (id: string) => void;
}

export const AuctionCard: React.FC<AuctionCardProps> = ({
  module,
  highestOffer,
  ladder,
  currentTime,
  endsAt,
  onQuickBid,
  onSelectDetails,
  isDarkTheme = false,
  isWatchlisted = false,
  onToggleWatchlist,
}) => {
  const timeLeftMs = Math.max(0, endsAt.getTime() - currentTime.getTime());
  const isFinalFiveMinutes = timeLeftMs > 0 && timeLeftMs < 5 * 60 * 1000;
  const isUrgent = timeLeftMs < 30 * 60 * 1000 || module.urgent;

  const currentPrice = highestOffer ? highestOffer.amount : module.basePrice;
  const priceDual = formatDualCurrency(currentPrice);
  const basePriceDual = formatDualCurrency(module.basePrice);

  // Reserve price logic (eBay mechanic)
  const reserveThreshold = module.reservePrice || module.basePrice * 1.05;
  const isReserveMet = currentPrice >= reserveThreshold;

  // Sorted ladder for compact top 3 preview (TR-13)
  const sortedLadder = [...ladder]
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : a.sequence - b.sequence))
    .slice(0, 3);

  return (
    <div
      onClick={() => onSelectDetails(module)}
      className={`group rounded-xl overflow-hidden border transition-all duration-300 flex flex-col justify-between cursor-pointer relative ${
        isDarkTheme
          ? 'bg-[#1E1E24] border-slate-800 hover:border-[#FF5000]/60 text-slate-100 hover:shadow-xl hover:shadow-black/40'
          : 'bg-white border-[#E5E7EB] hover:border-[#FF5000]/70 hover:shadow-lg hover:shadow-orange-500/10 text-slate-800'
      }`}
      dir="rtl"
    >
      {/* Top Media & Badge Overlays */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <img
          src={module.imageUrl}
          alt={module.defaultTitle}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Top Floating Strip: Live Urgency Countdown + Watchlist Heart */}
        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none">
          {/* Urgency Countdown Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md shadow-md pointer-events-auto ${
              isFinalFiveMinutes
                ? 'bg-[#D32F2F] text-white animate-pulse'
                : 'bg-black/75 text-white'
            }`}
          >
            <Clock className={`w-3.5 h-3.5 ${isFinalFiveMinutes ? 'text-white' : 'text-[#FF5000]'}`} />
            <span className="font-tnum tracking-tight">{formatDuration(timeLeftMs)}</span>
          </div>

          {/* Watchlist Toggle Button (eBay Mechanic) */}
          {onToggleWatchlist && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleWatchlist(module.id);
              }}
              className={`p-1.5 rounded-full backdrop-blur-md shadow-md transition-transform active:scale-90 pointer-events-auto cursor-pointer ${
                isWatchlisted
                  ? 'bg-red-500 text-white'
                  : 'bg-black/60 text-white hover:bg-black/80'
              }`}
              title={isWatchlisted ? 'حذف از پیگیری' : 'افزودن به پیگیری (Watchlist)'}
            >
              <Heart className={`w-4 h-4 ${isWatchlisted ? 'fill-current' : ''}`} />
            </button>
          )}
        </div>

        {/* Bottom Floating Overlay: Reserve Status & Lot Number */}
        <div className="absolute bottom-2 inset-x-2.5 flex items-center justify-between text-[10px] pointer-events-none">
          <span className="px-2 py-0.5 rounded-md font-bold backdrop-blur-md bg-black/75 text-white font-mono">
            {module.lotNumber}
          </span>

          {/* Reserve Met / Unmet Badge (eBay Mechanic) */}
          <span
            className={`px-2 py-0.5 rounded-md font-bold backdrop-blur-md shadow-xs ${
              isReserveMet
                ? 'bg-[#00A86B]/90 text-white'
                : 'bg-amber-500/90 text-slate-950'
            }`}
          >
            {isReserveMet ? 'قیمت رزرو محقق شد' : 'رزرو محقق نشده'}
          </span>
        </div>
      </div>

      {/* Card Content Section */}
      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          {/* Category Badge & Seller Score */}
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="font-bold text-[#FF5000] truncate max-w-[150px]">
              {module.badge}
            </span>

            {/* Seller Reputation Score */}
            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {toPersianDigits(module.sellerRating || 4.9)}
              </span>
              <span>({toPersianDigits(module.sellerReviewCount || 850)})</span>
            </div>
          </div>

          {/* Product Title */}
          <h3 className="font-bold text-xs sm:text-sm line-clamp-2 leading-snug mb-2 group-hover:text-[#FF5000] transition-colors">
            {module.defaultTitle}
          </h3>

          {/* Lot Unit */}
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1">
            <Building className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">واحد عرضه: {module.unit}</span>
          </div>
        </div>

        {/* Pricing & Compact Price Ladder Preview */}
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          {/* Price Label & High Bid Indicator */}
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-slate-500 dark:text-slate-400">
              {highestOffer ? 'آخرین پیشنهاد برتر:' : 'قیمت پایه حراج:'}
            </span>
            {highestOffer && (
              <span className="text-[#00A86B] font-bold text-[10px] flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />
                <span>{toPersianDigits(ladder.length)} پیشنهاد</span>
              </span>
            )}
          </div>

          {/* Dual Currency Price */}
          <div className="mb-2">
            <div className="text-base sm:text-lg font-black text-[#00A86B] font-tnum tracking-tight leading-none">
              {priceDual.toman}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
              {priceDual.rial}
            </div>
          </div>

          {/* Compact Top-3 Bidder Ranking (eBay & TR-13 Tie-Breaker Preview) */}
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 mb-3 space-y-1 text-[10px]">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-semibold mb-0.5">
              <span>نردبان جایگاه‌های برتر (TR-13):</span>
              <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">
                ودیعه ۱۵٪
              </span>
            </div>

            {sortedLadder.length > 0 ? (
              sortedLadder.map((off, idx) => (
                <div
                  key={off.offerId}
                  className={`flex items-center justify-between px-1.5 py-0.5 rounded ${
                    idx === 0
                      ? 'bg-amber-500/10 text-slate-900 dark:text-amber-300 font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1 font-mono">
                    <span className="w-3.5 text-center font-bold text-[#FF5000]">
                      #{toPersianDigits(idx + 1)}
                    </span>
                    <span className="truncate max-w-[80px]">{off.offererId}</span>
                    <span className="text-[9px] text-slate-400">
                      (ترتیب: {toPersianDigits(off.sequence)})
                    </span>
                  </div>
                  <span className="font-bold font-tnum text-[#00A86B]">
                    {formatDualCurrency(off.amount).toman}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-slate-400 text-center py-0.5">
                در انتظار اولین پیشنهاد قانونی (گام: {formatDualCurrency(module.minIncrement).toman})
              </div>
            )}
          </div>

          {/* Action Button: Quick Bid */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickBid(module);
              }}
              className="flex-1 py-2 px-3 rounded-full text-xs font-bold bg-[#FF5000] hover:bg-[#E64A00] text-white shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>پیشنهاد سریع</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectDetails(module);
              }}
              className={`p-2 rounded-full border transition-colors cursor-pointer ${
                isDarkTheme
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 hover:bg-slate-100 text-slate-600'
              }`}
              title="مشاهده شناسنامه، گواهی‌ها و نردبان کامل"
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
