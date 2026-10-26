import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileCheck2,
  Lock,
  Receipt,
  Percent,
  Coins,
  Copy,
  CheckCircle2,
  Building,
  UserCheck,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { Competition, Offer, CompetitionStatus } from '../core/competition_kernel';
import { MarketModuleConfig } from '../data/market_modules';
import { formatDualCurrency, formatTimestamp, toPersianDigits } from '../utils/formatters';

export interface SettlementDashboardProps {
  competition: Competition;
  module: MarketModuleConfig;
  onSettleCompetition: () => void;
  isDarkTheme?: boolean;
}

export const SettlementDashboard: React.FC<SettlementDashboardProps> = ({
  competition,
  module,
  onSettleCompetition,
  isDarkTheme = true,
}) => {
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const isSettled = competition.status === CompetitionStatus.CLOSED || competition.status === CompetitionStatus.CANCELLED;

  const winner = competition.highestOffer;
  const clearingPrice = winner ? winner.amount : 0;
  const clearingDual = formatDualCurrency(clearingPrice);

  // Commission calculations (ADR-003)
  const commissionBps = 50; // 50 bps = 0.50%
  const platformFee = Math.floor((clearingPrice * commissionBps) / 10000);
  const vatAmount = Math.floor((platformFee * 10) / 100);
  const totalDeductions = platformFee + vatAmount;
  const netSellerPayout = clearingPrice - totalDeductions;

  const platformFeeDual = formatDualCurrency(platformFee);
  const vatDual = formatDualCurrency(vatAmount);
  const netSellerDual = formatDualCurrency(netSellerPayout);

  // Deterministic voucher hash simulation
  const dummyHash = `0x7fa9c812d4a51e6b8c9d01249e0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className={`p-4 sm:p-6 rounded-2xl border space-y-6 ${
      isDarkTheme
        ? 'bg-slate-900 border-slate-800 text-slate-100'
        : 'bg-white border-slate-200 text-slate-800'
    }`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-500">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black flex items-center gap-2">
              <span>سامانه تسویه قطعی و کمیسیون (ADR-003)</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                isSettled
                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
              }`}>
                {isSettled ? 'تسویه نهایی انجام شد' : 'در حال اجرای رقابت'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تسویه ریالی، صدور حواله رمزنگاری‌شده، آزادسازی وجوه مسدودی و محاسبه کارمزد پلتفرم
            </p>
          </div>
        </div>

        <div>
          {!isSettled ? (
            <button
              onClick={onSettleCompetition}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>پایان رقابت و اجرای تسویه (ladder.determined)</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 text-xs text-emerald-500 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>رویدادهای تسویه به ثبت رسیدند</span>
            </div>
          )}
        </div>
      </div>

      {/* Clearing Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Winner & Clearing Price Card */}
        <div className={`p-4 rounded-xl border ${
          isDarkTheme ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>برنده رقابت و سقف قیمت (Clearing Price):</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mb-1">
            {clearingDual.toman}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {clearingDual.rial}
          </div>
          <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
            <span className="text-slate-500">هویت برنده:</span>
            <span className="font-mono font-bold">{winner ? winner.offererId : 'بدون پیشنهاد'}</span>
          </div>
        </div>

        {/* Fees & Deductions Card */}
        <div className={`p-4 rounded-xl border ${
          isDarkTheme ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>کسورات پلتفرم و مالیات:</span>
            <Percent className="w-4 h-4 text-amber-500" />
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">کارمزد سامانه (۵۰ bps):</span>
              <span className="font-mono font-bold">{platformFeeDual.toman}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">مالیات بر ارزش افزوده (۱۰٪):</span>
              <span className="font-mono font-bold">{vatDual.toman}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 font-bold">
              <span>مجموع کسورات قانونی:</span>
              <span className="font-mono text-red-500">{formatDualCurrency(totalDeductions).toman}</span>
            </div>
          </div>
        </div>

        {/* Net Seller Proceeds Card */}
        <div className={`p-4 rounded-xl border ${
          isDarkTheme ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
            <span>خالص واریزی به حساب فروشنده دولتی:</span>
            <Building className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 mb-1">
            {netSellerDual.toman}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {netSellerDual.rial}
          </div>
          <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
            <span className="text-slate-500">شناسه حساب فروشنده:</span>
            <span className="font-mono font-bold">{module.sellerId}</span>
          </div>
        </div>
      </div>

      {/* Escrow Holds Release Status */}
      <div className={`p-4 rounded-xl border ${
        isDarkTheme ? 'bg-slate-800/40 border-slate-800' : 'bg-emerald-50/50 border-emerald-200'
      }`}>
        <div className="flex items-center gap-2 mb-2 font-bold text-xs text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
          <span>وضعیت آزادسازی ودیعه‌های ۱۵٪ مشارکت‌کنندگان مغلوب (escrow.hold.released)</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          مطابق با تعهدات ADR-002 و K-INV-7، بلافاصله پس از بسته شدن نردبان و تعیین برنده، تمام مسدودی‌های سپرده ۱۵٪ مربوط به سایر پیشنهاددهندگان از وضعیت توقیف خارج شده و به صورت برخط و خودکار به سرفصل مالی آنان عودت داده شد.
        </p>
      </div>

      {/* Cryptographic Settlement Voucher */}
      <div className={`p-4 rounded-xl border font-mono text-xs space-y-2 ${
        isDarkTheme ? 'bg-black/50 border-slate-800' : 'bg-slate-100 border-slate-300'
      }`}>
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span className="flex items-center gap-1.5 font-bold">
            <Lock className="w-3.5 h-3.5 text-amber-500" />
            <span>حواله قطعی تسویه رمزنگاری‌شده (SHA-256 Settlement Voucher)</span>
          </span>
          <button
            onClick={() => copyToClipboard(dummyHash)}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
          >
            {copiedHash ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedHash ? 'کپی شد' : 'کپی هش'}</span>
          </button>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-900 text-amber-400 break-all select-all text-[11px] leading-relaxed border border-slate-800">
          {dummyHash}
        </div>
      </div>
    </div>
  );
};
