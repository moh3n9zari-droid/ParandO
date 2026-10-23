import React from 'react';
import { StatusTransition, RankChange, LadderOfferStatus } from '../core/competition_ladder';
import { Activity, ArrowDownRight, ArrowUpRight, History } from 'lucide-react';
import { formatDualCurrency, formatTimestamp, toPersianDigits } from '../utils/formatters';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  offerId: string;
  offererId: string;
  amount: number;
  type: 'ACCEPTED' | 'REJECTED' | 'REPLAY';
  reason?: string;
  rank?: number | null;
  transitions: readonly StatusTransition[];
  rankChanges: readonly RankChange[];
}

interface TransitionsLogProps {
  events: AuditEvent[];
  onClear: () => void;
}

export const TransitionsLog: React.FC<TransitionsLogProps> = ({ events, onClear }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col h-full text-right">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5 space-x-reverse">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">دفتر ثبت وقایع و تغییرات لحظه‌ای نردبان</h3>
            <p className="text-xs text-slate-400">جریان رویدادهای جابجایی رتبه‌ها، سبقت‌ها و پاسخ‌های تکرارپذیر TR-12</p>
          </div>
        </div>

        {events.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-slate-400 hover:text-slate-200 transition font-mono cursor-pointer"
          >
            پاکسازی تاریخچه
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto mt-3 space-y-2.5 max-h-[360px] pl-1">
        {events.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-lg bg-slate-950/20">
            <History className="w-6 h-6 text-slate-600 mb-2" />
            <p className="text-xs text-slate-400">هنوز تغییری در نردبان ثبت نشده است.</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              با ثبت پیشنهادات، وقایع رتبه‌بندی، خروج از نردبان به دلیل سبقت دیگران، و پاسخ‌های تکرارپذیر به‌صورت زنده نمایش داده می‌شوند.
            </p>
          </div>
        ) : (
          events.map((evt) => (
            <div
              key={evt.id}
              className={`p-3 rounded-lg border text-xs transition ${
                evt.type === 'ACCEPTED'
                  ? 'bg-slate-950/70 border-slate-800'
                  : evt.type === 'REPLAY'
                  ? 'bg-sky-950/30 border-sky-800/50'
                  : 'bg-red-950/20 border-red-900/40 text-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded font-bold uppercase ${
                      evt.type === 'ACCEPTED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : evt.type === 'REPLAY'
                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {evt.type === 'ACCEPTED'
                      ? `رتبه ${toPersianDigits(evt.rank || 1)}`
                      : evt.type === 'REPLAY'
                      ? 'پاسخ تکرارپذیر TR-12'
                      : 'رد درخواست'}
                  </span>
                  <span className="font-semibold text-slate-200">{evt.offererId}</span>
                  <span className="text-slate-500 text-[11px]">({evt.offerId})</span>
                </div>
                <span className="text-slate-500 text-[10px] font-mono">
                  {formatTimestamp(evt.timestamp)}
                </span>
              </div>

              {evt.type !== 'REJECTED' && (
                <div className="mt-1 text-slate-300">
                  {evt.type === 'REPLAY' ? 'پاسخ معتبر بدون اجرای مجدد برای مبلغ ' : 'ثبت قطعی پیشنهاد با مبلغ '}
                  <span className="font-mono font-semibold text-white">{formatDualCurrency(evt.amount).rial}</span>
                </div>
              )}

              {evt.reason && evt.type === 'REJECTED' && (
                <div className="mt-1 text-red-300 text-[11px] leading-relaxed">
                  علت رد: <span className="font-mono">{evt.reason}</span>
                </div>
              )}

              {/* Status transitions (e.g. OUTBID, SUPERSEDED) */}
              {evt.transitions.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-slate-800/80 space-y-1">
                  {evt.transitions.map((t, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center space-x-1.5 space-x-reverse text-[11px] ${
                        t.newStatus === LadderOfferStatus.OUTBID
                          ? 'text-amber-400'
                          : t.newStatus === LadderOfferStatus.SUPERSEDED
                          ? 'text-sky-400'
                          : 'text-slate-400'
                      }`}
                    >
                      <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {t.newStatus === LadderOfferStatus.OUTBID && (
                          <span><strong>خروج از نردبان (سبقت):</strong> پیشنهاد {t.offerId} متعلق به {t.offererId} به دلیل پر شدن ظرفیت از نردبان خارج شد.</span>
                        )}
                        {t.newStatus === LadderOfferStatus.SUPERSEDED && (
                          <span><strong>ارتقای پیشنهاد خودی:</strong> پیشنهاد قبلی {t.offerId} توسط پیشنهاد بالاتر خود این متقاضی جایگزین گردید.</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Rank changes */}
              {evt.rankChanges.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 space-y-0.5 text-[11px] text-slate-400">
                  {evt.rankChanges.map((rc, idx) => (
                    <div key={idx} className="flex items-center space-x-1 space-x-reverse">
                      <ArrowUpRight className="w-3 h-3 text-slate-500" />
                      <span>
                        تغییر رتبه {rc.offererId}: {rc.oldRank ? `رتبه ${toPersianDigits(rc.oldRank)}` : 'ورود جدید'} &larr; رتبه {toPersianDigits(rc.newRank)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
