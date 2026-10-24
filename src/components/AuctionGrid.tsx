import React from 'react';
import { AuctionCard } from './AuctionCard';
import { MarketModuleConfig } from '../data/market_modules';
import { Offer } from '../core/competition_kernel';
import { SearchX, SlidersHorizontal } from 'lucide-react';
import { toPersianDigits } from '../utils/formatters';

export interface AuctionGridProps {
  modules: MarketModuleConfig[];
  currentModuleId: string;
  highestOffer?: Offer | null;
  ladder: readonly Offer[];
  currentTime: Date;
  endsAt: Date;
  onQuickBid: (module: MarketModuleConfig) => void;
  onSelectDetails: (module: MarketModuleConfig) => void;
  isDarkTheme?: boolean;
}

export const AuctionGrid: React.FC<AuctionGridProps> = ({
  modules,
  currentModuleId,
  highestOffer,
  ladder,
  currentTime,
  endsAt,
  onQuickBid,
  onSelectDetails,
  isDarkTheme = false,
}) => {
  if (modules.length === 0) {
    return (
      <div className={`text-center py-16 px-4 rounded-3xl border border-dashed my-6 ${
        isDarkTheme ? 'bg-slate-900/40 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
      }`}>
        <SearchX className="w-12 h-12 mx-auto text-slate-400 mb-3" />
        <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 mb-1">
          موردی با این مشخصات در تالارهای حراج یافت نشد
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          لطفاً کلمات کلیدی دیگری جستجو کنید یا فیلتر دسته‌بندی را روی «همه تالارها» قرار دهید.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Grid Subheader / Stats matching Temu E-Commerce Grid */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-bold text-slate-600 dark:text-slate-300">
          نمایش {toPersianDigits(modules.length)} حراج و مزایده فعال در تالار ملی
        </span>
        <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>مرتب‌سازی: پیشتاز و فوریت زمانی</span>
        </div>
      </div>

      {/* Responsive Multi-Column Grid: 2 cols on mobile, 3 on tablet, 4 on desktop (1440px) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        {modules.map((mod) => {
          const isSelected = mod.id === currentModuleId;
          const lotHighest = isSelected ? highestOffer : null;
          const lotLadder = isSelected ? ladder : [];

          return (
            <AuctionCard
              key={mod.id}
              module={mod}
              highestOffer={lotHighest}
              ladder={lotLadder}
              currentTime={currentTime}
              endsAt={isSelected ? endsAt : new Date(currentTime.getTime() + mod.durationMinutes * 60_000)}
              onQuickBid={onQuickBid}
              onSelectDetails={onSelectDetails}
              isDarkTheme={isDarkTheme}
            />
          );
        })}
      </div>
    </div>
  );
};
