import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Percent,
  CheckCircle2,
  Lock,
  RotateCcw,
  Scale,
  Sparkles,
} from 'lucide-react';
import { MarketModuleConfig } from '../data/market_modules';
import { Offerer, CommitmentProof, Offer } from '../core/competition_kernel';
import { formatDualCurrency, toPersianDigits } from '../utils/formatters';

export interface QuickBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: MarketModuleConfig;
  highestOffer?: Offer | null;
  activeOfferer: Offerer;
  activeProof?: CommitmentProof | null;
  onSubmitOffer: (amount: number, idempotencyKey?: string) => void;
  isDarkTheme?: boolean;
  isOnline: boolean;
}

export const QuickBidModal: React.FC<QuickBidModalProps> = ({
  isOpen,
  onClose,
  module,
  highestOffer,
  activeOfferer,
  activeProof,
  onSubmitOffer,
  isDarkTheme = false,
  isOnline,
}) => {
  // Compute minimum acceptable offer
  const minValidAmount = highestOffer
    ? highestOffer.amount + module.minIncrement
    : module.basePrice;

  const [bidAmount, setBidAmount] = useState<number>(minValidAmount);
  const [customKey, setCustomKey] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isProxyBidActive, setIsProxyBidActive] = useState<boolean>(false);

  useEffect(() => {
    setBidAmount(minValidAmount);
  }, [minValidAmount, isOpen]);

  if (!isOpen) return null;

  // Financial calculations (K-INV-7, ADR-002, ADR-003)
  const depositRateBps = module.depositRateBps; // 1500 = 15%
  const requiredExposure = Math.ceil((bidAmount * depositRateBps) / 10000); // 15% deposit hold

  const commissionBps = 50; // 50 bps = 0.50%
  const platformCommission = Math.floor((bidAmount * commissionBps) / 10000);
  const vatAmount = Math.floor((platformCommission * 10) / 100); // 10% VAT on platform commission
  const totalFees = platformCommission + vatAmount;

  // Solvency check against Commitment Guard
  const guaranteedAmount = activeProof?.guaranteedAmount || 0;
  const isSolvent = guaranteedAmount >= requiredExposure;
  const isProofValid = activeProof ? activeProof.validUntil.getTime() > Date.now() : false;
  const canSubmit = isSolvent && isProofValid && bidAmount >= minValidAmount;

  const handleStepAdd = (multiplier: number) => {
    setBidAmount((prev) => Math.max(minValidAmount, prev + module.minIncrement * multiplier));
  };

  const handleResetToMin = () => {
    setBidAmount(minValidAmount);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      onSubmitOffer(bidAmount, customKey.trim() || undefined);
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 350);
    } catch {
      setIsSubmitting(false);
    }
  };

  const bidDual = formatDualCurrency(bidAmount);
  const exposureDual = formatDualCurrency(requiredExposure);
  const guaranteedDual = formatDualCurrency(guaranteedAmount);
  const platformFeeDual = formatDualCurrency(platformCommission);
  const vatDual = formatDualCurrency(vatAmount);
  const totalFeesDual = formatDualCurrency(totalFees);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        className={`w-full max-w-lg rounded-t-3xl sm:rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xl max-h-[92vh] flex flex-col ${
          isDarkTheme ? 'bg-[#1E1E24] border-slate-800 text-slate-100' : 'bg-white border-[#E5E7EB] text-slate-800'
        }`}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FF5000]/10 text-[#FF5000] border border-[#FF5000]/20">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="font-black text-base flex items-center gap-2">
                <span>کنسول ثبت پیشنهاد سریع</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00A86B]/15 text-[#00A86B] font-mono">
                  {module.id}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                {module.defaultTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Active Offerer & Solvency Chip */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
              isSolvent
                ? isDarkTheme ? 'bg-slate-900/60 border-slate-800' : 'bg-[#F7F7FA] border-slate-200'
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <span className="text-slate-500 dark:text-slate-400">حساب متقاضی: </span>
                <span className="font-bold font-mono">{activeOfferer.offererId}</span>
              </div>
            </div>
            <div className="text-left font-mono">
              <span className="text-[10px] block text-slate-400">ضمانت مالی تاییدشده:</span>
              <span className="font-bold font-tnum text-emerald-600 dark:text-emerald-400">
                {guaranteedDual.toman}
              </span>
            </div>
          </div>

          {/* Quick Increment Buttons (eBay Mechanic) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                گام‌های رسمی افزایش نرخ (+گام: {formatDualCurrency(module.minIncrement).toman})
              </label>
              <button
                type="button"
                onClick={handleResetToMin}
                className="text-[11px] text-[#FF5000] hover:underline font-semibold cursor-pointer"
              >
                بازنشانی به حداقل
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={handleResetToMin}
                className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  bidAmount === minValidAmount
                    ? 'bg-[#FF5000] text-white border-[#FF5000] shadow-xs'
                    : isDarkTheme ? 'bg-slate-900 border-slate-700 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'
                }`}
              >
                حداقل مجاز
              </button>
              <button
                type="button"
                onClick={() => handleStepAdd(1)}
                className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isDarkTheme ? 'bg-slate-900 border-slate-700 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'
                }`}
              >
                +۱ گام
              </button>
              <button
                type="button"
                onClick={() => handleStepAdd(2)}
                className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isDarkTheme ? 'bg-slate-900 border-slate-700 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'
                }`}
              >
                +۲ گام
              </button>
              <button
                type="button"
                onClick={() => handleStepAdd(5)}
                className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isDarkTheme ? 'bg-slate-900 border-slate-700 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'
                }`}
              >
                +۵ گام
              </button>
            </div>
          </div>

          {/* Amount Display Card */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                مبلغ نهایی ثبت پیشنهاد:
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                حداقل مجاز: {formatDualCurrency(minValidAmount).toman}
              </span>
            </div>

            <div
              className={`p-4 rounded-2xl border text-center transition-all ${
                isDarkTheme ? 'bg-slate-950/80 border-slate-800' : 'bg-[#F7F7FA] border-slate-200'
              }`}
            >
              <div className="text-2xl sm:text-3xl font-black text-[#00A86B] font-tnum tracking-tight">
                {bidDual.toman}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-1">
                {bidDual.rial}
              </div>
            </div>
          </div>

          {/* Transparent Breakdown Calculator (ADR-002 & ADR-003) */}
          <div
            className={`p-3.5 rounded-2xl border text-xs space-y-2.5 ${
              isDarkTheme ? 'bg-slate-900/50 border-slate-800' : 'bg-amber-50/70 border-amber-200/80'
            }`}
          >
            <div className="flex items-center justify-between font-bold pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                <Scale className="w-4 h-4 text-amber-500" />
                <span>محاسبه شفاف تعهدات و کارمزد قانونی</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isSolvent
                    ? 'bg-[#00A86B]/15 text-[#00A86B]'
                    : 'bg-red-500/15 text-red-600'
                }`}
              >
                {isSolvent ? 'کفایت تعهد مالی تایید شد' : 'کسری سپرده تضمین'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 text-slate-600 dark:text-slate-400 text-[11px]">
              <div>
                <span>سپرده مسدودی ۱۵٪ (ADR-002):</span>
                <div className="font-bold text-slate-900 dark:text-slate-100 font-tnum text-xs mt-0.5">
                  {exposureDual.toman}
                </div>
              </div>
              <div>
                <span>کارمزد ۰.۵۰٪ + ۱۰٪ مالیات (ADR-003):</span>
                <div className="font-bold text-slate-900 dark:text-slate-100 font-tnum text-xs mt-0.5">
                  {totalFeesDual.toman}
                </div>
              </div>
            </div>

            {!isSolvent && (
              <div className="p-2.5 rounded-lg bg-red-500/10 text-red-600 text-[11px] flex items-center gap-1.5 mt-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  خطای سقف تعهد (K-INV-7): سپرده موردنیاز ({exposureDual.toman}) بیش از ضمانت در دسترس شما ({guaranteedDual.toman}) است.
                </span>
              </div>
            )}
          </div>

          {/* Idempotency Protocol Feedback (TR-12) */}
          <details className="text-xs group">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              <span>تنظیمات پیشرفته پروتکل تکرارناپذیری (TR-12 Idempotency)</span>
            </summary>
            <div className="mt-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 space-y-1.5 bg-slate-50/50 dark:bg-slate-900/30">
              <label className="text-[11px] text-slate-500 block">
                توکن یکتای پیشنهاد (Idempotency Key):
              </label>
              <input
                type="text"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="تولید خودکار ایمن با هر ارسال (پیش‌فرض سیستم)"
                className="w-full text-xs p-2 rounded-lg font-mono border bg-transparent dark:border-slate-700"
              />
              <p className="text-[10px] text-slate-400">
                ضمانت قانونی: در صورت قطعی اینترنت و ارسال مجدد با این کلید، هیچ پیشنهاد تکراری ثبت نشده و پاسخ قطعی اول بازگردانده می‌شود.
              </p>
            </div>
          </details>
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
              isDarkTheme ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'
            }`}
          >
            انصراف
          </button>

          <button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
            className={`flex-2 py-2.5 rounded-full text-xs font-bold text-white shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-98 ${
              canSubmit && !isSubmitting
                ? 'bg-[#FF5000] hover:bg-[#E64A00] cursor-pointer'
                : 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>
              {isSubmitting
                ? 'در حال اعتبارسنجی در هسته...'
                : !isOnline
                ? 'ذخیره در صف تاب‌آوری شبکه ملی'
                : 'ثبت قطعی در نردبان حراج'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
