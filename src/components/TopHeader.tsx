import React from 'react';
import {
  Search,
  Camera,
  Mic,
  Moon,
  Sun,
  ShieldCheck,
  Wifi,
  WifiOff,
  Bell,
  Coins,
  Flame,
  Truck,
  Building2,
  Wheat,
  Cpu,
  Layers,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export interface TopHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  isOnline: boolean;
  onOpenResilienceModal: () => void;
  pendingQueueCount: number;
  unreadNotificationsCount?: number;
}

export const CATEGORIES = [
  { id: 'all', label: 'همه اقلام', icon: Layers },
  { id: 'gold', label: 'طلا و مسکوکات', icon: Coins },
  { id: 'petro', label: 'پتروشیمی و انرژی', icon: Flame },
  { id: 'automotive', label: 'خودرو و ترابری', icon: Truck },
  { id: 'realty', label: 'املاک و اراضی', icon: Building2 },
  { id: 'agri', label: 'صادراتی و کشاورزی', icon: Wheat },
  { id: 'goods', label: 'ماشین‌آلات صنعتی', icon: Cpu },
];

export const TopHeader: React.FC<TopHeaderProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  isDarkTheme,
  onToggleTheme,
  isOnline,
  onOpenResilienceModal,
  pendingQueueCount,
  unreadNotificationsCount = 3,
}) => {
  return (
    <header className={`sticky top-0 z-40 transition-colors duration-200 border-b ${
      isDarkTheme
        ? 'bg-slate-900/95 text-slate-100 border-slate-800'
        : 'bg-white/95 text-slate-800 border-slate-200/80 shadow-xs'
    } backdrop-blur-md`}>
      {/* Top Utility Brand Bar */}
      <div className="px-3 sm:px-6 pt-2 pb-1.5 max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Brand & Emblem */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-linear-to-tr from-amber-500 via-orange-600 to-red-600 flex items-center justify-center text-white shadow-sm font-black text-sm">
            پ
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight">پرندو</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                حراج ملی پرندو
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block">
              پلتفرم امن معاملات امانی و رقابت‌های دولتی (ADR-001 الی ADR-004)
            </p>
          </div>
        </div>

        {/* Action Controls & Theme Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* PWA Install Trigger Button */}
          <PWAInstallButton />

          {/* National Network Status Indicator */}
          <button
            onClick={onOpenResilienceModal}
            title={isOnline ? 'شبکه ملی اطلاعات متصل است' : 'نوسان شبکه ملی - حالت ذخیره محلی فعال'}
            className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 animate-pulse'
            }`}
          >
            {isOnline ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <Wifi className="w-3.5 h-3.5" />
                <span className="hidden md:inline">شبکه ملی پایدار</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>صف آفلاین ({pendingQueueCount})</span>
              </>
            )}
          </button>

          {/* Hybrid Theme Switcher (Temu Light vs Institutional Dark) */}
          <button
            onClick={onToggleTheme}
            title={isDarkTheme ? 'تغییر به تم بازار عمومی (طرح تمو)' : 'تغییر به تم حاکمیتی و ممیزی امنیتی'}
            className={`p-1.5 rounded-lg border transition-all ${
              isDarkTheme
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {isDarkTheme ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              className={`p-1.5 rounded-lg border ${
                isDarkTheme ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
              title="اعلان‌ها و هشدارهای حراج"
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Temu-Style Sticky Search Bar */}
      <div className="px-3 sm:px-6 pb-2 max-w-7xl mx-auto">
        <div className="relative flex items-center">
          <div className="absolute right-3 text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="جستجوی سکه تمام، پلی‌اتیلن، کشنده تجاری، املاک دولتی یا کد مزایده..."
            className={`w-full pr-9 pl-20 py-2 text-xs sm:text-sm rounded-full transition-all focus:outline-none focus:ring-2 ${
              isDarkTheme
                ? 'bg-slate-800/90 text-white placeholder-slate-400 border border-slate-700 focus:ring-amber-500 focus:bg-slate-800'
                : 'bg-slate-100 text-slate-900 placeholder-slate-400 border border-slate-200 focus:ring-orange-500 focus:bg-white focus:border-orange-500'
            }`}
          />
          {/* Quick Voice / Camera Actions (Temu Inspiration) */}
          <div className="absolute left-2.5 flex items-center gap-1.5 text-slate-400">
            <button
              type="button"
              title="جستجوی تصویری اقلام"
              className="p-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="جستجوی صوتی"
              className="p-1 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Category Filter Pills (Mobile-First Scrolling) */}
      <div className="px-3 sm:px-6 pb-2 max-w-7xl mx-auto overflow-x-auto scrollbar-none flex items-center gap-1.5">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                isSelected
                  ? 'bg-linear-to-r from-orange-600 to-amber-600 text-white shadow-xs font-semibold'
                  : isDarkTheme
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
