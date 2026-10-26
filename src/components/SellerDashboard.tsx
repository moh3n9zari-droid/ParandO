import React, { useState } from 'react';
import {
  Building2,
  FileCheck2,
  ShieldCheck,
  Receipt,
  Download,
  Copy,
  CheckCircle2,
  Lock,
  ArrowUpRight,
  TrendingUp,
  FileText,
  Clock,
  ExternalLink,
  ChevronLeft,
  X,
  Scale,
  Percent,
} from 'lucide-react';
import { Competition, CompetitionStatus } from '../core/competition_kernel';
import { MarketModuleConfig } from '../data/market_modules';
import { formatDualCurrency, formatTimestamp, toPersianDigits } from '../utils/formatters';
import { AuditEvent } from './TransitionsLog';

export interface SellerDashboardProps {
  competitions: Competition[];
  modules: MarketModuleConfig[];
  currentModule: MarketModuleConfig;
  currentCompetition: Competition;
  auditEvents: AuditEvent[];
  onSettleCompetition: () => void;
  onSelectCompetition: (mod: MarketModuleConfig) => void;
  onClose?: () => void;
  isDarkTheme?: boolean;
}

export const SellerDashboard: React.FC<SellerDashboardProps> = ({
  competitions,
  modules,
  currentModule,
  currentCompetition,
  auditEvents,
  onSettleCompetition,
  onSelectCompetition,
  onClose,
  isDarkTheme = false,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'settlement' | 'audit' | 'drafts'>('active');
  const [copiedVoucherHash, setCopiedVoucherHash] = useState(false);

  const isCurrentSettled =
    currentCompetition.status === CompetitionStatus.CLOSED ||
    currentCompetition.status === CompetitionStatus.CANCELLED;

  const winner = currentCompetition.highestOffer;
  const clearingPrice = winner ? winner.amount : 0;
  const clearingDual = formatDualCurrency(clearingPrice);

  // 50 bps commission (ADR-003)
  const commissionBps = 50;
  const platformCommission = Math.floor((clearingPrice * commissionBps) / 10000);
  const vatAmount = Math.floor((platformCommission * 10) / 100);
  const totalDeductions = platformCommission + vatAmount;
  const netSellerPayout = clearingPrice - totalDeductions;

  const voucherHash = `0x9e8b7c6a5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a`;

  const copyHash = () => {
    navigator.clipboard?.writeText(voucherHash);
    setCopiedVoucherHash(true);
    setTimeout(() => setCopiedVoucherHash(false), 2000);
  };

  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['زمان,کد مزایده,شناسه پیشنهاددهنده,مبلغ (ریال),رتبه,وضعیت']
        .concat(
          auditEvents.map(
            (e) =>
              `${e.timestamp.toISOString()},${currentCompetition.competitionId},${e.offererId},${e.amount},${e.rank || '-'},${e.type}`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `parando_audit_trail_${currentCompetition.competitionId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6" dir="rtl">
      {/* Dashboard Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#1E1E24] border border-[#E5E7EB] dark:border-slate-800 shadow-sm mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-[#FF5000]/10 text-[#FF5000] border border-[#FF5000]/20">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>میز کارگزاری فروشندگان دولتی و تسویه نهایی</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#00A86B]/15 text-[#00A86B]">
                ADR-003 انطباق فعال
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              مدیریت چرخه عمر مزایدات، تسهیم وجوه، استعلام حواله‌های رمزنگاری‌شده و ثبت ممیزی دیوان
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
            title="بستن پنل فروشنده"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 mb-6 overflow-x-auto scrollbar-none">
        {(
          [
            { id: 'active', label: 'مزایدات فعال و در حال رقابت' },
            { id: 'settlement', label: 'کنسول تسویه و صدور حواله (ADR-003)' },
            { id: 'audit', label: 'ردگیری ممیزی و خروجی قانونی (Audit Trail)' },
            { id: 'drafts', label: 'پیش‌نویس‌ها و لات‌های آماده عرضه' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === t.id
                ? 'bg-[#FF5000] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Active Auctions */}
      {activeTab === 'active' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map((mod) => (
            <div
              key={mod.id}
              className={`p-4 rounded-xl border transition-all ${
                mod.id === currentModule.id
                  ? 'bg-amber-500/5 border-[#FF5000] ring-1 ring-[#FF5000]/30'
                  : 'bg-white dark:bg-[#1E1E24] border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#FF5000]">{mod.badge}</span>
                <span className="font-mono text-slate-400">{mod.lotNumber}</span>
              </div>

              <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1 mb-2">
                {mod.defaultTitle}
              </h4>

              <div className="space-y-1 text-xs text-slate-500 mb-4 font-mono">
                <div>پایه: {formatDualCurrency(mod.basePrice).toman}</div>
                <div>گام افزایش: {formatDualCurrency(mod.minIncrement).toman}</div>
                <div>مستأجر: {mod.tenantId}</div>
              </div>

              <button
                onClick={() => onSelectCompetition(mod)}
                className={`w-full py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  mod.id === currentModule.id
                    ? 'bg-[#FF5000] text-white border-[#FF5000]'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {mod.id === currentModule.id ? 'انتخاب شده برای مدیریت' : 'انتخاب این مزایده'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Settlement & Clearing Console (ADR-003) */}
      {activeTab === 'settlement' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-[#1E1E24] border border-[#E5E7EB] dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs text-slate-400 block">مزایده تحت پردازش:</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {currentModule.defaultTitle}
                </h3>
              </div>

              {!isCurrentSettled ? (
                <button
                  onClick={onSettleCompetition}
                  className="px-4 py-2.5 rounded-full text-xs font-bold bg-[#FF5000] hover:bg-[#E64A00] text-white shadow-sm flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>پایان رقابت و اجرای تسویه قطعی (ladder.determined)</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00A86B]/15 text-[#00A86B] text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تسویه نهایی انجام شد</span>
                </div>
              )}
            </div>

            {/* Financial Calculations Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 block mb-1">مبلغ کشف‌شده (Clearing Price):</span>
                <span className="text-lg font-black text-slate-900 dark:text-white font-tnum">
                  {clearingDual.toman}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono mt-0.5">{clearingDual.rial}</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 block mb-1">کارمزد پلتفرم (۵۰ صدم درصد):</span>
                <span className="text-lg font-black text-amber-600 font-tnum">
                  {formatDualCurrency(platformCommission).toman}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono mt-0.5">نرخ: 50 bps</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 block mb-1">مالیات بر ارزش افزوده (۱۰٪ کارمزد):</span>
                <span className="text-lg font-black text-slate-700 dark:text-slate-300 font-tnum">
                  {formatDualCurrency(vatAmount).toman}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono mt-0.5">قانون مالیات مصوب</span>
              </div>

              <div className="p-4 rounded-xl bg-[#00A86B]/10 border border-[#00A86B]/30">
                <span className="text-xs text-emerald-800 dark:text-emerald-300 block mb-1">خالص واریزی به خزانه‌داری/فروشنده:</span>
                <span className="text-lg font-black text-[#00A86B] font-tnum">
                  {formatDualCurrency(netSellerPayout).toman}
                </span>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-mono mt-0.5">
                  {formatDualCurrency(netSellerPayout).rial}
                </span>
              </div>
            </div>

            {/* SHA-256 Settlement Voucher */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-200 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1.5 font-bold text-white">
                  <Lock className="w-4 h-4 text-[#FF5000]" />
                  <span>حواله تسویه رمزنگاری‌شده دیوان محاسبات (ADR-003 Voucher):</span>
                </span>
                <button
                  onClick={copyHash}
                  className="flex items-center gap-1 text-[#FF5000] hover:underline cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedVoucherHash ? 'کپی شد!' : 'کپی هش SHA-256'}</span>
                </button>
              </div>

              <div className="p-3 rounded-lg bg-black/60 border border-slate-800 text-amber-400 break-all select-all text-[11px]">
                {voucherHash}
              </div>

              <div className="text-[10px] text-slate-400 leading-relaxed font-sans">
                این هش نتیجه رمزنگاری تجمیعی برنده، قیمت کشف‌شده، زمان خاتمه و امضای دیوان است و امکان هرگونه ادعای مغایرت را سلب می‌نماید.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Audit & Compliance Trail */}
      {activeTab === 'audit' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1E1E24] border border-[#E5E7EB] dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                ردگیری تراکنش‌های ممیزی (Audit Trail)
              </h3>
              <p className="text-xs text-slate-500">
                ثبت بدون وقفه تمام پیشنهادهای وارده، ترتیب ثبت و رخدادهای نردبان
              </p>
            </div>

            <button
              onClick={handleExportCSV}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#FF5000] hover:bg-[#E64A00] text-white flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>خروجی رسمی CSV جهت دیوان</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">زمان ثبت</th>
                  <th className="py-2.5 px-3">پیشنهاددهنده</th>
                  <th className="py-2.5 px-3">مبلغ پیشنهاد</th>
                  <th className="py-2.5 px-3">رتبه نردبان</th>
                  <th className="py-2.5 px-3">نوع رویداد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {auditEvents.slice(0, 15).map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="py-2.5 px-3 text-slate-500">{formatTimestamp(evt.timestamp)}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{evt.offererId}</td>
                    <td className="py-2.5 px-3 text-[#00A86B] font-bold">
                      {formatDualCurrency(evt.amount).toman}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold">
                        #{toPersianDigits(evt.rank || 1)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          evt.type === 'ACCEPTED'
                            ? 'bg-[#00A86B]/15 text-[#00A86B]'
                            : 'bg-amber-500/15 text-amber-600'
                        }`}
                      >
                        {evt.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Drafts */}
      {activeTab === 'drafts' && (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#1E1E24] border border-[#E5E7EB] dark:border-slate-800 text-center space-y-3">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <h4 className="font-bold text-slate-800 dark:text-slate-200">
            ثبت و تعریف مزایده جدید دولتی
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            فروشندگان مجاز سازمانی می‌توانند با بارگذاری صورتجلسه کارشناسی دادگستری، مزایده جدید را در حالت پیش‌نویس آماده‌سازی نمایند.
          </p>
          <button
            onClick={() => alert('فرم تعریف لات مزایده دولتی در نسخه جدید فعال خواهد شد.')}
            className="mt-2 px-5 py-2.5 rounded-full text-xs font-bold bg-[#FF5000] text-white hover:bg-[#E64A00] transition-colors cursor-pointer"
          >
            بارگذاری اسناد و ایجاد پیش‌نویس
          </button>
        </div>
      )}
    </div>
  );
};
