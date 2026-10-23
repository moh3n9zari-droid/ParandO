import React from 'react';
import {
  Home,
  LayoutGrid,
  Flame,
  Wallet,
  ShieldCheck,
} from 'lucide-react';

export type NavTab = 'home' | 'categories' | 'live' | 'wallet' | 'profile';

export interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  isDarkTheme: boolean;
  liveAuctionCount?: number;
  pendingHoldsCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  isDarkTheme,
  liveAuctionCount = 6,
  pendingHoldsCount = 1,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number | string; highlight?: boolean }[] = [
    { id: 'home', label: 'خانه', icon: Home },
    { id: 'categories', label: 'دسته‌ها', icon: LayoutGrid },
    { id: 'live', label: 'حراج زنده', icon: Flame, badge: 'زنده', highlight: true },
    { id: 'wallet', label: 'کیف و ودیعه', icon: Wallet, badge: pendingHoldsCount > 0 ? pendingHoldsCount : undefined },
    { id: 'profile', label: 'حاکمیت و اسناد', icon: ShieldCheck },
  ];

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-lg transition-colors duration-200 ${
        isDarkTheme
          ? 'bg-slate-900/95 border-slate-800 text-slate-400'
          : 'bg-white/95 border-slate-200 text-slate-500 shadow-lg'
      } pb-safe`}
    >
      <div className="max-w-md mx-auto grid grid-cols-5 h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`relative flex flex-col items-center justify-center gap-1 transition-all group cursor-pointer ${
                isActive
                  ? item.highlight
                    ? 'text-orange-500 font-bold'
                    : isDarkTheme
                    ? 'text-amber-400 font-bold'
                    : 'text-orange-600 font-bold'
                  : 'hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110' : 'group-hover:scale-105'
                  }`}
                />
                {item.badge && (
                  <span
                    className={`absolute -top-1.5 -right-2 text-[9px] font-bold px-1 py-0.2 rounded-full ${
                      item.highlight
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-amber-500 text-slate-900'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] tracking-tight">{item.label}</span>
              {isActive && (
                <span
                  className={`absolute top-0 w-8 h-0.5 rounded-full ${
                    item.highlight ? 'bg-orange-500' : isDarkTheme ? 'bg-amber-400' : 'bg-orange-600'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
