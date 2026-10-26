import React from 'react';
import { X, Heart, Trash2, ArrowUpRight, Zap, ExternalLink } from 'lucide-react';
import { MarketModuleConfig } from '../data/market_modules';
import { Offer } from '../core/competition_kernel';
import { formatDualCurrency } from '../utils/formatters';

export interface WatchlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  watchlistIds: string[];
  allModules: MarketModuleConfig[];
  onRemoveFromWatchlist: (id: string) => void;
  onSelectLot: (mod: MarketModuleConfig) => void;
  onQuickBid: (mod: MarketModuleConfig) => void;
  isDarkTheme?: boolean;
}

export const WatchlistModal: React.FC<WatchlistModalProps> = ({
  isOpen,
  onClose,
  watchlistIds,
  allModules,
  onRemoveFromWatchlist,
  onSelectLot,
  onQuickBid,
  isDarkTheme = false,
}) => {
  if (!isOpen) return null;

  const watchedItems = allModules.filter((m) => watchlistIds.includes(m.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in" dir="rtl">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
          isDarkTheme ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
              <Heart className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">فهرست پیگیری حراج‌ها (Watchlist)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {watchedItems.length > 0
                  ? `${watchedItems.length} حراج نشان‌شده برای رصد آنی`
                  : 'هنوز موردی به فهرست علاقه‌مندی‌ها اضافه نشده است'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Items List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {watchedItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Heart className="w-12 h-12 mx-auto mb-3 stroke-[1.5] text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">
                فهرست پیگیری خالی است
              </p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                روی آیکون قلب در کارت‌های حراج کلیک کنید تا تغییرات قیمت و نردبان آن‌ها را در این بخش رصد نمایید.
              </p>
            </div>
          ) : (
            watchedItems.map((mod) => (
              <div
                key={mod.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                  isDarkTheme ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={mod.imageUrl}
                    alt={mod.defaultTitle}
                    className="w-14 h-14 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] text-orange-600 font-bold block">{mod.badge}</span>
                    <h4 className="text-xs font-bold line-clamp-1 text-slate-900 dark:text-slate-100">
                      {mod.defaultTitle}
                    </h4>
                    <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      پایه: {formatDualCurrency(mod.basePrice).toman}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      onQuickBid(mod);
                      onClose();
                    }}
                    className="py-1.5 px-2.5 rounded-lg text-xs font-bold bg-[#FF5000] hover:bg-[#E64A00] text-white flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                    title="پیشنهاد سریع"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>پیشنهاد</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectLot(mod);
                      onClose();
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
                    title="مشاهده جزئیات"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onRemoveFromWatchlist(mod.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                    title="حذف از پیگیری"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-center">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            بستن فهرست
          </button>
        </div>
      </div>
    </div>
  );
};
