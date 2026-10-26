import React, { useState } from 'react';
import {
  ArrowRight,
  ShieldCheck,
  Building,
  MapPin,
  FileCheck2,
  Download,
  Star,
  Clock,
  Flame,
  Award,
  Zap,
  CheckCircle2,
  Scale,
  Eye,
  Heart,
  Share2,
  Lock,
  ExternalLink,
  ChevronLeft,
  Info,
} from 'lucide-react';
import { MarketModuleConfig } from '../data/market_modules';
import { Competition, Offer } from '../core/competition_kernel';
import { PriceLadderWidget } from './PriceLadderWidget';
import { formatDualCurrency, formatDuration, formatTimestamp, toPersianDigits } from '../utils/formatters';

export interface AuctionDetailViewProps {
  module: MarketModuleConfig;
  competition: Competition;
  currentTime: Date;
  onBack: () => void;
  onOpenQuickBid: (module: MarketModuleConfig) => void;
  isDarkTheme?: boolean;
  isLiveConnected?: boolean;
  isWatchlisted?: boolean;
  onToggleWatchlist?: (id: string) => void;
}

export const AuctionDetailView: React.FC<AuctionDetailViewProps> = ({
  module,
  competition,
  currentTime,
  onBack,
  onOpenQuickBid,
  isDarkTheme = false,
  isLiveConnected = true,
  isWatchlisted = false,
  onToggleWatchlist,
}) => {
  const [activeTab, setActiveTab] = useState<'specs' | 'inspection' | 'seller' | 'terms'>('specs');
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const timeLeftMs = Math.max(0, competition.endsAt.getTime() - currentTime.getTime());
  const isFinalFiveMinutes = timeLeftMs > 0 && timeLeftMs < 5 * 60 * 1000;

  const highestOffer = competition.highestOffer;
  const currentPrice = highestOffer ? highestOffer.amount : module.basePrice;
  const priceDual = formatDualCurrency(currentPrice);
  const basePriceDual = formatDualCurrency(module.basePrice);
  const minIncrementDual = formatDualCurrency(module.minIncrement);

  const reserveThreshold = module.reservePrice || module.basePrice * 1.05;
  const isReserveMet = currentPrice >= reserveThreshold;

  const depositRateBps = module.depositRateBps || 1500;
  const requiredExposure = Math.ceil((currentPrice * depositRateBps) / 10000);
  const exposureDual = formatDualCurrency(requiredExposure);

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6" dir="rtl">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-[#FF5000] transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به تالار حراج‌ها</span>
        </button>

        <div className="flex items-center gap-2">
          {onToggleWatchlist && (
            <button
              onClick={() => onToggleWatchlist(module.id)}
              className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                isWatchlisted
                  ? 'bg-red-500/10 border-red-500/30 text-red-500'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Heart className={`w-4 h-4 ${isWatchlisted ? 'fill-current' : ''}`} />
              <span className="hidden sm:inline">{isWatchlisted ? 'در فهرست پیگیری' : 'افزودن به پیگیری'}</span>
            </button>
          )}

          <button
            onClick={handleShare}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer text-xs font-bold flex items-center gap-1.5"
            title="اشتراک‌گذاری شناسه حراج"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">{copiedLink ? 'کپی شد!' : 'اشتراک‌گذاری'}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Media Gallery, Inspection & Technical Specs (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Visual Display */}
          <div className="rounded-2xl overflow-hidden border border-[#E5E7EB] dark:border-slate-800 bg-white dark:bg-[#1E1E24] shadow-sm">
            <div className="relative aspect-16/10 w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
              <img
                src={module.imageUrl}
                alt={module.defaultTitle}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />

              {/* Floating Badges */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FF5000] text-white shadow-md">
                  {module.badge}
                </span>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md shadow-md ${
                    isReserveMet
                      ? 'bg-[#00A86B] text-white'
                      : 'bg-amber-500 text-slate-950'
                  }`}
                >
                  {isReserveMet ? 'قیمت رزرو محقق شد' : 'رزرو محقق نشده'}
                </span>
              </div>

              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-black/80 text-white font-mono backdrop-blur-md">
                  شناسه لات: {module.lotNumber}
                </span>
              </div>
            </div>

            {/* Quick Title & Location Bar */}
            <div className="p-4 sm:p-5">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight mb-3">
                {module.defaultTitle}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                {module.location && (
                  <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <MapPin className="w-4 h-4 text-[#FF5000]" />
                    <span>محل استقرار: {module.location}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 font-mono">
                  <Building className="w-4 h-4 text-slate-400" />
                  <span>واحد عرضه: {module.unit}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Inspection Report & Technical Certificate Banner */}
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#00A86B] text-white shrink-0">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  شناسنامه بازرسی فنی و گواهی اصالت استاندارد
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                  {module.inspectionCert || 'دارای برگه رسمی کارشناسی اصالت، کاداستر ثبتی و استاندارد ملی ایران'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsInspectionModalOpen(true)}
              className="py-1.5 px-3 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-[#00A86B] border border-[#00A86B]/40 hover:bg-emerald-50 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>مشاهده گواهی</span>
            </button>
          </div>

          {/* Structured Detail Tabs (Specifications, Inspection, Seller, Terms) */}
          <div className="rounded-2xl border border-[#E5E7EB] dark:border-slate-800 bg-white dark:bg-[#1E1E24] p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 mb-4 overflow-x-auto scrollbar-none">
              {(
                [
                  { id: 'specs', label: 'مشخصات فنی و مقادیر' },
                  { id: 'inspection', label: 'ضوابط بازرسی و اصالت' },
                  { id: 'seller', label: 'اطلاعات فروشنده دولتی' },
                  { id: 'terms', label: 'شرایط تسویه و تحویل' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-[#FF5000] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            {activeTab === 'specs' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {module.description}
                </p>

                {module.specifications && module.specifications.length > 0 && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mt-4">
                    <table className="w-full text-xs">
                      <tbody>
                        {module.specifications.map((spec, i) => (
                          <tr
                            key={i}
                            className={i % 2 === 0 ? 'bg-slate-50/70 dark:bg-slate-900/40' : 'bg-transparent'}
                          >
                            <td className="p-3 font-semibold text-slate-500 dark:text-slate-400 w-1/3 border-b border-slate-200/60 dark:border-slate-800">
                              {spec.label}
                            </td>
                            <td className="p-3 font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200/60 dark:border-slate-800">
                              {spec.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'inspection' && (
              <div className="space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  <ShieldCheck className="w-5 h-5 text-[#00A86B] shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-900 dark:text-white mb-1">
                      صحت‌سنجی فیزیکی و آزمایشگاهی قبل از عرضه
                    </h5>
                    <p>
                      تمام اقلام عرضه شده در سامانه پرندو پیش از درج در تالار مزایده، توسط کارشناسان رسمی دادگستری و سازمان ملی استاندارد ارزیابی شده و گواهی سلامت دریافت کرده‌اند.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 font-mono text-[11px]">
                  <div>مرجع صادرکننده: {module.inspectionCert || 'سازمان بازرسی کیفیت و استاندارد ایران'}</div>
                  <div>وضعیت پلمپ: پلمپ هولوگرام‌دار لیزری دست‌نخورده در انبار مرکزی</div>
                  <div>مهلت ارزیابی حضوری: تا ۲۴ ساعت قبل از بسته شدن نهایی حراج</div>
                </div>
              </div>
            )}

            {activeTab === 'seller' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#121212] text-white flex items-center justify-center font-black text-lg">
                      {module.sellerName ? module.sellerName[0] : 'ف'}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {module.sellerName || 'سازمان اموال تملیکی و خزانه‌داری'}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
                        <span className="flex items-center gap-1 text-amber-500 font-bold">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span>{toPersianDigits(module.sellerRating || 4.95)}</span>
                        </span>
                        <span>({toPersianDigits(module.sellerReviewCount || 1200)} مزایده موفق)</span>
                        <span className="text-emerald-500 font-bold">تاییدیه رسمی دولتی</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p>شناسه مستأجر تالار (Tenant ID): <strong className="font-mono text-slate-800 dark:text-slate-200">{module.tenantId}</strong></p>
                  <p>کد فروشنده ثبت‌شده: <strong className="font-mono text-slate-800 dark:text-slate-200">{module.sellerId}</strong></p>
                </div>
              </div>
            )}

            {activeTab === 'terms' && (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-slate-800 dark:text-amber-200">
                  <strong>قانون ADR-003 و آزادسازی وثایق:</strong>
                  <p className="mt-1">
                    بلافاصله پس از بسته شدن حراج و تعیین بالاترین رتبه، ودیعه ۱۵٪ مشارکت‌کنندگان مغلوب بدون کسر هیچ هزینه‌ای در کسری از ثانیه آزاد می‌شود.
                  </p>
                </div>

                <ul className="list-disc pr-5 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <li>مهلت تسویه نهایی برنده: ۳ روز کاری از زمان صدور حواله رسمی SHA-256</li>
                  <li>کارمزد پلتفرم: ۵۰ صدم درصد (50 bps) محاسبه روی مبلغ کشف شده</li>
                  <li>تحویل فیزیکی کالا: حداکثر ظرف ۴۸ ساعت پس از تایید واریزی خزانه‌داری</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Pricing Box, Timer & Price Ladder Widget (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Main Action Bidding Box */}
          <div className="rounded-2xl border border-[#E5E7EB] dark:border-slate-800 bg-white dark:bg-[#1E1E24] p-5 shadow-sm space-y-4">
            {/* Live Timer Strip */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between ${
                isFinalFiveMinutes
                  ? 'bg-[#D32F2F]/10 border-[#D32F2F]/40 text-[#D32F2F]'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${isFinalFiveMinutes ? 'text-[#D32F2F] animate-pulse' : 'text-[#FF5000]'}`} />
                <span className="text-xs font-bold">زمان باقیمانده تا پایان مزایده:</span>
              </div>
              <span className="font-black text-sm font-tnum tracking-tight">
                {formatDuration(timeLeftMs)}
              </span>
            </div>

            {/* Price Information */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>{highestOffer ? 'آخرین پیشنهاد برتر (Clearing):' : 'قیمت پایه حراج:'}</span>
                <span className="font-mono">گام: {minIncrementDual.toman}</span>
              </div>

              <div className="text-2xl sm:text-3xl font-black text-[#00A86B] font-tnum">
                {priceDual.toman}
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                {priceDual.rial}
              </div>
            </div>

            {/* Financial Requirements (15% Escrow Hold - ADR-002) */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">سپرده الزامی ۱۵٪ مسدودی:</span>
                <span className="font-bold text-slate-900 dark:text-white font-tnum">{exposureDual.toman}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>کارمزد پلتفرم (۵۰ صدم درصد):</span>
                <span className="font-mono font-bold">
                  {formatDualCurrency(Math.floor((currentPrice * 50) / 10000)).toman}
                </span>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              onClick={() => onOpenQuickBid(module)}
              className="w-full py-3.5 px-4 rounded-full text-sm font-black bg-[#FF5000] hover:bg-[#E64A00] text-white shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>ثبت پیشنهاد در نردبان زنده</span>
            </button>
          </div>

          {/* Real-time Price Ladder Widget */}
          <PriceLadderWidget
            ladder={competition.ladder}
            ladderSize={competition.ladderSize}
            basePrice={module.basePrice}
            isDarkTheme={isDarkTheme}
            competitionId={competition.competitionId}
            isLiveConnected={isLiveConnected}
            onQuickBidClick={() => onOpenQuickBid(module)}
            depositRateBps={module.depositRateBps}
          />
        </div>
      </div>

      {/* Official Inspection Certificate Modal Viewer */}
      {isInspectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#1E1E24] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#00A86B]" />
                <h3 className="font-bold text-sm sm:text-base">برگه رسمی ارزیابی و استعلام اصالت</h3>
              </div>
              <button
                onClick={() => setIsInspectionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border font-mono space-y-1">
                <div>شماره ثبت ممیزی: REG-IR-2024-8841</div>
                <div>شناسه اموال دولتی: {module.lotNumber}</div>
                <div>مرجع ارزیاب: هیئت کارشناسان رسمی دادگستری و سازمان استاندارد</div>
                <div>نتیجه تست آزمایشگاهی: مطابقت ۱۰۰٪ با گرید استاندارد صادراتی</div>
              </div>
              <p>
                این سند به منزله تضمین قانونی کیفیت، مالکیت بلامانع و سلامت فیزیکی کالای عرضه شده در سامانه حراج ملی پرندو می‌باشد.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setIsInspectionModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                بستن
              </button>
              <button
                onClick={() => {
                  alert('فایل پی‌دی‌اف گواهی اصالت با امضای دیجیتال دانلود شد.');
                  setIsInspectionModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#FF5000] text-white flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>دریافت فایل PDF گواهی</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
