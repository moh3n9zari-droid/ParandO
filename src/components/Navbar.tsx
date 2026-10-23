import React from 'react';
import { Play, Pause, FastForward, RotateCcw, CheckCircle2, ShieldCheck, Flame } from 'lucide-react';
import { MarketModuleConfig } from '../data/market_modules';
import { formatTimestamp } from '../utils/formatters';

interface NavbarProps {
  currentModule: MarketModuleConfig;
  currentTime: Date;
  isClockRunning: boolean;
  onToggleClock: () => void;
  onAdvanceTime: (seconds: number) => void;
  onResetTime: () => void;
  onOpenTests: () => void;
  onOpenDocs: () => void;
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
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Market */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black tracking-tight text-xl">
              P
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-white tracking-wide">PARANDO</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                  ADR-001 KERNEL
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tenant: <span className="text-slate-200 font-mono">{currentModule.tenantId}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Deterministic Clock Port Controls */}
        <div className="flex items-center space-x-3 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5">
          <div className="flex items-center space-x-2 pr-2 border-r border-slate-800">
            <div className={`w-2 h-2 rounded-full ${isClockRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-xs font-mono font-medium text-slate-300">
              {formatTimestamp(currentTime)} UTC
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={onToggleClock}
              title={isClockRunning ? 'Pause Clock' : 'Start Clock'}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              {isClockRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-emerald-400" />}
            </button>
            <button
              onClick={() => onAdvanceTime(60)}
              title="Fast Forward 1 Minute"
              className="px-1.5 py-1 text-xs rounded text-slate-300 hover:text-white hover:bg-slate-800 font-mono transition flex items-center gap-0.5"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>+1m</span>
            </button>
            <button
              onClick={() => onAdvanceTime(900)}
              title="Fast Forward 15 Minutes"
              className="px-1.5 py-1 text-xs rounded text-slate-300 hover:text-white hover:bg-slate-800 font-mono transition"
            >
              +15m
            </button>
            <button
              onClick={onResetTime}
              title="Reset Clock to Auction Start"
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Action Buttons: Verification Tests & Specs */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenTests}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition cursor-pointer shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Core Suite Tests</span>
          </button>
          <button
            onClick={onOpenDocs}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Architecture (ADR)</span>
          </button>
        </div>
      </div>
    </header>
  );
};
