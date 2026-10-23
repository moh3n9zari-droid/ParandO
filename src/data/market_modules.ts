export interface MarketModuleConfig {
  id: string;
  name: string;
  badge: string;
  tenantId: string;
  sellerId: string;
  defaultTitle: string;
  description: string;
  unit: string;
  basePrice: number; // Rial
  minIncrement: number; // Rial
  depositRateBps: number; // 1500 = 15%
  ladderSize: number;
  durationMinutes: number;
}

export const MARKET_MODULES: MarketModuleConfig[] = [
  {
    id: 'gold',
    name: 'طلا و مسکوکات گرانبها',
    badge: 'بورس فلزات و مسکوکات',
    tenantId: 'tenant-gold-bourse',
    sellerId: 'central-bullion-vault',
    defaultTitle: 'بسته ۱۰۰ عددی سکه تمام بهار آزادی (عیار ۹۰۰ رسمی بانک مرکزی)',
    description: 'محموله مسکوکات طلای استاندارد فیزیکی امانی در خزانه با گواهی اصالت و هولوگرام امنیتی',
    unit: '۱۰۰ قطعه (۸۱۳.۶ گرم)',
    basePrice: 42_500_000_000, // 42.5 Billion Rial (~4.25 Billion Toman)
    minIncrement: 250_000_000, // 250 Million Rial
    depositRateBps: 1500, // 15%
    ladderSize: 5,
    durationMinutes: 120,
  },
  {
    id: 'petrochemicals',
    name: 'پتروشیمی و فرآورده‌های پلیمری',
    badge: 'بورس انرژی و پلیمر',
    tenantId: 'tenant-energy-bourse',
    sellerId: 'persian-petrochem-corp',
    defaultTitle: '۲۰۰ تن پلی‌اتیلن سنگین فیلم (HDPE Film Grade 7000F)',
    description: 'عرضه مستقیم پلیمر صادراتی تحویل درب مجتمع پتروشیمی همراه با اظهارنامه گمرکی رسمی',
    unit: '۲۰۰ تن متریک',
    basePrice: 85_000_000_000,
    minIncrement: 500_000_000,
    depositRateBps: 1500,
    ladderSize: 4,
    durationMinutes: 90,
  },
  {
    id: 'automotive',
    name: 'خودرو و ناوگان تجاری سنگین',
    badge: 'ناوگان لجستیک و ترابری',
    tenantId: 'tenant-automotive-hub',
    sellerId: 'national-fleet-liquidators',
    defaultTitle: 'دسته ۴ دستگاه کشنده سنگین ترانزیتی صفر کیلومتر (استاندارد یورو ۶)',
    description: 'کامیون‌های کشنده ترانزیتی تجاری دارای کارت سوخت، پلاک ملی و ضمانت‌نامه رسمی شرکتی',
    unit: 'دسته ۴ دستگاهی',
    basePrice: 120_000_000_000,
    minIncrement: 1_000_000_000,
    depositRateBps: 1500,
    ladderSize: 3,
    durationMinutes: 60,
  },
  {
    id: 'real_estate',
    name: 'املاک و اراضی دولتی',
    badge: 'املاک تجاری و لجستیک',
    tenantId: 'tenant-realty-holding',
    sellerId: 'urban-development-fund',
    defaultTitle: 'مجتمع انبارداری و سوله لجستیکی منطقه آزاد تجاری (۲۵۰۰ مترمربع مسقف)',
    description: 'سند تک‌برگ عرصه و اعیان، برق صنعتی سه‌فاز اختصاصی، خطوط باسکول ۶۰ تنی و دسترسی گمرکی',
    unit: 'سند تک‌برگ شش‌دانگ',
    basePrice: 350_000_000_000,
    minIncrement: 2_500_000_000,
    depositRateBps: 1500,
    ladderSize: 3,
    durationMinutes: 180,
  },
  {
    id: 'agriculture',
    name: 'کشاورزی و اقلام صادراتی',
    badge: 'صادرات غیرنفتی',
    tenantId: 'tenant-agri-commodities',
    sellerId: 'cooperative-agri-union',
    defaultTitle: 'زعفران سوپر نگین صادراتی ممتاز (محموله پلمپ ۱۵۰ کیلوگرمی)',
    description: 'گواهی‌نامه بین‌المللی آنالیز کروسین بالای ۲۵۰، آزمایشگاهی و بسته‌بندی در اتمسفر اصلاح‌شده',
    unit: '۱۵۰ کیلوگرم خالص',
    basePrice: 18_000_000_000,
    minIncrement: 100_000_000,
    depositRateBps: 1500,
    ladderSize: 5,
    durationMinutes: 90,
  },
  {
    id: 'goods',
    name: 'ماشین‌آلات و تجهیزات صنعتی',
    badge: 'کالای سرمایه‌ای تولیدی',
    tenantId: 'tenant-industrial-exchange',
    sellerId: 'advanced-tooling-ltd',
    defaultTitle: 'مرکز ماشین‌کاری دقیق ۵ محوره CNC (سیستم کنترل زیمنس 840D SL)',
    description: 'ماشین ابزار فرز دقیق ۵ محوره با تعویض‌کننده خودکار ابزار و خنک‌کننده پرفشار داخلی',
    unit: '۱ دستگاه کامل آماده‌به‌کار',
    basePrice: 28_000_000_000,
    minIncrement: 200_000_000,
    depositRateBps: 1500,
    ladderSize: 4,
    durationMinutes: 120,
  },
];
