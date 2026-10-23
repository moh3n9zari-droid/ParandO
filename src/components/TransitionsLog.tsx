import React from 'react';
import { StatusTransition, RankChange, LadderBidStatus } from '../core/auction_ladder';
import { Activity, ArrowDownRight, ArrowUpRight, CheckCircle2, History } from 'lucide-react';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  bidId: string;
  bidderId: string;
  amount: number;
  type: 'ACCEPTED' | 'REJECTED';
  reason?: string;
  rank?: number | null;
  transitions: readonly StatusTransition[];
  rankChanges: readonly RankChange[];
}

interface TransitionsLogProps {
  events: AuditEvent[];
  onClear: () => void;
}

export const TransitionsLog: React.FC<TransitionsLogProps> = ({ events, onClear }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Kernel Event &amp; Transition Audit</h3>
            <p className="text-xs text-slate-400">Stream of OUTBID, SUPERSEDED &amp; Rank changes</p>
          </div>
        </div>

        {events.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-slate-400 hover:text-slate-200 transition font-mono"
          >
            Clear Log
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 max-h-[360px] pr-1">
        {events.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-lg bg-slate-950/20">
            <History className="w-6 h-6 text-slate-600 mb-2" />
            <p className="text-xs text-slate-400">No transitions recorded yet.</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Submit bids to see real-time ladder ranking, outbid notifications, and superseding events.
            </p>
          </div>
        ) : (
          events.map((evt) => (
            <div
              key={evt.id}
              className={`p-3 rounded-lg border text-xs font-mono transition ${
                evt.type === 'ACCEPTED'
                  ? 'bg-slate-950/70 border-slate-800'
                  : 'bg-red-950/20 border-red-900/40 text-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded font-bold uppercase ${
                      evt.type === 'ACCEPTED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {evt.type === 'ACCEPTED' ? `RANK #${evt.rank}` : 'REJECTED'}
                  </span>
                  <span className="font-semibold text-slate-200">{evt.bidderId}</span>
                  <span className="text-slate-500 text-[11px]">({evt.bidId})</span>
                </div>
                <span className="text-slate-500 text-[10px]">
                  {evt.timestamp.toLocaleTimeString()}
                </span>
              </div>

              {evt.type === 'ACCEPTED' && (
                <div className="mt-1 text-slate-300 font-sans">
                  Placed bid of <span className="font-mono font-semibold text-white">{new Intl.NumberFormat().format(evt.amount)} IRR</span>
                </div>
              )}

              {evt.reason && evt.type === 'REJECTED' && (
                <div className="mt-1 text-red-300 font-sans text-[11px]">
                  Reason: <span className="font-mono">{evt.reason}</span>
                </div>
              )}

              {/* Status transitions (e.g. OUTBID, SUPERSEDED) */}
              {evt.transitions.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-slate-800/80 space-y-1">
                  {evt.transitions.map((t, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center space-x-1.5 text-[11px] ${
                        t.newStatus === LadderBidStatus.OUTBID
                          ? 'text-amber-400'
                          : t.newStatus === LadderBidStatus.SUPERSEDED
                          ? 'text-sky-400'
                          : 'text-slate-400'
                      }`}
                    >
                      <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <strong className="uppercase">{t.newStatus}</strong>: Bid {t.bidId} ({t.bidderId})
                        {t.previousRank ? ` from Rank #${t.previousRank}` : ''} &middot; {t.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Rank changes */}
              {evt.rankChanges.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 space-y-0.5 text-[11px] text-slate-400">
                  {evt.rankChanges.map((rc, idx) => (
                    <div key={idx} className="flex items-center space-x-1">
                      <ArrowUpRight className="w-3 h-3 text-slate-500" />
                      <span>
                        {rc.bidderId} ({rc.bidId}): Rank {rc.oldRank ? `#${rc.oldRank}` : 'New'} &rarr; #{rc.newRank}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
