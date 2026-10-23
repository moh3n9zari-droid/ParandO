import React from 'react';
import { Competition } from '../core/competition_kernel';
import { formatDualCurrency, formatTimestamp, toPersianDigits } from '../utils/formatters';
import { Trophy, TrendingUp, ShieldAlert, Award } from 'lucide-react';

interface LadderViewProps {
  competition: Competition;
  activeOffererId: string;
  lastUpdatedOfferId?: string;
}

export const LadderView: React.FC<LadderViewProps> = ({ competition, activeOffererId, lastUpdatedOfferId }) => {
  const ladder = competition.ladder;
  const k = competition.ladderSize;
  const isFull = ladder.length >= k;
  const leader = ladder.length > 0 ? ladder[0] : null;
  const threshold = isFull ? ladder[ladder.length - 1].amount : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col h-full text-right">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2.5 space-x-reverse">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              نردبان رقابت برترین‌ها
              <span className="text-xs px-2 py-0.5 rounded font-mono font-normal bg-slate-800 text-slate-300 border border-slate-700">
                {toPersianDigits(k)} جایگاه برتر (K={toPersianDigits(k)})
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-normal text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                پخش زنده WebSocket
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              قاعده TR-13: مبلغ بالاتر ↓ &middot; شماره توالی ثبت پیشنهاد ↑ (برابری قطعی)
            </p>
          </div>
        </div>

        <div className="text-left">
          <span className="text-xs text-slate-400 block">جایگاه‌های تکمیل‌شده</span>
          <span className="text-sm font-bold font-mono text-slate-200">
            {toPersianDigits(ladder.length)} از {toPersianDigits(k)}
          </span>
        </div>
      </div>

      {/* Threshold banner */}
      <div className="my-3 py-2 px-3 bg-slate-950/60 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5 space-x-reverse text-slate-400">
          <span>آستانه ورود به نردبان:</span>
        </div>
        <div className="font-mono text-slate-200 font-medium">
          {threshold !== null ? (
            <span className="text-amber-300">
              بیشتر از {formatDualCurrency(threshold).rial} ({formatDualCurrency(threshold).toman})
            </span>
          ) : (
            <span className="text-emerald-400">
              آزاد ({ladder.length < k ? `${toPersianDigits(k - ladder.length)} جایگاه خالی` : 'ورود با قیمت پایه'})
            </span>
          )}
        </div>
      </div>

      {/* Ladder list */}
      <div className="flex-1 space-y-2.5 overflow-y-auto">
        {ladder.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-lg bg-slate-950/30">
            <Trophy className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-300">نردبان در انتظار اولین پیشنهاد</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
              هنوز پیشنهادی در این مزایده ثبت نشده است. با ثبت اولین پیشنهاد با قیمت پایه (
              {formatDualCurrency(competition.rules.basePrice).rial})، رتبه اول را تصاحب کنید.
            </p>
          </div>
        ) : (
          ladder.map((offer, index) => {
            const rank = index + 1;
            const isLeader = rank === 1;
            const isCurrentOfferer = offer.offererId === activeOffererId;
            const dual = formatDualCurrency(offer.amount);
            const deltaLeader = leader && !isLeader ? leader.amount - offer.amount : 0;

            const isRecentlyUpdated = offer.offerId === lastUpdatedOfferId;

            return (
              <div
                key={offer.offerId}
                className={`relative rounded-xl p-3.5 border transition-all duration-300 ${
                  isRecentlyUpdated
                    ? 'ring-2 ring-emerald-400 bg-emerald-950/30 border-emerald-500 scale-[1.01]'
                    : isLeader
                    ? 'bg-gradient-to-l from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/40 shadow-sm'
                    : isCurrentOfferer
                    ? 'bg-slate-800/80 border-sky-500/40'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Right: Rank & Offerer */}
                  <div className="flex items-center space-x-3 space-x-reverse">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 shadow-inner ${
                        isLeader
                          ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-amber-500/20'
                          : rank === 2
                          ? 'bg-slate-700 text-slate-200 border border-slate-600'
                          : rank === 3
                          ? 'bg-amber-900/60 text-amber-200 border border-amber-800/60'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isLeader ? <Award className="w-5 h-5" /> : `رتبه ${toPersianDigits(rank)}`}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <span className="font-mono font-semibold text-sm text-white">
                          {offer.offererId}
                        </span>
                        {isCurrentOfferer && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium">
                            شما
                          </span>
                        )}
                        {isLeader && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold tracking-wide flex items-center gap-0.5">
                            پیشرو (صدرنشین)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center space-x-2 space-x-reverse">
                        <span className="text-amber-400 font-semibold">توالی TR-13: شماره {toPersianDigits(offer.sequence)}</span>
                        <span>&middot;</span>
                        <span>ساعت: {formatTimestamp(offer.placedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Left: Amounts */}
                  <div className="text-left">
                    <div className="font-mono font-bold text-sm text-slate-100">
                      {dual.rial}
                    </div>
                    <div className="text-xs text-amber-400/90 font-mono">
                      {dual.toman}
                    </div>
                    {!isLeader && deltaLeader > 0 && (
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        فاصله از صدر: {formatDualCurrency(deltaLeader).rial}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer metadata */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>شناسه پیشنهاد: {offer.offerId}</span>
                  <span className="text-emerald-400/80 font-medium">وضعیت: مستقر در نردبان</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footnote on Single-Offerer-Per-Ladder Rule */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-1.5 leading-relaxed">
        <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>قانون ADR-001: هر متقاضی حداکثر دارای ۱ جایگاه در نردبان است. پیشنهاد بالاتر جایگزین پیشنهاد قبلی می‌شود.</span>
      </div>
    </div>
  );
};
