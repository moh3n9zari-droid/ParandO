import React from 'react';
import { X, Wifi, WifiOff, RefreshCw, CheckCircle2, ShieldCheck, Database, Trash2 } from 'lucide-react';
import { ResilientOffer } from '../services/resilienceQueue';
import { formatDualCurrency, toPersianDigits } from '../utils/formatters';

interface NetworkResilienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: ResilientOffer[];
  isOnline: boolean;
  isSimulatingDisruption: boolean;
  onToggleDisruption: () => void;
  onFlushQueue: () => void;
  onClearQueue: () => void;
}

export const NetworkResilienceModal: React.FC<NetworkResilienceModalProps> = ({
  isOpen,
  onClose,
  queue,
  isOnline,
  isSimulatingDisruption,
  onToggleDisruption,
  onFlushQueue,
  onClearQueue,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm text-right" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className={`p-2.5 rounded-xl border ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5 text-amber-400" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                مدیریت پایداری ارتباط در شبکه ملی
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${isOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  {isOnline ? 'شبکه متصل و پایدار' : 'حالت آفلاین / نوسان شبکه'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                ذخیره‌سازی امن در صف محلی کلاینت و تضمین عدم مفقودی داده‌ها در قطعی‌های اینترانت
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resilience Toolbar */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 space-x-reverse">
            <button
              onClick={onToggleDisruption}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                isSimulatingDisruption
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
              }`}
            >
              {isSimulatingDisruption ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{isSimulatingDisruption ? 'پایان شبیه‌سازی قطعی' : 'شبیه‌سازی قطعی شبکه ملی'}</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            {queue.length > 0 && (
              <>
                <button
                  onClick={onFlushQueue}
                  disabled={!isOnline}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition cursor-pointer flex items-center gap-1 disabled:opacity-40"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>ارسال فوری صف ({toPersianDigits(queue.length)})</span>
                </button>
                <button
                  onClick={onClearQueue}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-950/30 transition cursor-pointer"
                  title="پاکسازی صف محلی"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Queue Items */}
        <div className="p-5 flex-1 overflow-y-auto space-y-2.5 bg-slate-950/20 text-xs">
          {queue.length === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="text-sm font-semibold text-slate-200">صف ارسال خالی است</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
                تمامی پیشنهادات به سرور مرکزی منتقل و تایید شده‌اند. در صورت قطع شبکه ملی، پیشنهادات ثبت‌شده در این بخش ذخیره می‌شوند.
              </p>
            </div>
          ) : (
            queue.map((item) => (
              <div
                key={item.queueId}
                className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/80 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <span className="font-bold text-white text-sm">{item.offererId}</span>
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.status === 'PENDING' ? 'در انتظار بازیابی شبکه' : item.status}
                    </span>
                    <span className="text-slate-400 text-[11px] font-mono">شناسه: {item.queueId}</span>
                  </div>
                  <div className="mt-1 text-slate-300">
                    مبلغ پیشنهاد: <strong className="text-white font-mono">{formatDualCurrency(item.amount).rial}</strong> ({formatDualCurrency(item.amount).toman})
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    کلید تکرارپذیری TR-12: {item.idempotencyKey}
                  </div>
                </div>

                <div className="text-left text-[11px] text-slate-400">
                  <span>زمان صف‌بندی:</span>
                  <div className="font-mono text-slate-300">{new Date(item.queuedAt).toLocaleTimeString('fa-IR')}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 text-xs text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>پروتکل TR-12 تضمین می‌کند که ارسال مجدد صف محلی هیچ‌گاه تراکنش تکراری ایجاد نخواهد کرد.</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
