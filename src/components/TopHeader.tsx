import React, { useState } from 'react';
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
  Heart,
  Wallet,
  Building2,
  Lock,
  Phone,
  Flame,
  Coins,
  Truck,
  Wheat,
  Cpu,
  Layers,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { formatDualCurrency, toPersianDigits } from '../utils/formatters';

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
  watchlistCount?: number;
  onOpenWatchlist?: () => void;
  walletBalance?: number;
  activeExposure?: number;
  activeBidsCount?: number;
  onOpenWalletTab?: () => void;
  onOpenSellerDashboard?: () => void;
  latencyMs?: number;
}

export const CATEGORIES = [
  { id: 'all', label: 'پیشنهادهای ویژه', icon: Sparkles },
  { id: 'gold', label: 'طلا و مسکوکات', icon: Coins },
  { id: 'petro', label: 'فرآورده‌های پلیمری', icon: Flame },
  { id: 'automotive', label: 'خودرو و سنگین', icon: Truck },
  { id: 'realty', label: 'املاک و مستغلات', icon: Building2 },
  { id: 'agri', label: 'اقلام صادراتی', icon: Wheat },
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
  watchlistCount = 0,
  onOpenWatchlist,
  walletBalance = 200_000_000_000,
  activeExposure = 30_000_000_000,
  activeBidsCount = 2,
  onOpenWalletTab,
  onOpenSellerDashboard,
  latencyMs = 24,
}) => {
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 transition-colors duration-200 select-none" dir="rtl">
      {/* 1. Top System Strip (Deep Charcoal #121212) */}
      <div className="bg-[#121212] text-slate-300 text-[11px] px-3 sm:px-6 py-1 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left: National Information Network & Latency */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenResilienceModal}
              className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                isOnline ? 'text-emerald-400 hover:text-emerald-300' : 'text-amber-400 animate-pulse'
              }`}
              title="پایشگر تاب‌آوری شبکه ملی اطلاعات"
            >
              {isOnline ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <Wifi className="w-3.5 h-3.5" />
                  <span className="font-medium">شبکه ملی اطلاعات (NIN): متصل</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span className="font-bold">صف آفلاین ({toPersianDigits(pendingQueueCount)})</span>
                </>
              )}
            </button>

            <span className="text-white/20">|</span>

            {/* Latency < 30ms */}
            <div className="hidden sm:flex items-center gap-1 text-slate-400 font-mono">
              <span>تاخیر وب‌سوکت:</span>
              <span className={`font-bold ${latencyMs < 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {toPersianDigits(latencyMs)}ms
              </span>
            </div>

            <span className="hidden sm:inline text-white/20">|</span>

            {/* Security Seal */}
            <div className="hidden md:flex items-center gap-1 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-[#FF5000]" />
              <span>استاندارد تسویه و حاکمیت ADR-001 الی ADR-004</span>
            </div>
          </div>

          {/* Right: Helpline & Official Support */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 text-slate-400">
              <Phone className="w-3 h-3 text-[#FF5000]" />
              <span>پشتیبانی شبانه‌روزی حراج:</span>
              <span className="font-mono text-white font-bold">۰۲۱-۸۸۹۹۰۰۰۰</span>
            </div>
            <PWAInstallButton />
          </div>
        </div>
      </div>

      {/* 2. Main Header Bar (Deep Charcoal #1E1E24) */}
      <div
        className={`px-3 sm:px-6 py-2.5 transition-colors duration-200 border-b ${
          isDarkTheme
            ? 'bg-[#1E1E24] text-white border-slate-800'
            : 'bg-white text-slate-900 border-slate-200 shadow-xs'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 md:gap-6">
          {/* Parando Brand Wordmark */}
          <a href="#" className="flex items-center gap-2 shrink-0 group">
            <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-[#FF5000] to-[#E64A00] flex items-center justify-center text-white shadow-md shadow-orange-500/20 font-black text-lg group-hover:scale-105 transition-transform">
              پ
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-xl tracking-tight text-[#FF5000]">پرندو</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-[#FF5000]/10 text-[#FF5000] border border-[#FF5000]/20 hidden sm:inline">
                  حراج ملی
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden xl:block -mt-0.5">
                سامانه معاملات چندمستأجری و مزایدات رسمی کشور
              </p>
            </div>
          </a>

          {/* Central Unified Search Engine */}
          <div className="flex-1 max-w-2xl relative">
            <div
              className={`flex items-center rounded-full border transition-all ${
                isDarkTheme
                  ? 'bg-slate-900 border-slate-700 focus-within:border-[#FF5000] focus-within:ring-2 focus-within:ring-[#FF5000]/30'
                  : 'bg-[#F7F7FA] border-slate-300 focus-within:border-[#FF5000] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#FF5000]/20'
              }`}
            >
              {/* Category Dropdown Trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  className="hidden md:flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700 hover:text-[#FF5000] transition-colors"
                >
                  <span>دسته‌بندی‌ها</span>
                  <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                </button>
              </div>

              {/* Search Icon */}
              <div className="pr-3 pl-1 text-slate-400">
                <Search className="w-4 h-4 text-[#FF5000]" />
              </div>

              {/* Text Input */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="جستجوی سکه تمام بهار، پلی‌اتیلن، کشنده ترانزیتی، کد مزایده یا شناسه کالا..."
                className="w-full py-2 pl-18 pr-1 text-xs sm:text-sm bg-transparent focus:outline-none placeholder-slate-400"
              />

              {/* Quick Photo & Voice Search Actions (Temu Merchandising) */}
              <div className="absolute left-2.5 flex items-center gap-1 text-slate-400">
                <button
                  type="button"
                  title="جستجوی تصویری کالا"
                  className="p-1 hover:text-[#FF5000] transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="جستجوی صوتی"
                  className="p-1 hover:text-[#FF5000] transition-colors cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* User Utility Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Watchlist Counter (eBay Mechanic) */}
            <button
              onClick={onOpenWatchlist}
              className={`p-2 rounded-xl border relative transition-all cursor-pointer ${
                isDarkTheme
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:border-[#FF5000]'
                  : 'bg-[#F7F7FA] border-slate-200 text-slate-700 hover:text-slate-900 hover:border-[#FF5000]'
              }`}
              title="فهرست پیگیری (Watchlist)"
            >
              <Heart className={`w-4 h-4 ${watchlistCount > 0 ? 'fill-red-500 text-red-500' : ''}`} />
              {watchlistCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {toPersianDigits(watchlistCount)}
                </span>
              )}
            </button>

            {/* Escrow & Wallet Chip (15% Deposit Hold Indicator - ADR-002) */}
            <button
              onClick={onOpenWalletTab}
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                isDarkTheme
                  ? 'bg-slate-900 border-slate-700 hover:border-amber-500/40 text-slate-200'
                  : 'bg-[#F7F7FA] border-slate-200 hover:border-orange-400 text-slate-800'
              }`}
              title="مدیریت کیف پول و سپرده قانونی ۱۵٪ (K-INV-7)"
            >
              <div className="p-1 rounded-lg bg-amber-500/15 text-amber-500">
                <Wallet className="w-3.5 h-3.5" />
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block leading-tight">سپرده در دسترس:</span>
                <span className="text-xs font-black font-tnum text-emerald-600 dark:text-emerald-400">
                  {formatDualCurrency(walletBalance).toman}
                </span>
              </div>
            </button>

            {/* Seller & Institutional Dashboard Trigger */}
            <button
              onClick={onOpenSellerDashboard}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#FF5000]/10 hover:bg-[#FF5000]/20 text-[#FF5000] border border-[#FF5000]/30 transition-all cursor-pointer"
              title="میز کارگزاری، فروشندگان دولتی و تسویه ADR-003"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>پنل فروشنده و تسویه</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={onToggleTheme}
              title={isDarkTheme ? 'تم سفید اینترپرایز' : 'تم تیره امنیتی'}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isDarkTheme
                  ? 'bg-slate-900 border-slate-700 text-amber-400 hover:bg-slate-800'
                  : 'bg-[#F7F7FA] border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isDarkTheme ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Category Navigation Bar (Temu-Style Horizontal Scrolling Pills) */}
      <div
        className={`px-3 sm:px-6 py-2 border-b overflow-x-auto scrollbar-none transition-colors duration-200 ${
          isDarkTheme
            ? 'bg-[#18181E] border-slate-800'
            : 'bg-[#F7F7FA] border-slate-200/80 shadow-xs'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center gap-1.5">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#FF5000] text-white shadow-xs font-bold scale-[1.02]'
                    : isDarkTheme
                    ? 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/90 shadow-2xs'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-[#FF5000]'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
