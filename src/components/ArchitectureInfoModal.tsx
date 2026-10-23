import React from 'react';
import { ShieldCheck, X, BookOpen, Layers, CheckCircle2, Cpu } from 'lucide-react';

interface ArchitectureInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureInfoModal: React.FC<ArchitectureInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Parando Architecture Highlights (ADR-001 &ndash; ADR-004)
              </h2>
              <p className="text-xs text-slate-400">
                Decoupled Domain Business Rules, Ports &amp; Adapters
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6 text-sm text-slate-300">
          {/* Section: ADR-001 */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
              <Layers className="w-4 h-4" />
              <span>ADR-001: Clean Core Auction Kernel &amp; Ladder</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pure domain kernel isolated from databases, network, Redis, or frameworks. The kernel takes an immutable <code>Auction</code> state and a <code>SubmitBidCommand</code>, evaluates all invariants, and returns a new immutable state.
            </p>
            <ul className="text-xs space-y-1.5 list-disc list-inside text-slate-300">
              <li><strong>Ladder Ordering:</strong> 1. Amount (descending) &rarr; 2. Timestamp (earlier wins) &rarr; 3. Sequence (deterministic tie-breaker).</li>
              <li><strong>One Position Per Bidder:</strong> Each bidder holds at most one spot on the ladder (their highest bid). Placing a higher bid supersedes their prior position.</li>
              <li><strong>Top-K Retention:</strong> Only the top $K$ positions are maintained in memory; outbid bids transition to <code>OUTBID</code> status.</li>
            </ul>
          </div>

          {/* Section: ADR-002 */}
          <div className="space-y-2 pt-4 border-t border-slate-800">
            <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>ADR-002: Financial Ledger Contract &amp; CommitmentGuard</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              The financial kernel guarantees bidder solvency without blocking the auction hot path.
            </p>
            <ul className="text-xs space-y-1.5 list-disc list-inside text-slate-300">
              <li><strong>K-INV-7:</strong> Bidder exposure must never exceed their pre-authorized guaranteed amount.</li>
              <li><strong>K-INV-14:</strong> The auction kernel never writes holds or ledger lines directly. It queries the <code>CommitmentGuard</code> port for a pre-published proof.</li>
              <li><strong>Exposure Requirement:</strong> Fixed deposit rate (default 15% / 1,500 bps) calculated with ceiling integer arithmetic.</li>
            </ul>
          </div>

          {/* Section: Invariants */}
          <div className="space-y-2 pt-4 border-t border-slate-800">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
              <Cpu className="w-4 h-4" />
              <span>Domain Invariants &amp; Determinism</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="font-mono font-bold text-slate-200 block">Integer Rial Only</span>
                <span className="text-slate-400">Floating-point currency is strictly forbidden across kernels to prevent rounding drift.</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="font-mono font-bold text-slate-200 block">Clock Port</span>
                <span className="text-slate-400">Time is injected via a <code>Clock</code> port so the auction kernel remains 100% deterministic and testable.</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="font-mono font-bold text-slate-200 block">Tenant Isolation</span>
                <span className="text-slate-400">Every bid, bidder, and proof must match the auction&apos;s <code>tenant_id</code>.</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="font-mono font-bold text-slate-200 block">Seller Conflict Prevention</span>
                <span className="text-slate-400">The auction seller is strictly prohibited from bidding on their own auction.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
          >
            Close Overview
          </button>
        </div>
      </div>
    </div>
  );
};
