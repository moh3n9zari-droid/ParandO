import React from 'react';
import {
  Layers,
  Coins,
  Flame,
  Truck,
  Building2,
  Wheat,
  Cpu,
} from 'lucide-react';
import { toPersianDigits } from '../utils/formatters';

export interface CategoryPillsProps {
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  isDarkTheme?: boolean;
}

export const CATEGORY_ITEMS = [
  { id: 'all', label: 'همه تالارهای حراج (برگزیده)', icon: Layers, count: 6 },
  { id: 'gold', label: 'طلا و مسکوکات گرانبها', icon: Coins, count: 12 },
  { id: 'petro', label: 'فرآورده‌های پلیمری و نفت', icon: Flame, count: 8 },
  { id: 'automotive', label: 'خودرو و ناوگان سنگین', icon: Truck, count: 5 },
  { id: 'realty', label: 'املاک و اراضی دولتی', icon: Building2, count: 19 },
  { id: 'goods', label: 'ماشین‌آلات صنعتی و CNC', icon: Cpu, count: 14 },
  { id: 'agri', label: 'اقلام صادراتی و کشاورزی', icon: Wheat, count: 7 },
];

export const CategoryPills: React.FC<CategoryPillsProps> = ({
  selectedCategory,
  onSelectCategory,
  isDarkTheme = false,
}) => {
  return (
    <div className="w-full my-4">
      {/* Section Title matching Temu Explore Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="font-black text-sm sm:text-base text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <span>دسته‌بندی‌ها و تالارهای مزایده پرندو</span>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            (انتخاب جهت پالایش لحظه‌ای)
          </span>
        </h3>
        <span className="text-xs text-[#fb7701] font-bold cursor-pointer hover:underline">
          مشاهده تمام مزایدات جاری
        </span>
      </div>

      {/* Horizontal Scrolling Pill Container */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 text-xs">
        {CATEGORY_ITEMS.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-full font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer border ${
                isSelected
                  ? isDarkTheme
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-[#fb7701] text-white border-orange-600 shadow-sm'
                  : isDarkTheme
                  ? 'bg-slate-800/90 text-slate-300 border-slate-700/80 hover:bg-slate-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-2xs'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected
                    ? isDarkTheme ? 'bg-slate-950/30 text-slate-900' : 'bg-black/20 text-white'
                    : isDarkTheme ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {toPersianDigits(cat.count)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
