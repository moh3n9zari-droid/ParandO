import React from 'react';
import { Auction, AuctionStatus } from '../core/auction_kernel';
import { MarketModuleConfig } from '../data/market_modules';
import { formatDualCurrency, formatDuration } from '../utils/formatters';
import { Clock, ShieldCheck, Tag, Layers, Calendar, AlertTriangle } from 'lucide-react';

interface AuctionHeaderProps {
  auction: Auction;
  currentModule: MarketModuleConfig;
  currentTime: Date;
  onChangeStatus: (status: AuctionStatus) => void;
  onModifyLadderSize: (size: number) => void;
}

export const AuctionHeader: React.FC<AuctionHeaderProps> = ({
  auction,
  currentModule,
  currentTime,
  onChangeStatus,
  onModifyLadderSize,
}) => {
  const timeLeftMs = auction.endsAt.getTime() - currentTime.getTime();
  const timeToStartMs = auction.startsAt.getTime() - currentTime.getTime();
  const isStarted = currentTime.getTime() >= auction.startsAt.getTime();
  const isEnded = currentTime.getTime() >= auction.endsAt.getTime();

  const getStatusBadge = () => {
    switch (auction.status) {
      case AuctionStatus.ACTIVE:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            LIVE ACTIVE
          </span>
        );
      case AuctionStatus.SCHEDULED:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            SCHEDULED
          </span>
        );
      case AuctionStatus.CLOSED:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-700/50 text-slate-400 border border-slate-600 flex items-center gap-1.5">
            CLOSED
          </span>
        );
      case AuctionStatus.CANCELLED:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1.5">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-800 text-slate-300">
            {auction.status}
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Title & Descriptions */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {getStatusBadge()}
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-800 text-slate-300 border border-slate-700">
              {currentModule.badge}
            </span>
            <span className="text-xs font-mono text-slate-400">
              Auction ID: <span className="text-slate-200">{auction.auctionId}</span>
            </span>
          </div>

          <h2 className="text-xl font-bold text-white tracking-tight">
            {currentModule.defaultTitle}
          </h2>

          <p className="text-xs text-slate-400 max-w-2xl">
            {currentModule.description} &middot; <span className="text-slate-300 font-medium">Unit: {currentModule.unit}</span>
          </p>
        </div>

        {/* Right: Countdown & Time controls */}
        <div className="flex items-center space-x-4 bg-slate-950/80 border border-slate-800 rounded-xl p-3 shrink-0">
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-medium">
              {!isStarted ? 'Starts In' : isEnded ? 'Auction Status' : 'Time Remaining'}
            </span>
            <div className="text-xl font-bold font-mono text-amber-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400/80" />
              <span>
                {!isStarted
                  ? formatDuration(timeToStartMs)
                  : isEnded
                  ? 'ENDED'
                  : formatDuration(timeLeftMs)}
              </span>
            </div>
          </div>

          {/* Status Override Selector */}
          <div className="border-l border-slate-800 pl-4">
            <span className="text-[10px] text-slate-400 block mb-1">Simulate Status:</span>
            <div className="flex items-center space-x-1">
              {[AuctionStatus.ACTIVE, AuctionStatus.SCHEDULED, AuctionStatus.CLOSED].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onChangeStatus(st)}
                  className={`px-2 py-1 text-[11px] rounded font-mono transition cursor-pointer ${
                    auction.status === st
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {st.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Rules Metric Strip */}
      <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px]">Base / Starting Price</span>
          <span className="font-mono font-bold text-slate-100 text-sm">
            {formatDualCurrency(auction.rules.basePrice).rial}
          </span>
          <span className="font-mono text-[11px] text-amber-400 block">
            {formatDualCurrency(auction.rules.basePrice).toman}
          </span>
        </div>

        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px]">Minimum Increment Step</span>
          <span className="font-mono font-bold text-slate-100 text-sm">
            {formatDualCurrency(auction.rules.minIncrement).rial}
          </span>
          <span className="font-mono text-[11px] text-slate-400 block">
            {formatDualCurrency(auction.rules.minIncrement).toman}
          </span>
        </div>

        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px]">Required Exposure Deposit (15%)</span>
          <span className="font-mono font-bold text-amber-300 text-sm">
            {formatDualCurrency(auction.rules.requiredExposure).rial}
          </span>
          <span className="font-mono text-[11px] text-slate-400 block">
            {auction.rules.depositRateBps} bps rate (ADR-001)
          </span>
        </div>

        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px]">Ladder Positions (K)</span>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <span className="font-mono font-bold text-slate-100 text-sm">
              Top {auction.ladderSize}
            </span>
            <div className="flex items-center space-x-0.5">
              {[1, 3, 5, 10].map((sz) => (
                <button
                  key={sz}
                  onClick={() => onModifyLadderSize(sz)}
                  className={`w-5 h-5 rounded text-[10px] font-mono transition ${
                    auction.ladderSize === sz
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
          <span className="text-slate-400 block text-[11px]">Optimistic Version</span>
          <span className="font-mono font-bold text-sky-400 text-sm">
            v{auction.version}
          </span>
          <span className="font-mono text-[11px] text-slate-400 block">
            {auction.bidCount} bids recorded
          </span>
        </div>
      </div>
    </div>
  );
};
