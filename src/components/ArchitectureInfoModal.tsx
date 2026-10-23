import React from 'react';
import { BookOpen, Layers, ShieldCheck, Cpu, X, CheckCircle2 } from 'lucide-react';

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
                Parando Architecture &amp; Core Kernel Conformance (Slice 1)
              </h2>
              <p className="text-xs text-slate-400">
                ADR-001 &ndash; ADR-004 &middot; TR-01, TR-12, TR-13 Specifications
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
          {/* TR-01 Vocabulary Conformance */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
              <Layers className="w-4 h-4" />
              <span>TR-01: ADR-001 Vocabulary Conformance</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              All domain entities are strictly aligned with ADR-001 domain terminology:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block">Competition &larr; Auction</span>
                <span className="text-emerald-400">Competition, CompetitionRules, CompetitionStatus</span>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block">Offer &larr; Bid</span>
                <span className="text-emerald-400">Offer, Offerer, LadderOffer, SubmitOfferCommand</span>
              </div>
            </div>
          </div>

          {/* TR-13 Sequence Tie-Breaking */}
          <div className="space-y-2 pt-4 border-t border-slate-800">
            <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm">
              <Cpu className="w-4 h-4" />
              <span>TR-13: Equality &amp; Deterministic Tie-Breaking</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              When multiple offers carry equal amounts, ranking is resolved strictly by <strong>Offer Sequence Number</strong> (lower/earlier sequence number wins) rather than system clock timestamp. This ensures 100% determinism independent of server clocks or network latency.
            </p>
          </div>

          {/* TR-12 Idempotency Behavior */}
          <div className="space-y-2 pt-4 border-t border-slate-800">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>TR-12: Idempotent Replay vs. Conflict Behavior</span>
            </div>
            <ul className="text-xs space-y-1.5 list-disc list-inside text-slate-300">
              <li><strong>Identical Payload:</strong> If a command with an existing <code>idempotency_key</code> matches the previous payload (same competition, offerer, amount, and offer ID), the kernel safely replays the previous <code>SubmitOfferResult</code> without re-executing or altering ladder state.</li>
              <li><strong>Conflicting Payload:</strong> If the same <code>idempotency_key</code> is reused with altered payload attributes (e.g., different amount or different offerer), the kernel rejects the request with a strict <code>OFFER_CONFLICT</code> error.</li>
            </ul>
          </div>

          {/* Invariants */}
          <div className="space-y-2 pt-4 border-t border-slate-800">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Domain Invariants (ADR-002 &amp; ADR-004)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="font-mono font-bold text-slate-200 block">K-INV-7 (Exposure Cap)</span>
                <span className="text-slate-400">Offerer exposure must never exceed the guaranteed proof amount.</span>
              </div>
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="font-mono font-bold text-slate-200 block">K-INV-14 (Pure Port)</span>
                <span className="text-slate-400">Kernel never writes holds directly; queries the CommitmentGuard port.</span>
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
