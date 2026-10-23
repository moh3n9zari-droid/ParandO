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
}) => {
  const timeLeftMs = Math.max(0, endsAt.getTime() - currentTime.getTime());
  const isUrgent = timeLeftMs < 30 * 60 * 1000 || module.urgent; // less than 30 mins
  const currentPrice = highestOffer ? highestOffer.amount : module.basePrice;
  const priceDual = formatDualCurrency(currentPrice);
  const basePriceDual = formatDualCurrency(module.basePrice);

  return (
    <div
      className={`group rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col justify-between cursor-pointer ${
        isDarkTheme
          ? 'bg-slate-900 border-slate-800 hover:border-amber-500/40 text-slate-100 hover:shadow-lg hover:shadow-amber-950/20'
          : 'bg-white border-slate-200/90 hover:border-orange-400 hover:shadow-md text-slate-800'
      }`}
      onClick={() => onSelectDetails(module)}
    >
      {/* Top Media & Live Urgency Overlay */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <img
          src={module.imageUrl}
          alt={module.defaultTitle}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Live Urgency Countdown Badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md shadow-xs bg-red-600/90 text-white">
          <Flame className="w-3 h-3 fill-current animate-pulse text-amber-300" />
          <span>{formatDuration(timeLeftMs)}</span>
        </div>

        {/* Lot Number & Tag Badge */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-md shadow-xs bg-black/70 text-white">
            {module.tagText}
          </span>
        </div>

        {/* Top Bidder Pill if Active */}
        {highestOffer && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold backdrop-blur-md bg-amber-500 text-slate-900 shadow-xs">
            <Award className="w-2.5 h-2.5" />
            <span className="font-mono">#{toPersianDigits(highestOffer.sequence)}</span>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          {/* Category & Tenant Info */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            <span className="truncate max-w-[120px] font-medium text-orange-600 dark:text-orange-400">
              {module.badge}
            </span>
            <span className="font-mono text-slate-400 dark:text-slate-500">
              {module.lotNumber}
            </span>
          </div>

          {/* Title */}
          <h4 className="font-bold text-xs sm:text-sm line-clamp-2 leading-snug mb-1.5 group-hover:text-orange-600 dark:group-hover:text-amber-400 transition-colors">
            {module.defaultTitle}
          </h4>

          {/* Lot Unit */}
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
            <Building className="w-3 h-3 text-slate-400" />
            <span>واحد عرضه: {module.unit}</span>
          </div>
        </div>

        {/* Price & Bid Action Area */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {highestOffer ? 'آخرین پیشنهاد برتر:' : 'قیمت پایه حراج:'}
            </span>
            {highestOffer && (
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                <TrendingUp className="w-2.5 h-2.5" />
                رقابتی
              </span>
            )}
          </div>

          {/* Dual Currency (Toman Bold + Rial Secondary) */}
          <div className="mb-2">
            <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tight leading-none">
              {priceDual.toman}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
              {priceDual.rial}
            </div>
          </div>

          {/* Mini Ladder Snippet: Leading Rank Info */}
          <div className="flex items-center justify-between text-[10px] py-1 px-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/60 mb-2">
            <span className="text-slate-600 dark:text-slate-400">
              گام افزایش: {formatDualCurrency(module.minIncrement).toman}
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400">
              ودیعه: ۱۵٪
            </span>
          </div>

          {/* Action Button: Quick Bid */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickBid(module);
              }}
              className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-linear-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white shadow-xs flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
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
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                isDarkTheme
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 hover:bg-slate-100 text-slate-600'
              }`}
              title="مشاهده جزئیات و نردبان زنده"
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
