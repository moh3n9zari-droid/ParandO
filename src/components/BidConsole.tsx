import React, { useState } from 'react';
import { Competition, Offerer, CommitmentProof, CommitmentGuard } from '../core/competition_kernel';
import { formatDualCurrency, formatRial, toPersianDigits } from '../utils/formatters';
import { Gavel, AlertCircle, CheckCircle, ShieldCheck, Plus, RefreshCw, WifiOff } from 'lucide-react';

interface BidConsoleProps {
  competition: Competition;
  offerers: Offerer[];
  activeOfferer: Offerer;
  onSelectOfferer: (offerer: Offerer) => void;
  guard: CommitmentGuard;
  onTopUpFunds: (offererId: string, amount: number) => void;
  onSubmitOffer: (amount: number, customIdempotencyKey?: string, expectedVersion?: number | null) => void;
  lastError: string | null;
  lastSuccess: string | null;
  isOnline: boolean;
}

export const BidConsole: React.FC<BidConsoleProps> = ({
  competition,
  offerers,
  activeOfferer,
  onSelectOfferer,
  guard,
  onTopUpFunds,
  onSubmitOffer,
  lastError,
  lastSuccess,
  isOnline,
}) => {
  const minNextOffer = competition.minimumNextOffer();
  const [amountInput, setAmountInput] = useState<string>(String(minNextOffer));
  const [useExpectedVersion, setUseExpectedVersion] = useState<boolean>(false);
  const [customVersion, setCustomVersion] = useState<string>(String(competition.version));

  // TR-12 Idempotency test controls
  const [customIdemKey, setCustomIdemKey] = useState<string>('');
  const [isFixedKey, setIsFixedKey] = useState<boolean>(false);

  const handleSetMinOffer = () => {
    setAmountInput(String(minNextOffer));
  };

  const handleAddIncrement = (multiplier: number) => {
    const currentVal = parseInt(amountInput, 10) || minNextOffer;
    const nextVal = currentVal + competition.rules.minIncrement * multiplier;
    setAmountInput(String(nextVal));
  };

  const proof: CommitmentProof | null = guard.getProof(activeOfferer.offererId, activeOfferer.tenantId);
  const requiredExposure = competition.rules.requiredExposure;
  const hasSufficientFunds = proof && proof.guaranteedAmount >= requiredExposure;
  const isTenantMatch = activeOfferer.tenantId === competition.tenantId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(amountInput, 10);
    const expVer = useExpectedVersion ? parseInt(customVersion, 10) : null;
    const keyToSend = isFixedKey && customIdemKey ? customIdemKey : undefined;
    onSubmitOffer(amount, keyToSend, expVer);
  };

  const handleGenerateIdemKey = () => {
    const newKey = `idem-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    setCustomIdemKey(newKey);
    setIsFixedKey(true);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between text-right">
      <div>
        {/* Header (TR-01 ADR-001) */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5 space-x-reverse">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">کنسول ثبت پیشنهاد قیمت رسمی</h3>
              <p className="text-xs text-slate-400">انطباق با TR-01 &middot; پروتکل تکرارپذیری TR-12 &middot; توالی TR-13</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="text-xs text-slate-400">حداقل مجاز بعدی:</span>
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              {formatDualCurrency(minNextOffer).rial}
            </span>
          </div>
        </div>

        {/* Offerer Switcher & Eligibility */}
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-300 block mb-1.5 flex items-center justify-between">
            <span>انتخاب متقاضی فعال (احراز هویت و تضمین مالی)</span>
            <span className="text-[11px] text-slate-400 font-mono">
              شناسه فروشنده: <span className="text-amber-400">{competition.sellerId}</span>
            </span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {offerers.map((o) => {
              const isSelected = o.offererId === activeOfferer.offererId;
              const isOfferingSeller = o.offererId === competition.sellerId;
              return (
                <button
                  key={o.offererId}
                  type="button"
                  onClick={() => onSelectOfferer(o)}
                  className={`p-2 rounded-lg text-right text-xs transition border cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500/20 text-white border-sky-500/60 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-semibold">
                    <span>{o.offererId}</span>
                    {isOfferingSeller && (
                      <span className="text-[10px] text-red-400 font-normal">فروشنده</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    مستأجر: {o.tenantId}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Offerer Commitment Guard Proof Status */}
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>گواهی تضمین مالی ADR-002:</span>
              </span>
              <span className="font-mono text-slate-300">
                مستأجر: <span className={isTenantMatch ? 'text-emerald-400' : 'text-red-400'}>{activeOfferer.tenantId}</span>
                {!isTenantMatch && ' (عدم تطابق مستأجر!)'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">موجودی تضمین‌شده در خزانه:</span>
              <span className={`font-bold ${hasSufficientFunds ? 'text-emerald-400' : 'text-red-400'}`}>
                {proof ? formatDualCurrency(proof.guaranteedAmount).rial : 'فاقد گواهی اعتبار (۰ ریال)'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">سپرده تعهد الزامی (۱۵٪):</span>
              <span className="text-amber-400 font-semibold">{formatDualCurrency(requiredExposure).rial}</span>
            </div>

            {!hasSufficientFunds && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-amber-400/90 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> تعهد الزامی از سقف موجودی تضمین‌شده فراتر است
                </span>
                <button
                  type="button"
                  onClick={() => onTopUpFunds(activeOfferer.offererId, requiredExposure * 2)}
                  className="px-2.5 py-1 text-[11px] rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Plus className="w-3 h-3" /> افزایش اعتبار تضمین
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Amount Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="offer-amount-input" className="text-xs font-medium text-slate-300">
                مبلغ پیشنهادی (واحد رسمی ریال)
              </label>
              <div className="text-xs font-mono text-amber-400/90">
                {parseInt(amountInput, 10) ? formatDualCurrency(parseInt(amountInput, 10)).toman : ''}
              </div>
            </div>

            <div className="relative">
              <input
                id="offer-amount-input"
                type="number"
                step="1"
                min="1"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 font-mono text-base font-semibold text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-left"
                placeholder="مبلغ به ریال..."
              />
              <span className="absolute left-3.5 top-3 text-xs font-mono text-slate-500">
                IRR
              </span>
            </div>
          </div>

          {/* Quick Increment buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleSetMinOffer}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-mono transition cursor-pointer border border-slate-700"
            >
              دقیقاً حداقل مجاز
            </button>
            <button
              type="button"
              onClick={() => handleAddIncrement(1)}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-mono transition cursor-pointer border border-slate-700"
            >
              +۱ گام ({formatRial(competition.rules.minIncrement)})
            </button>
            <button
              type="button"
              onClick={() => handleAddIncrement(2)}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-mono transition cursor-pointer border border-slate-700"
            >
              +۲ گام
            </button>
            <button
              type="button"
              onClick={() => handleAddIncrement(5)}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 font-mono transition cursor-pointer border border-slate-700"
            >
              +۵ گام
            </button>
          </div>

          {/* TR-12: Idempotency Key Tester Section */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center space-x-2 space-x-reverse text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFixedKey}
                  onChange={(e) => {
                    setIsFixedKey(e.target.checked);
                    if (e.target.checked && !customIdemKey) {
                      handleGenerateIdemKey();
                    }
                  }}
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span className="font-semibold text-amber-300">شناسه اختصاصی تکرارپذیری (TR-12)</span>
              </label>
              {isFixedKey && (
                <button
                  type="button"
                  onClick={handleGenerateIdemKey}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> شناسه جدید
                </button>
              )}
            </div>

            {isFixedKey && (
              <div className="p-2.5 rounded-lg bg-slate-950 border border-amber-500/30 text-xs">
                <input
                  type="text"
                  value={customIdemKey}
                  onChange={(e) => setCustomIdemKey(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-amber-300 focus:outline-none text-left"
                  placeholder="مثال: idem-test-123"
                />
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  راهنمای آزمون: ارسال مجدد با مبلغ یکسان حالت <strong>Replay (تکرار امن)</strong> را فعال می‌کند. تغییر مبلغ با همین شناسه خطای <strong>Conflict (تعارض TR-12)</strong> را صادر می‌کند.
                </p>
              </div>
            )}
          </div>

          {/* Concurrency Token Check */}
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center space-x-2 space-x-reverse text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={useExpectedVersion}
                onChange={(e) => setUseExpectedVersion(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
              />
              <span>قفل همزمانی خوش‌بینانه نسخه</span>
            </label>
            {useExpectedVersion && (
              <div className="flex items-center space-x-1.5 space-x-reverse font-mono">
                <span className="text-slate-500">نسخه مدنظر:</span>
                <input
                  type="number"
                  value={customVersion}
                  onChange={(e) => setCustomVersion(e.target.value)}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-center font-mono text-white"
                />
                <button
                  type="button"
                  onClick={() => setCustomVersion(String(competition.version))}
                  title="همگام‌سازی با آخرین نسخه مزایده"
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Offline / Network Disruption Alert Banner */}
          {!isOnline && (
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start space-x-2 space-x-reverse">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">حالت پایداری در شبکه ملی فعال است:</span>
                <span className="text-amber-300 leading-relaxed">
                  ارتباط با سرور مرکزی قطع است. در صورت ثبت پیشنهاد، اطلاعات با حفظ شناسه یکتا در صف امن محلی نگهداری شده و به محض بازیابی ارتباط ارسال خواهد شد.
                </span>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {lastError && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex items-start space-x-2 space-x-reverse animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">خطای رد از سوی هسته مزایده:</span>
                <span className="text-red-300 font-mono">{lastError}</span>
              </div>
            </div>
          )}

          {lastSuccess && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-start space-x-2 space-x-reverse animate-in fade-in">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">نتیجه عملیات:</span>
                <span className="text-emerald-300 leading-relaxed">{lastSuccess}</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm tracking-wide bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-[0.99] transition cursor-pointer flex items-center justify-center space-x-2 space-x-reverse"
          >
            <Gavel className="w-4 h-4" />
            <span>ثبت رسمی پیشنهاد قیمت &middot; {formatDualCurrency(parseInt(amountInput, 10) || minNextOffer).rial}</span>
          </button>
        </form>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between font-mono">
        <span>نسخه رقابت: v{toPersianDigits(competition.version)}</span>
        <span>کل پیشنهادات پذیرفته‌شده: {toPersianDigits(competition.offerCount)}</span>
      </div>
    </div>
  );
};
