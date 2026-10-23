import React from 'react';
import { MARKET_MODULES, MarketModuleConfig } from '../data/market_modules';
import { Coins, Droplets, Truck, Building2, Wheat, Cpu } from 'lucide-react';
import { toPersianDigits } from '../utils/formatters';

interface MarketSelectorProps {
  activeModuleId: string;
  onSelectModule: (module: MarketModuleConfig) => void;
}

export const MarketSelector: React.FC<MarketSelectorProps> = ({
  activeModuleId,
  onSelectModule,
}) => {
  const getIcon = (id: string) => {
    switch (id) {
      case 'gold':
        return <Coins className="w-4 h-4 text-amber-400" />;
      case 'petrochemicals':
        return <Droplets className="w-4 h-4 text-sky-400" />;
      case 'automotive':
        return <Truck className="w-4 h-4 text-red-400" />;
      case 'real_estate':
        return <Building2 className="w-4 h-4 text-emerald-400" />;
      case 'agriculture':
        return <Wheat className="w-4 h-4 text-yellow-400" />;
      case 'goods':
        return <Cpu className="w-4 h-4 text-purple-400" />;
      default:
        return <Coins className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 overflow-x-auto">
      <div className="max-w-7xl mx-auto flex items-center space-x-2 space-x-reverse">
        <span className="text-xs font-semibold text-slate-400 shrink-0 ml-2">
          ماژول‌های بازارهای ملی:
        </span>
        <div className="flex items-center space-x-2 space-x-reverse">
          {MARKET_MODULES.map((mod) => {
            const isActive = mod.id === activeModuleId;
            return (
              <button
                key={mod.id}
                onClick={() => onSelectModule(mod)}
                className={`flex items-center space-x-2 space-x-reverse px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer shrink-0 border ${
                  isActive
                    ? 'bg-slate-800 text-white border-amber-500/60 shadow-sm'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {getIcon(mod.id)}
                <span>{mod.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                  K={toPersianDigits(mod.ladderSize)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
