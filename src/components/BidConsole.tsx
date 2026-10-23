import React, { useState } from 'react';
import { Auction, Bidder, CommitmentProof, CommitmentGuard } from '../core/auction_kernel';
import { formatDualCurrency, formatRial, formatToman } from '../utils/formatters';
import { Gavel, AlertCircle, CheckCircle, ShieldCheck, Plus, ArrowRight, UserCheck, RefreshCw, Key } from 'lucide-react';

interface BidConsoleProps {
  auction: Auction;
  bidders: Bidder[];
  activeBidder: Bidder;
  onSelectBidder: (bidder: Bidder) => void;
  guard: CommitmentGuard;
  onTopUpFunds: (bidderId: string, amount: number) => void;
  onSubmitBid: (amount: number, expectedVersion?: number | null) => void;
  lastError: string | null;
  lastSuccess: string | null;
}

export const BidConsole: React.FC<BidConsoleProps> = ({
  auction,
  bidders,
  activeBidder,
  onSelectBidder,
  guard,
  onTopUpFunds,
  onSubmitBid,
  lastError,
  lastSuccess,
}) => {
  const minNextBid = auction.minimumNextBid();
  const [amountInput, setAmountInput] = useState<string>(String(minNextBid));
  const [useExpectedVersion, setUseExpectedVersion] = useState<boolean>(false);
  const [customVersion, setCustomVersion] = useState<string>(String(auction.version));

  // Sync min next bid when highest bid changes if input was at or below previous min
  const handleSetMinBid = () => {
    setAmountInput(String(minNextBid));
  };

  const handleAddIncrement = (multiplier: number) => {
    const currentVal = parseInt(amountInput, 10) || minNextBid;
    const nextVal = currentVal + auction.rules.minIncrement * multiplier;
    setAmountInput(String(nextVal));
  };

  const proof: CommitmentProof | null = guard.getProof(activeBidder.bidderId, activeBidder.tenantId);
  const requiredExposure = auction.rules.requiredExposure;
  const hasSufficientFunds = proof && proof.guaranteedAmount >= requiredExposure;
  const isTenantMatch = activeBidder.tenantId === auction.tenantId;
  const isSeller = activeBidder.bidderId === auction.sellerId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(amountInput, 10);
    const expVer = useExpectedVersion ? parseInt(customVersion, 10) : null;
    onSubmitBid(amount, expVer);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Bid Submission Console</h3>
              <p className="text-xs text-slate-400">Pure kernel validation via SubmitBidCommand (ADR-001)</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">Next Min Bid:</span>
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              {formatDualCurrency(minNextBid).rial}
            </span>
          </div>
        </div>

        {/* Bidder Switcher & Eligibility */}
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-300 block mb-1.5 flex items-center justify-between">
            <span>Select Active Bidder (Tenant / Identity / Proof)</span>
            <span className="text-[11px] text-slate-400 font-mono">
              Seller ID: <span className="text-amber-400">{auction.sellerId}</span>
            </span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {bidders.map((b) => {
              const isSelected = b.bidderId === activeBidder.bidderId;
              const isBiddingSeller = b.bidderId === auction.sellerId;
              return (
                <button
                  key={b.bidderId}
                  type="button"
                  onClick={() => onSelectBidder(b)}
                  className={`p-2 rounded-lg text-left text-xs transition border cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500/20 text-white border-sky-500/60 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-semibold">
                    <span>{b.bidderId}</span>
                    {isBiddingSeller && (
                      <span className="text-[10px] text-red-400 font-normal">SELLER</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    Tenant: {b.tenantId}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Bidder Commitment Guard Proof Status */}
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>ADR-002 Financial Proof:</span>
              </span>
              <span className="font-mono text-slate-300">
                Tenant: <span className={isTenantMatch ? 'text-emerald-400' : 'text-red-400'}>{activeBidder.tenantId}</span>
                {!isTenantMatch && ' (Mismatch!)'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Guaranteed Amount:</span>
              <span className={`font-bold ${hasSufficientFunds ? 'text-emerald-400' : 'text-red-400'}`}>
                {proof ? formatDualCurrency(proof.guaranteedAmount).rial : 'No Proof (0 IRR)'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Required Exposure (15%):</span>
              <span className="text-amber-400 font-semibold">{formatDualCurrency(requiredExposure).rial}</span>
            </div>

            {/* Quick Top-up Button if insufficient funds */}
            {!hasSufficientFunds && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-amber-400/90 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Exposure exceeds guaranteed funds
                </span>
                <button
                  type="button"
                  onClick={() => onTopUpFunds(activeBidder.bidderId, requiredExposure * 2)}
                  className="px-2.5 py-1 text-[11px] rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Plus className="w-3 h-3" /> Pre-authorize Funds
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Amount Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="bid-amount-input" className="text-xs font-medium text-slate-300">
                Bid Amount (Rial - Integer Unit)
              </label>
              <div className="text-xs font-mono text-amber-400/90">
                {parseInt(amountInput, 10) ? formatDualCurrency(parseInt(amountInput, 10)).toman : ''}
              </div>
            </div>

            <div className="relative">
              <input
                id="bid-amount-input"
                type="number"
                step="1"
                min="1"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 font-mono text-base font-semibold text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                placeholder="Enter amount in Rial..."
              />
              <span className="absolute right-3.5 top-3 text-xs font-mono text-slate-500">
                IRR
              </span>
            </div>
          </div>

          {/* Quick Increment buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleSetMinBid}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-mono transition cursor-pointer border border-slate-700"
            >
              Exact Minimum
            </button>
            <button
              type="button"
              onClick={() => handleAddIncrement(1)}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-mono transition cursor-pointer border border-slate-700"
            >
              +1 Step ({formatRial(auction.rules.minIncrement)})
            </button>
            <button
              type="button"
              onClick={() => handleAddIncrement(2)}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-mono transition cursor-pointer border border-slate-700"
            >
              +2 Steps
            </button>
            <button
              type="button"
              onClick={() => handleAddIncrement(5)}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-mono transition cursor-pointer border border-slate-700"
            >
              +5 Steps
            </button>
          </div>

          {/* Concurrency Token Check */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <label className="flex items-center space-x-2 text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={useExpectedVersion}
                onChange={(e) => setUseExpectedVersion(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
              />
              <span>Optimistic Concurrency Lock</span>
            </label>
            {useExpectedVersion && (
              <div className="flex items-center space-x-1.5 font-mono">
                <span className="text-slate-500">Exp. Ver:</span>
                <input
                  type="number"
                  value={customVersion}
                  onChange={(e) => setCustomVersion(e.target.value)}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-center font-mono text-white"
                />
                <button
                  type="button"
                  onClick={() => setCustomVersion(String(auction.version))}
                  title="Sync with current auction version"
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Feedback messages */}
          {lastError && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex items-start space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block font-mono">KERNEL REJECTED:</span>
                <span className="text-red-300">{lastError}</span>
              </div>
            </div>
          )}

          {lastSuccess && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-start space-x-2 animate-in fade-in">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block font-mono">BID ACCEPTED:</span>
                <span className="text-emerald-300">{lastSuccess}</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm tracking-wide bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-[0.99] transition cursor-pointer flex items-center justify-center space-x-2"
          >
            <Gavel className="w-4 h-4" />
            <span>SUBMIT BID &middot; {formatDualCurrency(parseInt(amountInput, 10) || minNextBid).rial}</span>
          </button>
        </form>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between font-mono">
        <span>Current Version: v{auction.version}</span>
        <span>Total Bids Placed: {auction.bidCount}</span>
      </div>
    </div>
  );
};
