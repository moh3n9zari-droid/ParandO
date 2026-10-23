import React from 'react';
import { SettlementStatement } from '../core/settlement_module';
import { formatDualCurrency, toPersianDigits, formatTimestamp } from '../utils/formatters';
import { Receipt, CheckCircle, ArrowDownLeft, ArrowUpRight, ShieldCheck, X, FileText, Layers, Percent } from 'lucide-react';

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  statement: SettlementStatement | null;
  isFinalized: boolean;
  onFinalizeSettlement?: () => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  isOpen,
  onClose,
  statement,
  isFinalized,
  onFinalizeSettlement,
}) => {
  if (!isOpen || !statement) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md text-right" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <h3 className="font-bold text-base sm:text-lg text-white">
                  سند تسویه مالی و تسهیم مطالبات (ADR-003)
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                    isFinalized
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {isFinalized ? 'تسویه قطعی (Finalized)' : 'پیش‌نویس برآورد تسویه'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                شناسه تسویه: <span className="text-slate-200">{statement.settlementId}</span> &middot; رویداد:{' '}
                <span className="text-emerald-400">ladder.determined</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm">
          {/* Key Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 text-xs block mb-1">ارزش ناخالص معامله</span>
              <span className="font-mono font-bold text-slate-100 text-base block">
                {formatDualCurrency(statement.summary.totalGrossAmount).rial}
              </span>
              <span className="font-mono text-xs text-amber-400">
                {formatDualCurrency(statement.summary.totalGrossAmount).toman}
              </span>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 text-xs block mb-1">کارمزد سامانه و کارگزاری (۰.۵٪)</span>
              <span className="font-mono font-bold text-slate-100 text-base block">
                {formatDualCurrency(statement.summary.totalCommission).rial}
              </span>
              <span className="font-mono text-xs text-slate-400">
                {formatDualCurrency(statement.summary.totalCommission).toman}
              </span>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 text-xs block mb-1">مالیات بر ارزش افزوده (۱۰٪ VAT)</span>
              <span className="font-mono font-bold text-slate-100 text-base block">
                {formatDualCurrency(statement.summary.totalVat).rial}
              </span>
              <span className="font-mono text-xs text-slate-400">
                {formatDualCurrency(statement.summary.totalVat).toman}
              </span>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/10">
              <span className="text-emerald-400 text-xs block mb-1 font-medium">خالص واریزی به فروشنده</span>
              <span className="font-mono font-bold text-emerald-300 text-base block">
                {formatDualCurrency(statement.summary.totalSellerPayout).rial}
              </span>
              <span className="font-mono text-xs text-emerald-400/80">
                {formatDualCurrency(statement.summary.totalSellerPayout).toman}
              </span>
            </div>
          </div>

          {/* Winning Allocation Breakdown */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-slate-200">تخصیص قطعی برنده حراج (Winner Allocation)</h4>
              </div>
              <span className="text-xs text-slate-400">
                فروشنده: <span className="font-mono text-slate-200">{statement.sellerId}</span>
              </span>
            </div>

            {statement.winners.length === 0 ? (
              <p className="text-slate-400 text-xs py-3 text-center">
                هیچ پیشنهادی در این رقابت ثبت نگردیده و حراج بدون معامله خاتمه یافت.
              </p>
            ) : (
              statement.winners.map((winner) => (
                <div key={winner.offerId} className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">برنده جایگاه اول:</span>
                        <span className="font-mono font-bold text-amber-300">{winner.offererId}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">شناسه پیشنهاد برنده:</span>
                        <span className="font-mono text-slate-300">{winner.offerId}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">مبلغ پیشنهادی (ناخالص):</span>
                        <span className="font-mono font-semibold text-slate-200">
                          {formatDualCurrency(winner.grossAmount).rial}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">کارمزد پلتفرم و کارگزاری (۰.۵٪):</span>
                        <span className="font-mono text-slate-200">
                          +{formatDualCurrency(winner.commissionAmount).rial}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">مالیات بر ارزش افزوده کارمزد (۱۰٪):</span>
                        <span className="font-mono text-slate-200">
                          +{formatDualCurrency(winner.vatAmount).rial}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800 font-bold">
                        <span className="text-amber-300">کل واریزی تعهد خریدار:</span>
                        <span className="font-mono text-amber-300">
                          {formatDualCurrency(winner.netBuyerPayable).rial}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Collateral & Guarantee Release (ADR-003) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <h4 className="font-bold text-slate-200">
                  وضعیت آزادسازی و استرداد وثایق سایر شرکت‌کنندگان (Collateral Release)
                </h4>
              </div>
              <span className="text-xs text-sky-300 font-mono">
                مجموع آزادشده: {formatDualCurrency(statement.summary.totalCollateralReleased).rial}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-medium">
                    <th className="py-2 px-2">پیشنهاددهنده</th>
                    <th className="py-2 px-2">مستأجر بورس</th>
                    <th className="py-2 px-2">مبلغ ودیعه مسدودی</th>
                    <th className="py-2 px-2">علت استرداد</th>
                    <th className="py-2 px-2 text-left">وضعیت بانکی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {statement.releases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-slate-500 font-sans">
                        موردی برای آزادسازی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    statement.releases.map((rel) => (
                      <tr key={rel.offererId} className="hover:bg-slate-900/50">
                        <td className="py-2 px-2 text-slate-200 font-medium">{rel.offererId}</td>
                        <td className="py-2 px-2 text-slate-400">{rel.tenantId}</td>
                        <td className="py-2 px-2 text-emerald-400">
                          {formatDualCurrency(rel.releaseAmount).rial}
                        </td>
                        <td className="py-2 px-2 text-slate-400 font-sans">
                          {rel.reason === 'DID_NOT_WIN' ? 'عدم برنده شدن در مزایده' : 'خروج از نردبان (OUTBID)'}
                        </td>
                        <td className="py-2 px-2 text-left">
                          <span className="px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            رفع مسدودی و مسترد شد
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Double-Entry Accounting Ledger Entries */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <h4 className="font-bold text-slate-200">
                سند دوبل حسابداری دفتر کل (Double-Entry General Ledger)
              </h4>
            </div>

            <div className="space-y-1.5 font-mono text-xs">
              {statement.ledgerEntries.map((entry) => (
                <div
                  key={entry.entryId}
                  className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/80"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-bold">
                      {entry.account}
                    </span>
                    <span className="text-slate-300 font-sans text-xs">{entry.description}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {entry.debit > 0 && (
                      <span className="text-sky-400 font-medium">
                        بدهکار: {formatDualCurrency(entry.debit).rial}
                      </span>
                    )}
                    {entry.credit > 0 && (
                      <span className="text-emerald-400 font-medium">
                        بستانکار: {formatDualCurrency(entry.credit).rial}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span>تنظیم شده بر اساس الزامات تسویه ADR-003 و سازمان بورس کالای ایران</span>
          </div>
          <div className="flex items-center gap-2">
            {!isFinalized && onFinalizeSettlement && (
              <button
                onClick={onFinalizeSettlement}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                صدور و نهایی‌سازی رسمی سند تسویه
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
            >
              بستن پنجره
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
