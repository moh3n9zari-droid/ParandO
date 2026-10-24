import React from 'react';
import { ShieldCheck, FileText, Phone, Lock, Scale, Building2, ExternalLink } from 'lucide-react';

export interface FooterProps {
  isDarkTheme?: boolean;
  onOpenDocsModal?: () => void;
  onOpenTestModal?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  isDarkTheme = false,
  onOpenDocsModal,
  onOpenTestModal,
}) => {
  return (
    <footer
      className={`border-t transition-colors duration-200 mt-12 pb-24 md:pb-8 text-xs ${
        isDarkTheme
          ? 'bg-[#121212] border-slate-800 text-slate-400'
          : 'bg-[#1E1E24] border-slate-700 text-slate-300'
      }`}
      dir="rtl"
    >
      {/* Institutional Assurance Strip */}
      <div className="border-b border-slate-800/80 bg-black/30 py-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-center md:text-right">
          <div className="flex items-center justify-center md:justify-start gap-2.5">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white block">ضمانت مالی تعهدات ADR-002</span>
              <span className="text-[11px] text-slate-400">مسدودی خودکار سپرده ۱۵٪ بدون دسترسی به اصل سرمایه</span>
            </div>
          </div>

          <div className="flex items-center justify-center md:justify-start gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white block">هسته محاسباتی ADR-001 و انطباق TR-13</span>
              <span className="text-[11px] text-slate-400">حل عادلانه برابری قیمت با شماره ترتیب ثبت پیشنهاد</span>
            </div>
          </div>

          <div className="flex items-center justify-center md:justify-start gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white block">تسویه رمزنگاری‌شده ADR-003</span>
              <span className="text-[11px] text-slate-400">صدور حواله با شناسه یکتای SHA-256 قابل استعلام ثبتی</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[#FF5000] flex items-center justify-center text-white font-black text-sm">
              پ
            </div>
            <span className="font-extrabold text-base text-white tracking-tight">پرندو</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400 mb-3">
            سامانه حراج و مبادلات چندمستأجری ملی پرندو؛ بستر رسمی برگزاری مزایدات کالایی، اموال مازاد دولتی و تالارهای رقابتی کشور تحت نظارت دیوان محاسبات و شبکه ملی اطلاعات.
          </p>
          <div className="text-[10px] text-slate-500 space-y-1 font-mono">
            <div>پروتکل ارتباطی: WSS / TLS 1.3</div>
            <div>موتور تسویه: ADR-003 / SHA-256</div>
          </div>
        </div>

        <div>
          <h4 className="font-bold text-white mb-3 text-xs flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-orange-400" />
            <span>تالارهای فعال معامله</span>
          </h4>
          <ul className="space-y-2 text-[11px] text-slate-400">
            <li className="hover:text-white transition-colors cursor-pointer">بورس مسکوکات و طلای شمش</li>
            <li className="hover:text-white transition-colors cursor-pointer">تالار فرآورده‌های پتروشیمی و پلیمر</li>
            <li className="hover:text-white transition-colors cursor-pointer">مزایدات ناوگان تجاری و کشنده‌ها</li>
            <li className="hover:text-white transition-colors cursor-pointer">املاک و انبارهای مناطق آزاد</li>
            <li className="hover:text-white transition-colors cursor-pointer">ماشین‌آلات و تجهیزات صنعتی CNC</li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-white mb-3 text-xs flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-orange-400" />
            <span>قوانین و اسناد معماری</span>
          </h4>
          <ul className="space-y-2 text-[11px] text-slate-400">
            <li>
              <button
                onClick={onOpenDocsModal}
                className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>مستندات معماری ADR-001 الی 004</span>
                <ExternalLink className="w-3 h-3 text-slate-500" />
              </button>
            </li>
            <li>
              <button
                onClick={onOpenTestModal}
                className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>کنسول اعتبارسنجی و تست‌های هسته</span>
                <ExternalLink className="w-3 h-3 text-slate-500" />
              </button>
            </li>
            <li className="hover:text-white transition-colors cursor-pointer">دستورالعمل نگهداری ودیعه ۱۵٪ (K-INV-7)</li>
            <li className="hover:text-white transition-colors cursor-pointer">محاسبه کارمزد ۵۰ صدم درصد و مالیات بر ارزش افزوده</li>
            <li className="hover:text-white transition-colors cursor-pointer">شیوه‌نامه حل تعارضات تکرارناپذیری TR-12</li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-white mb-3 text-xs flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-orange-400" />
            <span>پشتیبانی و تماس رسمی</span>
          </h4>
          <div className="space-y-2 text-[11px] text-slate-400">
            <div>
              <span className="block text-slate-500 text-[10px]">مرکز شبانه‌روزی پشتیبانی معاملات:</span>
              <span className="font-bold text-white font-mono text-xs">۰۲۱-۸۸۹۹۰۰۰۰</span>
            </div>
            <div>
              <span className="block text-slate-500 text-[10px]">میز خدمت ناظران دیوان و خزانه‌داری:</span>
              <span className="font-mono text-slate-300">governance@parando.ir</span>
            </div>
            <div>
              <span className="block text-slate-500 text-[10px]">نشانی دبیرخانه:</span>
              <span>تهران، میدان ونک، مجتمع فناوری مالی، طبقه هشتم</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-slate-800/80 pt-4 px-4 sm:px-6 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
        <div>
          © ۱۴۰۳ - تمامی حقوق متعلق به سامانه حراج ملی <strong>پرندو (Parando)</strong> می‌باشد.
        </div>
        <div className="flex items-center gap-4">
          <span className="text-emerald-400 font-medium">اتصال پایدار به شبکه ملی اطلاعات (NIN)</span>
          <span className="text-slate-600">|</span>
          <span>نسخه ۲.۴.۰</span>
        </div>
      </div>
    </footer>
  );
};
