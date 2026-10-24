import React from 'react';
import {
  Flame,
  ArrowLeft,
  ShieldCheck,
  Timer,
  Sparkles,
  Zap,
  Building2,
  TrendingUp,
} from 'lucide-react';
import { formatDuration, toPersianDigits } from '../utils/formatters';

export interface HeroBannerProps {
  currentTime: Date;
  onExploreLive: () => void;
  onOpenEscrowInfo: () => void;
  isDarkTheme?: boolean;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  currentTime,
  onExploreLive,
  onOpenEscrowInfo,
  isDarkTheme = false,
}) => {
  // Simulate daily auction clearance window: closes at 18:00 today or +3 hours
  const targetEnd = new Date(currentTime);
  targetEnd.setHours(20, 0, 0, 0);
  const remainingMs = Math.max(0, targetEnd.getTime() - currentTime.getTime());

  return (
    <section className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-lg border border-orange-500/20 my-3">
      {/* Background Graphic & High-Impact Visual Asset */}
      <div className="relative min-h-[300px] sm:min-h-[360px] lg:min-h-[400px] w-full flex items-center overflow-hidden bg-slate-950">
        <img
          src="/src/assets/images/hero_parando_auction_banner_1792814343469.jpg"
          alt="حراج سراسری دارایی‌ها و مسکوکات دولتی پرندو"
          className="absolute inset-0 w-full h-full object-cover object-center scale-100 sm:scale-105 transition-transform duration-700"
          referrerPolicy="no-referrer"
        />

        {/* Dynamic Dark Gradient Scrim for WCAG AA readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/40" />

        {/* Content Container */}
        <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-10 py-8 flex flex-col justify-between h-full w-full">
          {/* Top Kicker & Live Countdown Timer Badge */}
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide bg-[#fb7701] text-white shadow-md flex items-center gap-1.5">
              <Flame className="w-4 h-4 fill-current animate-pulse text-yellow-300" />
              <span>جشنواره سراسری عرضه دارایی‌های دولتی</span>
            </span>

            {/* Countdown Badge matching Temu reference */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-black/60 text-amber-300 border border-amber-500/30 backdrop-blur-md">
              <Timer className="w-3.5 h-3.5 text-amber-400" />
              <span>پایان رقابت تالار امروز:</span>
              <span className="font-mono text-white tracking-widest text-sm font-black">
                {formatDuration(remainingMs)}
              </span>
            </div>
          </div>

          {/* Headline & Value Proposition */}
          <div className="max-w-2xl space-y-2.5 mb-5">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-md">
              عرضه مستقیم مسکوکات، انرژی و ترابری در <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-400">حراج ملی پرندو</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
              با قیمت‌های پایه کارشناسی رسمی، ودیعه امانی ۱۵٪ خزانه‌داری و الگوریتم تقدم توالی TR-13 بدون ریسک تداخل پیشنهاد.
            </p>
          </div>

          {/* CTAs and Institutional Guarantees */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={onExploreLive}
              className="py-3 px-6 rounded-xl text-xs sm:text-sm font-black bg-[#fb7701] hover:bg-orange-600 text-white shadow-lg shadow-orange-600/30 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>ورود به تالار حراج زنده و ثبت پیشنهاد</span>
              <ArrowLeft className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenEscrowInfo}
              className="py-3 px-5 rounded-xl text-xs sm:text-sm font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>راهنمای سپرده تضمینی (ADR-002)</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
