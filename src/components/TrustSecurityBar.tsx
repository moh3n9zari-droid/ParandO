import React from 'react';
import {
  ShieldCheck,
  Lock,
  RotateCcw,
  FileCheck2,
  CheckCircle2,
  Award,
} from 'lucide-react';

export interface TrustSecurityBarProps {
  isDarkTheme?: boolean;
}

export const TrustSecurityBar: React.FC<TrustSecurityBarProps> = ({ isDarkTheme = false }) => {
  const trustItems = [
    {
      icon: Lock,
      title: 'حریم خصوصی و عدم افشای هویت',
      desc: 'حفظ محرمانگی کامل شرکت‌کنندگان تا پایان رقابت',
    },
    {
      icon: ShieldCheck,
      title: 'حساب امانی ودیعه ۱۵٪ (K-INV-7)',
      desc: 'سپرده مسدودی تحت نظارت خزانه‌داری رسمی',
    },
    {
      icon: RotateCcw,
      title: 'استرداد آنی ودیعه مغلوبین',
      desc: 'آزادسازی خودکار بلافاصله پس از تعیین نتیجه نردبان',
    },
    {
      icon: FileCheck2,
      title: 'حواله رسمی تسویه با هش SHA-256',
      desc: 'انطباق ۱۰۰٪ با موازین قانونی و محاسباتی ADR-003',
    },
  ];

  return (
    <div
      className={`w-full rounded-2xl border p-3.5 sm:p-4 my-3 transition-colors ${
        isDarkTheme
          ? 'bg-slate-900/80 border-slate-800 text-slate-200'
          : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950'
      }`}
    >
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {trustItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="flex items-start gap-2.5">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  isDarkTheme
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-emerald-600 text-white shadow-xs'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <h4 className="font-extrabold text-xs sm:text-sm tracking-tight leading-snug">
                  {item.title}
                </h4>
                <p
                  className={`text-[11px] leading-relaxed line-clamp-1 ${
                    isDarkTheme ? 'text-slate-400' : 'text-emerald-800/80'
                  }`}
                >
                  {item.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
