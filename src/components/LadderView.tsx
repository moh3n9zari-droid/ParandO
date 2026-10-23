import React from 'react';
import { Auction } from '../core/auction_kernel';
import { formatDualCurrency, formatTimestamp } from '../utils/formatters';
import { Trophy, TrendingUp, ShieldAlert, Award, ArrowUpRight } from 'lucide-react';

interface LadderViewProps {
  auction: Auction;
  activeBidderId: string;
}

export const LadderView: React.FC<LadderViewProps> = ({ auction, activeBidderId }) => {
  const ladder = auction.ladder;
  const k = auction.ladderSize;
  const isFull = ladder.length >= k;
  const leader = ladder.length > 0 ? ladder[0] : null;
  const threshold = isFull ? ladder[ladder.length - 1].amount : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              Auction Ladder
              <span className="text-xs px-2 py-0.5 rounded font-mono font-normal bg-slate-800 text-slate-300 border border-slate-700">
                Top {k} Ranked (K={k})
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Deterministic ordering: Amount ↓ &middot; Timestamp ↑ &middot; Sequence ↑
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-400 block">Positions Filled</span>
          <span className="text-sm font-bold font-mono text-slate-200">
            {ladder.length} / {k}
          </span>
        </div>
      </div>

      {/* Threshold banner */}
      <div className="my-3 py-2 px-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5 text-slate-400">
          <span>Ladder Entry Threshold:</span>
        </div>
        <div className="font-mono text-slate-200 font-medium">
          {threshold !== null ? (
            <span className="text-amber-300">
              &gt; {formatDualCurrency(threshold).rial} ({formatDualCurrency(threshold).toman})
            </span>
          ) : (
            <span className="text-emerald-400">
              Open ({ladder.length < k ? `${k - ladder.length} slots free` : 'Base price entry'})
            </span>
          )}
        </div>
      </div>

      {/* Ladder list */}
      <div className="flex-1 space-y-2.5 overflow-y-auto">
        {ladder.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-lg bg-slate-950/30">
            <Trophy className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-300">Ladder Empty</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              No bids have been placed yet. Submit the first bid at or above base price (
              {formatDualCurrency(auction.rules.basePrice).rial}) to claim Rank #1.
            </p>
          </div>
        ) : (
          ladder.map((bid, index) => {
            const rank = index + 1;
            const isLeader = rank === 1;
            const isCurrentBidder = bid.bidderId === activeBidderId;
            const dual = formatDualCurrency(bid.amount);
            const deltaLeader = leader && !isLeader ? leader.amount - bid.amount : 0;

            return (
              <div
                key={bid.bidId}
                className={`relative rounded-xl p-3.5 border transition-all ${
                  isLeader
                    ? 'bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/40 shadow-sm'
                    : isCurrentBidder
                    ? 'bg-slate-800/80 border-sky-500/40'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Left: Rank & Bidder */}
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 shadow-inner ${
                        isLeader
                          ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-amber-500/20'
                          : rank === 2
                          ? 'bg-slate-700 text-slate-200 border border-slate-600'
                          : rank === 3
                          ? 'bg-amber-900/60 text-amber-200 border border-amber-800/60'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isLeader ? <Award className="w-5 h-5" /> : `#${rank}`}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-semibold text-sm text-white">
                          {bid.bidderId}
                        </span>
                        {isCurrentBidder && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium">
                            YOU
                          </span>
                        )}
                        {isLeader && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold tracking-wide flex items-center gap-0.5">
                            LEADER
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center space-x-2">
                        <span>Seq #{bid.sequence}</span>
                        <span>&middot;</span>
                        <span>{formatTimestamp(bid.placedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Amounts */}
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-slate-100">
                      {dual.rial}
                    </div>
                    <div className="text-xs text-amber-400/90 font-mono">
                      {dual.toman}
                    </div>
                    {!isLeader && deltaLeader > 0 && (
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        -{formatDualCurrency(deltaLeader).rial}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer metadata */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>ID: {bid.bidId}</span>
                  <span className="text-emerald-400/80 font-medium">Status: RANKED</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footnote on Single-Bidder-Per-Ladder Rule */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>Each bidder holds at most one ladder position (their highest bid). Lower bids are superseded.</span>
      </div>
    </div>
  );
};
