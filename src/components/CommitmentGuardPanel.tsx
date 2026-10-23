import React from 'react';
import { CommitmentProof, CompetitionRules } from '../core/competition_kernel';
import { formatDualCurrency } from '../utils/formatters';
import { Shield, Plus, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CommitmentGuardPanelProps {
  proofs: CommitmentProof[];
  rules: CompetitionRules;
  currentTime: Date;
  onTopUp: (offererId: string, amount: number) => void;
  onExpireProof: (offererId: string) => void;
  onRestoreProof: (offererId: string) => void;
}

export const CommitmentGuardPanel: React.FC<CommitmentGuardPanelProps> = ({
  proofs,
  rules,
  currentTime,
  onTopUp,
  onExpireProof,
  onRestoreProof,
}) => {
  const requiredExposure = rules.requiredExposure;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">ADR-002 Financial Commitment Guard</h3>
            <p className="text-xs text-slate-400">Pre-authorized proofs &middot; Exposure &le; Guaranteed Funds</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-400 block">Required Exposure (15%)</span>
          <span className="text-xs font-mono font-bold text-amber-400">
            {formatDualCurrency(requiredExposure).rial}
          </span>
        </div>
      </div>

      {/* Proof Table */}
      <div className="flex-1 overflow-y-auto mt-3 space-y-2.5">
        {proofs.map((proof) => {
          const offererId = proof.offererId || proof.bidderId || '';
          const isExpired = proof.validUntil.getTime() <= currentTime.getTime();
          const hasSufficient = proof.guaranteedAmount >= requiredExposure;
          const isValid = !isExpired && hasSufficient;

          return (
            <div
              key={offererId}
              className={`p-3 rounded-lg border text-xs font-mono transition ${
                isValid
                  ? 'bg-slate-950/60 border-slate-800'
                  : 'bg-red-950/20 border-red-900/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white text-sm">{offererId}</span>
                  <span className="text-slate-400 text-[11px]">Tenant: {proof.tenantId}</span>
                </div>

                <div className="flex items-center space-x-1.5">
                  {isValid ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      GUARANTEED
                    </span>
                  ) : isExpired ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-red-400" />
                      EXPIRED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                      INSUFFICIENT
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-slate-300">
                <div>
                  <span className="text-[10px] text-slate-500 block">Guaranteed Amount:</span>
                  <span className={`font-semibold ${hasSufficient ? 'text-slate-100' : 'text-red-400'}`}>
                    {formatDualCurrency(proof.guaranteedAmount).rial}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Valid Until:</span>
                  <span className={isExpired ? 'text-red-400' : 'text-slate-300'}>
                    {proof.validUntil.toLocaleTimeString()} UTC
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-end space-x-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => onTopUp(offererId, requiredExposure * 2)}
                  className="px-2 py-1 rounded bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 transition cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3 text-emerald-400" />
                  Top-up
                </button>
                {isExpired ? (
                  <button
                    type="button"
                    onClick={() => onRestoreProof(offererId)}
                    className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition cursor-pointer"
                  >
                    Extend +1h
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onExpireProof(offererId)}
                    className="px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20 transition cursor-pointer"
                  >
                    Expire Now
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invariants Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
        <p className="flex items-center gap-1">
          <span className="font-mono text-amber-400 font-bold">K-INV-7:</span>
          <span>Offerer exposure must never exceed the guaranteed amount.</span>
        </p>
        <p className="flex items-center gap-1">
          <span className="font-mono text-sky-400 font-bold">K-INV-14:</span>
          <span>Kernel never writes holds or external I/O (fast non-blocking read port).</span>
        </p>
      </div>
    </div>
  );
};
