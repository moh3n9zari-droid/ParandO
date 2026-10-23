import React from 'react';
import { Play, Pause, FastForward, RotateCcw, CheckCircle2, ShieldCheck, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { MarketModuleConfig } from '../data/market_modules';
import { formatTimestamp, toPersianDigits } from '../utils/formatters';

interface NavbarProps {
  currentModule: MarketModuleConfig;
  currentTime: Date;
  isClockRunning: boolean;
  onToggleClock: () => void;
  onAdvanceTime: (seconds: number) => void;
  onResetTime: () => void;
  onOpenTests: () => void;
  onOpenDocs: () => void;
  isOnline: boolean;
  isSimulatingDisruption: boolean;
  onToggleDisruption: () => void;
  pendingQueueCount: number;
  onOpenQueueModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentModule,
  currentTime,
  isClockRunning,
  onToggleClock,
  onAdvanceTime,
  onResetTime,
  onOpenTests,
  onOpenDocs,
  isOnline,
  isSimulatingDisruption,
  onToggleDisruption,
  pendingQueueCount,
  onOpenQueueModal,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Market */}
        <div className="flex items-center space-x-4 space-x-reverse">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black tracking-tight text-xl">
              پ
            </div>
            <div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <span className="font-extrabold text-base sm:text-lg text-white tracking-normal">
                  سامانه حراج ملی پاراندو
                </span>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                  هسته ADR-001
                </span>
              </div>
              <p className="text-xs text-slate-400">
                مستأجر بورس: <span className="text-slate-200 font-mono">{currentModule.tenantId}</span>
              </p>
            </div>
          </div>
        </div>

        {/* National Network Status & Clock Controls */}
        <div className="hidden md:flex items-center space-x-3 space-x-reverse">
          {/* National Network Resilience Status */}
          <div className="flex items-center space-x-2 space-x-reverse bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <button
              onClick={onToggleDisruption}
              title={isSimulatingDisruption ? 'پایان شبیه‌سازی و اتصال مجدد به شبکه ملی' : 'شبیه‌سازی قطعی/نوسان در شبکه ملی'}
              className={`flex items-center space-x-1.5 space-x-reverse px-2 py-0.5 rounded transition cursor-pointer font-medium ${
                isOnline
                  ? 'text-emerald-400 hover:bg-emerald-950/30'
                  : 'text-amber-400 bg-amber-950/40 animate-pulse'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>شبکه ملی: متصل و پایدار</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  <span>اختلال شبکه ملی (آفلاین)</span>
                </>
              )}
            </button>

            {pendingQueueCount > 0 && (
              <button
                onClick={onOpenQueueModal}
                className="px-2 py-0.5 text-[11px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{toPersianDigits(pendingQueueCount)} در صف همگام‌سازی</span>
              </button>
            )}
          </div>

          {/* Deterministic Clock Port Controls */}
          <div className="flex items-center space-x-2 space-x-reverse bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5">
            <div className="flex items-center space-x-2 space-x-reverse pl-2 border-l border-slate-800">
              <div className={`w-2 h-2 rounded-full ${isClockRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-xs font-mono font-medium text-slate-300">
                {formatTimestamp(currentTime)}
              </span>
            </div>

            <div className="flex items-center space-x-1 space-x-reverse">
              <button
                onClick={onToggleClock}
                title={isClockRunning ? 'توقف ساعت شبیه‌سازی' : 'شروع ساعت'}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                {isClockRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
              <button
                onClick={() => onAdvanceTime(60)}
                title="جلو بردن زمان به میزان ۱ دقیقه"
                className="px-1.5 py-0.5 text-xs rounded text-slate-300 hover:text-white hover:bg-slate-800 font-mono transition cursor-pointer"
              >
                +۱ دقیقه
              </button>
              <button
                onClick={() => onAdvanceTime(900)}
                title="جلو بردن زمان به میزان ۱۵ دقیقه"
                className="px-1.5 py-0.5 text-xs rounded text-slate-300 hover:text-white hover:bg-slate-800 font-mono transition cursor-pointer"
              >
                +۱۵ دقیقه
              </button>
              <button
                onClick={onResetTime}
                title="بازنشانی ساعت به آغاز مزایده"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons: Verification Tests & Specs */}
        <div className="flex items-center space-x-2 space-x-reverse">
          <button
            onClick={onOpenTests}
            className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition cursor-pointer shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>آزمون‌های هسته و API</span>
          </button>
          <button
            onClick={onOpenDocs}
            className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>مستندات معماری ADR</span>
          </button>
        </div>
      </div>
    </header>
  );
};
