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
  Wallet,
  User,
  ShoppingBag,
  Headphones,
  FileCheck2,
  Lock,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { toPersianDigits } from '../utils/formatters';

export interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  isOnline: boolean;
  onOpenResilienceModal: () => void;
  pendingQueueCount: number;
  onNavigateTab: (tab: 'home' | 'categories' | 'live' | 'wallet' | 'profile') => void;
  activeTab: string;
  activeOffererId?: string;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  isDarkTheme,
  onToggleTheme,
  isOnline,
  onOpenResilienceModal,
  pendingQueueCount,
  onNavigateTab,
  activeTab,
  activeOffererId = 'offerer-alpha',
}) => {
  return (
    <header className="sticky top-0 z-40 w-full shadow-md select-none transition-colors duration-200">
      {/* 1. Top Announcement Bar (Dark Stripe - Temu Reference Style) */}
      <div className="bg-slate-950 text-slate-300 text-[11px] py-1 px-4 sm:px-8 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left / Start: Official Trust & Guarantee Badges */}
          <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto scrollbar-none whitespace-nowrap">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>تضمین ودیعه قانونی ۱۵٪ خزانه‌داری (ADR-002)</span>
            </span>
            <span className="hidden md:flex items-center gap-1 text-slate-400">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>پروتکل تسویه قطعی و بدون دخل‌وتصرف (TR-13)</span>
            </span>
            <span className="hidden lg:flex items-center gap-1 text-slate-400">
              <Headphones className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>پشتیبانی شبانه‌روزی تالارهای معاملاتی</span>
            </span>
          </div>

          {/* Right / End: National Network Status & Utilities */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* National Network Resilience Status */}
            <button
              onClick={onOpenResilienceModal}
              title={isOnline ? 'شبکه ملی اطلاعات متصل است' : 'نوسان شبکه ملی - حالت صف آفلاین فعال'}
              className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-all ${
                isOnline
                  ? 'text-emerald-400 hover:text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
              }`}
            >
              {isOnline ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span className="hidden sm:inline">شبکه ملی: پایدار</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span>صف آفلاین ({toPersianDigits(pendingQueueCount)})</span>
                </>
              )}
            </button>

            <span className="text-slate-700 hidden sm:inline">|</span>

            {/* PWA Install Button */}
            <PWAInstallButton />

            <span className="text-slate-700 hidden sm:inline">|</span>

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              title={isDarkTheme ? 'سوییچ به تم روشن بازار عمومی' : 'سوییچ به تم تاریک داشبورد امنیتی'}
              className="p-1 rounded text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
            >
              {isDarkTheme ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Brand Header (Vibrant Orange / Dark Accent - Temu Reference Visuals) */}
      <div className={`px-4 sm:px-8 py-2.5 transition-colors duration-200 ${
        isDarkTheme
          ? 'bg-slate-900 border-b border-slate-800 text-slate-100'
          : 'bg-[#fb7701] text-white shadow-xs'
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-6">
          {/* Logo & Brand Identity */}
          <div
            onClick={() => onNavigateTab('home')}
            className="flex items-center gap-2.5 cursor-pointer shrink-0 group"
          >
            {/* Logo Emblem Icon */}
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-xl shadow-md transition-transform group-hover:scale-105 ${
              isDarkTheme
                ? 'bg-gradient-to-tr from-amber-500 to-orange-600 text-slate-950'
                : 'bg-white text-[#fb7701]'
            }`}>
              پ
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl sm:text-2xl font-black tracking-tight drop-shadow-xs">
                  پرندو
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full hidden sm:inline-block ${
                  isDarkTheme
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-black/20 text-white'
                }`}>
                  حراج ملی
                </span>
              </div>
              <p className={`text-[10px] hidden md:block font-medium ${
                isDarkTheme ? 'text-slate-400' : 'text-orange-100'
              }`}>
                سامانه رسمی مزایدات و معاملات امانی کشور
              </p>
            </div>
          </div>

          {/* Central Rounded Search Bar (Temu-Style Signature Element) */}
          <div className="flex-1 max-w-2xl mx-auto">
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="جستجوی سکه تمام بهار، فرآورده‌های پتروشیمی، خودرو سنگین، املاک مازاد یا کد حراج..."
                className={`w-full py-2.5 pr-4 pl-24 text-xs sm:text-sm rounded-full transition-all focus:outline-none ${
                  isDarkTheme
                    ? 'bg-slate-800 text-white placeholder-slate-400 border border-slate-700 focus:ring-2 focus:ring-amber-500'
                    : 'bg-white text-slate-900 placeholder-slate-400 shadow-sm focus:ring-2 focus:ring-slate-900'
                }`}
              />

              {/* Action Icons inside Search Bar */}
              <div className="absolute left-1.5 flex items-center gap-1">
                <button
                  type="button"
                  title="جستجوی تصویری کالا"
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="جستجوی صوتی"
                  className="p-1.5 text-slate-400 hover:text-orange-600 transition-colors"
                >
                  <Mic className="w-4 h-4" />
                </button>
                {/* Search Magnifier Button */}
                <button
                  type="button"
                  className={`p-2 rounded-full transition-colors cursor-pointer ${
                    isDarkTheme
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      : 'bg-[#fb7701] text-white hover:bg-orange-600'
                  }`}
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* User Utility Actions (Orders, Support, Account, Escrow Wallet) */}
          <div className="flex items-center gap-1 sm:gap-4 shrink-0 text-xs font-semibold">
            {/* Live Auctions Tab Link */}
            <button
              onClick={() => onNavigateTab('live')}
              className={`hidden md:flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'live'
                  ? isDarkTheme ? 'text-amber-400' : 'text-white underline underline-offset-4 font-bold'
                  : isDarkTheme ? 'text-slate-300 hover:text-white' : 'text-orange-100 hover:text-white'
              }`}
            >
              <div className="relative">
                <Layers className="w-4 h-4" />
                <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-red-500 animate-ping" />
              </div>
              <span className="text-[11px]">حراج زنده</span>
            </button>

            {/* Escrow & Wallet Action Link */}
            <button
              onClick={() => onNavigateTab('wallet')}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'wallet'
                  ? isDarkTheme ? 'text-amber-400' : 'text-white underline underline-offset-4 font-bold'
                  : isDarkTheme ? 'text-slate-300 hover:text-white' : 'text-orange-100 hover:text-white'
              }`}
            >
              <div className="relative">
                <Wallet className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                <span className="absolute -top-1 -right-1.5 px-1 py-0.2 rounded-full bg-black/40 text-[9px] font-mono text-amber-300">
                  ۱۵٪
                </span>
              </div>
              <span className="text-[11px] hidden sm:inline">کیف و ودیعه</span>
            </button>

            {/* Profile & ADR-003 Governance Link */}
            <button
              onClick={() => onNavigateTab('profile')}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'profile'
                  ? isDarkTheme ? 'text-amber-400' : 'text-white underline underline-offset-4 font-bold'
                  : isDarkTheme ? 'text-slate-300 hover:text-white' : 'text-orange-100 hover:text-white'
              }`}
            >
              <User className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              <span className="text-[11px] hidden sm:inline">حساب کاربری</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
