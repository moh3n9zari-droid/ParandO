import React from 'react';
import { Competition, CompetitionStatus } from '../core/competition_kernel';
import { MarketModuleConfig } from '../data/market_modules';
import { formatDualCurrency, formatDuration, toPersianDigits } from '../utils/formatters';
import { Clock } from 'lucide-react';

interface AuctionHeaderProps {
  competition: Competition;
  currentModule: MarketModuleConfig;
  currentTime: Date;
  onChangeStatus: (status: CompetitionStatus) => void;
  onModifyLadderSize: (size: number) => void;
}

export const AuctionHeader: React.FC<AuctionHeaderProps> = ({
  competition,
  currentModule,
  currentTime,
  onChangeStatus,
  onModifyLadderSize,
}) => {
  const timeLeftMs = competition.endsAt.getTime() - currentTime.getTime();
  const timeToStartMs = competition.startsAt.getTime() - currentTime.getTime();
  const isStarted = currentTime.getTime() >= competition.startsAt.getTime();
  const isEnded = currentTime.getTime() >= competition.endsAt.getTime();

  const getStatusBadge = () => {
    switch (competition.status) {
      case CompetitionStatus.ACTIVE:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            رقابت فعال و زنده
          </span>
        );
      case CompetitionStatus.SCHEDULED:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            برنامه‌ریزی‌شده
          </span>
        );
      case CompetitionStatus.CLOSED:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-700/50 text-slate-400 border border-slate-600 flex items-center gap-1.5">
            پایان‌یافته
          </span>
        );
      case CompetitionStatus.CANCELLED:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1.5">
            لغوشده
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-800 text-slate-300">
            {competition.status}
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg text-right">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Title & Descriptions */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {getStatusBadge()}
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-800 text-slate-300 border border-slate-700">
              {currentModule.badge}
            </span>
            <span className="text-xs font-mono text-slate-400">
              شناسه رقابت: <span className="text-slate-200">{competition.competitionId}</span>
            </span>
          </div>

          <h2 className="text-xl font-bold text-white tracking-tight">
            {currentModule.defaultTitle}
          </h2>

          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            {currentModule.description} &middot; <span className="text-slate-300 font-medium">واحد معامله: {currentModule.unit}</span>
          </p>
        </div>

        {/* Right: Countdown & Time controls */}
        <div className="flex items-center space-x-4 space-x-reverse bg-slate-950/80 border border-slate-800 rounded-xl p-3 shrink-0">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">
              {!isStarted ? 'زمان تا شروع' : isEnded ? 'وضعیت مزایده' : 'زمان باقی‌مانده'}
            </span>
            <div className="text-xl font-bold font-mono text-amber-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400/80" />
              <span>
                {!isStarted
                  ? formatDuration(timeToStartMs)
                  : isEnded
                  ? 'پایان یافت'
                  : formatDuration(timeLeftMs)}
              </span>
            </div>
          </div>

          {/* Status Override Selector */}
          <div className="border-r border-slate-800 pr-4">
            <span className="text-[10px] text-slate-400 block mb-1">شبیه‌سازی وضعیت:</span>
            <div className="flex items-center space-x-1 space-x-reverse">
              {[
                { key: CompetitionStatus.ACTIVE, label: 'فعال' },
                { key: CompetitionStatus.SCHEDULED, label: 'آغازنشده' },
                { key: CompetitionStatus.CLOSED, label: 'خاتمه' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChangeStatus(item.key)}
                  className={`px-2 py-1 text-[11px] rounded transition cursor-pointer ${
                    competition.status === item.key
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Rules Metric Strip */}
      <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px]">قیمت پایه مزایده</span>
          <span className="font-mono font-bold text-slate-100 text-sm">
            {formatDualCurrency(competition.rules.basePrice).rial}
          </span>
          <span className="font-mono text-[11px] text-amber-400 block">
            {formatDualCurrency(competition.rules.basePrice).toman}
          </span>
        </div>

        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px]">حداقل گام افزایش قیمت</span>
          <span className="font-mono font-bold text-slate-100 text-sm">
            {formatDualCurrency(competition.rules.minIncrement).rial}
          </span>
          <span className="font-mono text-[11px] text-slate-400 block">
            {formatDualCurrency(competition.rules.minIncrement).toman}
          </span>
        </div>

        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px]">سپرده تضمین الزامی (۱۵٪ پایه)</span>
          <span className="font-mono font-bold text-amber-300 text-sm">
            {formatDualCurrency(competition.rules.requiredExposure).rial}
          </span>
          <span className="font-mono text-[11px] text-slate-400 block">
            نرخ ودیعه: {toPersianDigits(competition.rules.depositRateBps / 100)}٪ (ADR-001)
          </span>
        </div>

        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-400 block text-[11px]">ظرفیت نردبان رتبه‌ها (K)</span>
          <div className="flex items-center space-x-1.5 space-x-reverse mt-0.5">
            <span className="font-mono font-bold text-slate-100 text-sm">
              {toPersianDigits(competition.ladderSize)} رتبه برتر
            </span>
            <div className="flex items-center space-x-0.5 space-x-reverse">
              {[1, 3, 5, 10].map((sz) => (
                <button
                  key={sz}
                  onClick={() => onModifyLadderSize(sz)}
                  className={`w-5 h-5 rounded text-[10px] font-mono transition cursor-pointer ${
                    competition.ladderSize === sz
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {toPersianDigits(sz)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
          <span className="text-slate-400 block text-[11px]">نسخه همزمانی خوش‌بینانه</span>
          <span className="font-mono font-bold text-sky-400 text-sm">
            نسخه {toPersianDigits(competition.version)}
          </span>
          <span className="text-[11px] text-slate-400 block">
            {toPersianDigits(competition.offerCount)} پیشنهاد ثبت‌شده
          </span>
        </div>
      </div>
    </div>
  );
};
