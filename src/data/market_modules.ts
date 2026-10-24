export interface MarketModuleConfig {
  id: string;
  name: string;
  badge: string;
  tenantId: string;
  sellerId: string;
  sellerName?: string;
  sellerRating?: number;
  sellerReviewCount?: number;
  sellerVerified?: boolean;
  defaultTitle: string;
  description: string;
  unit: string;
  basePrice: number; // Rial
  reservePrice?: number; // Rial (Reserve threshold)
  minIncrement: number; // Rial
  depositRateBps: number; // 1500 = 15%
  ladderSize: number;
  durationMinutes: number;
  imageUrl: string;
  categoryKey: string;
  tagText: string;
  lotNumber: string;
  location?: string;
  inspectionCert?: string;
  urgent?: boolean;
  specifications?: Array<{ label: string; value: string }>;
}

export const MARKET_MODULES: MarketModuleConfig[] = [
  {
    id: 'gold',
    name: 'طلا و مسکوکات گرانبها',
    badge: 'بورس مسکوکات و شمش',
    tenantId: 'tenant-gold-bourse',
    sellerId: 'central-bullion-vault',
    sellerName: 'خزانه جواهرات و مسکوکات بانک مرکزی',
    sellerRating: 4.98,
    sellerReviewCount: 3820,
    sellerVerified: true,
    defaultTitle: 'بسته ۱۰۰ عددی سکه تمام بهار آزادی (عیار ۹۰۰ رسمی بانک مرکزی با هولوگرام امنیتی)',
    description: 'محموله مسکوکات طلای استاندارد فیزیکی امانی در خزانه شماره ۱ با گواهی پلمپ اصالت عیار ۹۰۰ و هولوگرام لیزری غیرقابل جعل. تحویل فیزیکی فوری در تالار رسمی بورس.',
    unit: '۱۰۰ قطعه (۸۱۳.۶ گرم)',
    basePrice: 42_500_000_000, // 42.5 Billion Rial (~4.25 Billion Toman)
    reservePrice: 44_000_000_000,
    minIncrement: 250_000_000, // 250 Million Rial
    depositRateBps: 1500, // 15%
    ladderSize: 5,
    durationMinutes: 120,
    imageUrl: '/src/assets/images/hero_parando_gold_vault_1792816464740.jpg',
    categoryKey: 'gold',
    tagText: 'حراج فوری طلای شمش',
    lotNumber: 'LOT-GLD-8821',
    location: 'تهران، میدان فردوسی، خزانه مرکزی مسکوکات',
    inspectionCert: 'گواهی پلمپ عیار ۹۰۰ استاندارد ملی ایران شماره IR-GOLD-8821',
    urgent: true,
    specifications: [
      { label: 'عیار استاندارد', value: '۹۰۰ در هزار (۲۱.۶ قیراط رسمی)' },
      { label: 'وزن کل محموله', value: '۸۱۳.۶ گرم شمش مسکوک' },
      { label: 'نوع بسته‌بندی', value: 'پلمپ هولوگرام‌دار هوشمند بانک مرکزی' },
      { label: 'ضمانت اصالت', value: 'تضمین بازخرید رسمی با شناسنامه امنیتی' },
    ],
  },
  {
    id: 'petrochemicals',
    name: 'پتروشیمی و فرآورده‌های پلیمری',
    badge: 'بورس انرژی و پلیمر صادراتی',
    tenantId: 'tenant-energy-bourse',
    sellerId: 'persian-petrochem-corp',
    sellerName: 'هلدینگ صنایع پتروشیمی خلیج فارس',
    sellerRating: 4.94,
    sellerReviewCount: 1580,
    sellerVerified: true,
    defaultTitle: '۲۰۰ تن پلی‌اتیلن سنگین فیلم (HDPE Film Grade 7000F) کیسه ۲۵ کیلوگرمی',
    description: 'عرضه مستقیم پلیمر صادراتی تحویل درب مجتمع پتروشیمی ماهشهر همراه با اظهارنامه گمرکی رسمی، برگه کنترل کیفیت آزمایشگاهی و تاییدیه SGS بین‌المللی.',
    unit: '۲۰۰ تن متریک (۸۰۰۰ کیسه ۲۵ کیلوگرمی)',
    basePrice: 85_000_000_000,
    reservePrice: 88_000_000_000,
    minIncrement: 500_000_000,
    depositRateBps: 1500,
    ladderSize: 4,
    durationMinutes: 90,
    imageUrl: '/src/assets/images/product_petro_polymer_1792816464604.jpg',
    categoryKey: 'petro',
    tagText: 'صادراتی تحویل ماهشهر',
    lotNumber: 'LOT-PET-4091',
    location: 'خوزستان، منطقه ویژه اقتصادی پتروشیمی ماهشهر',
    inspectionCert: 'آنالیز کیفیت شاخص MFI و چگالی آزمایشگاه مرجع شماره PE-7000F-Q',
    urgent: false,
    specifications: [
      { label: 'گرید محصول', value: 'HDPE Film Grade 7000F' },
      { label: 'شاخص جریان مذاب (MFI)', value: '0.04 - 0.06 g/10min' },
      { label: 'چگالی استاندارد', value: '0.952 g/cm³' },
      { label: 'شرایط تحویل', value: 'FOB اسکله صادراتی یا EXW درب انبار' },
    ],
  },
  {
    id: 'automotive',
    name: 'خودرو و ناوگان تجاری سنگین',
    badge: 'ناوگان لجستیک و ترابری تجاری',
    tenantId: 'tenant-automotive-hub',
    sellerId: 'national-fleet-liquidators',
    sellerName: 'سازمان مدیریت ناوگان حمل‌ونقل جاده‌ای',
    sellerRating: 4.89,
    sellerReviewCount: 940,
    sellerVerified: true,
    defaultTitle: 'دسته ۴ دستگاه کشنده سنگین ترانزیتی صفر کیلومتر (استاندارد آلایندگی یورو ۶)',
    description: 'کامیون‌های کشنده ترانزیتی تجاری دارای کارت سوخت پایه، پلاک ملی، محورهای دیفرانسیل تقویت‌شده و گارانتی رسمی شرکت سازنده همراه با بیمه بدنه و شخص ثالث.',
    unit: 'دسته ۴ دستگاهی صفر کیلومتر',
    basePrice: 120_000_000_000,
    reservePrice: 125_000_000_000,
    minIncrement: 1_000_000_000,
    depositRateBps: 1500,
    ladderSize: 3,
    durationMinutes: 60,
    imageUrl: '/src/assets/images/product_heavy_truck_1792816465253.jpg',
    categoryKey: 'automotive',
    tagText: 'صفر کیلومتر یورو ۶',
    lotNumber: 'LOT-TRK-7712',
    location: 'تهران، پایانه مرکزی لجستیک غرب، سوله ترخیص شماره ۴',
    inspectionCert: 'برگ تاییدیه کارشناسی فنی و سلامت مکانیکی پلیس راهور شماره TRK-9901',
    urgent: true,
    specifications: [
      { label: 'قدرت موتور', value: '۵۰۰ اسب بخار توربودیزل اینترکولر' },
      { label: 'گیربکس', value: 'اتوماتیک ۱۲ سرعته مجهز به ریتاردر هیدرولیکی' },
      { label: 'ظرفیت بار ناخالص (GCW)', value: '۴۴ تن ترانزیت بین‌المللی' },
      { label: 'گارانتی رسمی', value: '۳ سال یا ۳۰۰ هزار کیلومتر شرکتی' },
    ],
  },
  {
    id: 'goods',
    name: 'ماشین‌آلات و تجهیزات صنعتی',
    badge: 'کالای سرمایه‌ای تولید پیشرفته',
    tenantId: 'tenant-industrial-exchange',
    sellerId: 'advanced-tooling-ltd',
    sellerName: 'شرکت صنایع ماشین‌ابزار و قالب‌سازی پیشرو',
    sellerRating: 4.96,
    sellerReviewCount: 710,
    sellerVerified: true,
    defaultTitle: 'مرکز ماشین‌کاری دقیق ۵ محوره CNC (سیستم کنترل دیجیتال زیمنس 840D)',
    description: 'ماشین ابزار فرز دقیق ۵ محوره همزمان مجهز به خط‌کش‌های نوری هایدن‌هاین، تعویض‌کننده خودکار ۳۲ ابزار و خنک‌کننده پرفشار داخلی شفت اسپیندل ۲۰۰۰۰ دور در دقیقه.',
    unit: '۱ دستگاه کامل آماده‌به‌کار با متعلقات',
    basePrice: 28_000_000_000,
    reservePrice: 30_000_000_000,
    minIncrement: 200_000_000,
    depositRateBps: 1500,
    ladderSize: 4,
    durationMinutes: 120,
    imageUrl: '/src/assets/images/product_cnc_machine_1792816465233.jpg',
    categoryKey: 'goods',
    tagText: 'آماده تحویل کارگاهی',
    lotNumber: 'LOT-CNC-9015',
    location: 'اصفهان، شهرک صنعتی مورچه‌خورت، سالن شماره ۱۲',
    inspectionCert: 'گواهی کالیبراسیون لیزری دقت زیر ۳ میکرون سازمان پژوهش‌های علمی شماره CNC-2024',
    urgent: true,
    specifications: [
      { label: 'کورس محورها (X/Y/Z)', value: '600 x 650 x 500 mm' },
      { label: 'سرعت اسپیندل', value: '20,000 RPM مجهز به کولانت داخلی' },
      { label: 'سیستم کنترلر', value: 'Siemens Sinumerik 840D SL Touch' },
      { label: 'دقت موقعیت‌یابی', value: '± 0.003 میلی‌متر (گواهی لیزری)' },
    ],
  },
  {
    id: 'real_estate',
    name: 'املاک و اراضی دولتی',
    badge: 'املاک تجاری و لجستیک',
    tenantId: 'tenant-realty-holding',
    sellerId: 'urban-development-fund',
    sellerName: 'سازمان منطقه آزاد تجاری و صنعتی',
    sellerRating: 4.91,
    sellerReviewCount: 520,
    sellerVerified: true,
    defaultTitle: 'مجتمع انبارداری و سوله لجستیکی منطقه آزاد تجاری (۲۵۰۰ مترمربع عرصه و اعیان)',
    description: 'سند تک‌برگ عرصه و اعیان رسمی، برق صنعتی سه‌فاز اختصاصی ۲۵۰ کیلووات، خطوط باسکول ۶۰ تنی و دسترسی بدون واسطه به اسکله بارگیری و گمرک منطقه آزاد.',
    unit: 'سند تک‌برگ شش‌دانگ مسکونی تجاری',
    basePrice: 350_000_000_000,
    reservePrice: 360_000_000_000,
    minIncrement: 2_500_000_000,
    depositRateBps: 1500,
    ladderSize: 3,
    durationMinutes: 180,
    imageUrl: '/src/assets/images/product_heavy_truck_1792816465253.jpg',
    categoryKey: 'realty',
    tagText: 'سند تک‌برگ عرصه و اعیان',
    lotNumber: 'LOT-EST-1090',
    location: 'منطقه آزاد انزلی، فاز صنعت و تجارت، بلوار لجستیک',
    inspectionCert: 'استعلام ثبتی کاداستر رسمی سازمان ثبت اسناد و املاک شماره CAD-1403-88',
    urgent: false,
    specifications: [
      { label: 'مساحت کل عرصه', value: '۲,۵۰۰ مترمربع سنددار' },
      { label: 'ارتفاع تاج سوله', value: '۱۲ متر استاندارد لیفتراک' },
      { label: 'انشعابات صنعتی', value: 'آب صنعتی، گاز فشار قوی و برق ۲۵۰ کیلووات' },
      { label: 'دسترسی گمرکی', value: 'کمتر از ۵۰۰ متر تا اسکله صادراتی' },
    ],
  },
  {
    id: 'agriculture',
    name: 'کشاورزی و اقلام صادراتی',
    badge: 'صادرات غیرنفتی استاندارد',
    tenantId: 'tenant-agri-commodities',
    sellerId: 'cooperative-agri-union',
    sellerName: 'اتحادیه تعاونی‌های روستایی و صادرات زعفران',
    sellerRating: 4.97,
    sellerReviewCount: 2100,
    sellerVerified: true,
    defaultTitle: 'زعفران سوپر نگین صادراتی ممتاز قائنات (محموله پلمپ آزمایشگاهی ۱۵۰ کیلوگرمی)',
    description: 'گواهی‌نامه بین‌المللی آنالیز کروسین بالای ۲۶۵، آزمایشگاهی بدون هرگونه ماده نگهدارنده یا رنگ غیرطبیعی، بسته‌بندی در قوطی‌های وکیوم اتمسفر اصلاح‌شده نیتروژنی.',
    unit: '۱۵۰ کیلوگرم خالص (بسته‌های ۱ کیلوگرمی)',
    basePrice: 18_000_000_000,
    reservePrice: 19_000_000_000,
    minIncrement: 100_000_000,
    depositRateBps: 1500,
    ladderSize: 5,
    durationMinutes: 90,
    imageUrl: '/src/assets/images/hero_parando_gold_vault_1792816464740.jpg',
    categoryKey: 'agri',
    tagText: 'کروسین بالای ۲۶۵',
    lotNumber: 'LOT-AGR-3304',
    location: 'خراسان جنوبی، سردخانه مرکزی بورس کشاورزی قائنات',
    inspectionCert: 'گواهی آنالیز اسپکتروفتومتری ایزو ۳۶۳۲ آزمایشگاه مرجع شماره SAF-9902',
    urgent: false,
    specifications: [
      { label: 'شاخص رنگ‌دهی (کروسین)', value: '۲۶۸ (استاندارد بین‌المللی گرید یک)' },
      { label: 'شاخص عطر (سافرانال)', value: '۳۸ واحد ممتاز' },
      { label: 'رطوبت باقیمانده', value: 'کمتر از ۶.۵ درصد استاندارد' },
      { label: 'نوع بسته‌بندی', value: 'قوطی‌های فلزی پلمپ گاز نیتروژن' },
    ],
  },
];

