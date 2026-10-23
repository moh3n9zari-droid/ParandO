# سامانه حراج و مزایده ملی پاراندو (ParandO Auction Ecosystem)

> **وضعیت توسعه:** تکمیل و انطباق کامل **اسلایس اول** (Core Kernel Conformance) و **اسلایس دوم** (FastAPI Backend Layer, Persian RTL Localization & National Network Resilience).

---

## ۱. نمای کلی پروژه (Project Overview)
اکوسیستم معاملاتی و حراجی ملی **پاراندو (ParandO)** یک پلتفرم چندمستأجری (Multi-Tenant) دولتی و با حساسیت بالا برای مدیریت انواع بازارهای کالایی و سرمایه‌ای کشور شامل:
1. **طلا و مسکوکات گرانبها** (سکه تمام بهار آزادی استاندارد بانک مرکزی)
2. **پتروشیمی و فرآورده‌های پلیمری** (عرضه بورس انرژی)
3. **خودرو و ناوگان تجاری سنگین** (کشنده‌های ترانزیتی تجاری)
4. **املاک، اراضی و انبارهای مناطق آزاد**
5. **محصولات کشاورزی و اقلام صادراتی** (زعفران سوپر نگین و خشکبار ممتاز)
6. **ماشین‌آلات و تجهیزات صنعتی سرمایه‌ای** (مراکز ماشین‌کاری دقیق ۵ محوره CNC)

---

## ۲. دستاوردهای پیاده‌سازی‌شده در اسلایس دوم (Slice 2 Architecture)

### الف) لایه API و بک‌اند FastAPI (`src/api/`)
- ایجاد ساختار وب‌سرویس RESTful مدرن با **FastAPI** متصل به هسته پایتون `competition_kernel`:
  - `GET /health`: بررسی سلامت سامانه و نسخه تطابق با ADRها.
  - `GET /api/v1/competitions`: فهرست کلیه رقابت‌های فعال و برنامه‌ریزی‌شده.
  - `GET /api/v1/competitions/{id}`: جزئیات رقابت، مشخصات قوانین و بالاترین پیشنهاد.
  - `GET /api/v1/competitions/{id}/ladder`: دریافت جدول رتبه‌بندی نردبان و آستانه ورود (Threshold).
  - `POST /api/v1/competitions/{id}/offers`: ثبت پیشنهاد جدید با بررسی کامل اعتبار و الزامات مالی.
  - `POST /api/v1/proofs` و `GET /api/v1/proofs/{offerer_id}`: ثبت و استعلام گواهی اثبات تضمین مالی در خزانه‌داری (Commitment Guard).
  - `GET /api/v1/events`: دریافت تاریخچه رویدادها و تغییرات لحظه‌ای نردبان (Audit Log).
- **پروتکل تکرارپذیری TR-12 (Idempotency):**
  - در صورت دریافت درخواست با کلید شناسه تکراری و Payload یکسان، نتیجه قبلی با هدر `X-Idempotency-Replay: true` و کد وضعیت HTTP 200 بازگردانده می‌شود.
  - در صورت ارسال همان کلید با مبلغ یا متقاضی متفاوت، پاسخ خطای **`409 Conflict`** صادر می‌گردد.

### ب) بومی‌سازی کامل و پشتیبانی از راست‌چین (Persian RTL Localization)
- واسط کاربری کاملاً منطبق بر زبان فارسی روان و استانداردهای بومی با چیدمان راست‌چین (`dir="rtl"`).
- تایپوگرافی با قلم رسمی وزیرمتن (`Vazirmatn`).
- نمایش دوگانه ارز رسمی کشور: **ریال (IRR)** به عنوان واحد محاسباتی دقیق و بدون اعشار هسته، و **تومان** جهت سهولت خوانایی کاربران.
- تمامی هشدارها، پیام‌های تایید، خطاهای رد پیشنهاد و برچسب‌های نردبان فارسی‌سازی شدند.

### ج) پایداری و تاب‌آوری در شبکه ملی (National Network Resilience)
- ماژول اختصاصی `OfflineResilienceManager` در فرانت‌اند برای مدیریت ارتباط کلاینت با سرور:
  - در صورت قطعی اینترنت بین‌الملل یا نوسانات شبکه ملی، پیشنهادات با کلید یکتای خود در صف محلی امن (`localStorage`) ذخیره می‌شوند.
  - به محض بازیابی اتصال شبکه ملی، پیشنهادات معوق به صورت متوالی و بدون ریسک تکرار (با اتکا به TR-12) به سرور ارسال و نهایی می‌شوند.
  - امکان تست و شبیه‌سازی قطعی ارتباط توسط کلید تعبیه‌شده در نوار بالای سامانه.

### د) تطابق کامل با استانداردهای هسته (ADR Conformance)
- **TR-01 (Vocabulary):** تطبیق کامل واژگان با هسته دامنه (تبدیل Auction به Competition و Bid به Offer).
- **TR-13 (Deterministic Tie-Breaker):** در صورت برابری مبالغ پیشنهادی، تقدم رتبه منحصراً بر مبنای شماره توالی پیشنهاد (`Offer Sequence Number`) تعیین می‌گردد.
- **K-INV-7:** سقف تعهد متقاضی هرگز از موجودی تضمین‌شده فراتر نخواهد رفت (سپرده ودیعه پایه ۱۵٪).
- **K-INV-14:** هسته محاسباتی مستقل از I/O بوده و صرفاً گواهی تضمین را از درگاه CommitmentGuard استعلام می‌نماید.

---

## ۳. ساختار مخزن (Repository Tree)
```text
├── src/
│   ├── api/                     # لایه وب‌سرویس FastAPI
│   │   ├── main.py              # برنامه اصلی FastAPI و کنترلرها
│   │   └── schemas.py           # مدل‌های Pydantic درخواست و پاسخ
│   ├── core/                    # هسته محاسباتی ناب (ADR-001)
│   │   ├── competition_kernel.py
│   │   ├── competition_ladder.py
│   │   ├── competition_kernel.ts
│   │   ├── competition_ladder.ts
│   │   └── tests_suite.ts
│   ├── components/              # کامپوننت‌های رابط کاربری فارسی
│   │   ├── Navbar.tsx
│   │   ├── MarketSelector.tsx
│   │   ├── AuctionHeader.tsx
│   │   ├── LadderView.tsx
│   │   ├── BidConsole.tsx
│   │   ├── TransitionsLog.tsx
│   │   ├── CommitmentGuardPanel.tsx
│   │   ├── NetworkResilienceModal.tsx
│   │   └── TestRunnerModal.tsx
│   ├── services/
│   │   └── resilienceQueue.ts   # صف پایداری و تاب‌آوری شبکه ملی
│   ├── data/
│   │   └── market_modules.ts    # تنظیمات ۶ ماژول بازار ملی
│   └── utils/
│       └── formatters.ts        # قالب‌بندی ارز دوگانه ریال/تومان و اعداد فارسی
├── tests/
│   ├── api/
│   │   └── test_fastapi_endpoints.py
│   └── core/
│       ├── test_competition_kernel.py
│       ├── test_competition_ladder.py
│       └── test_kernel_ladder_integration.py
├── requirements.txt             # وابستگی‌های پایتون بک‌اند
├── package.json                 # وابستگی‌های فرانت‌اند React + Vite
└── pytest.ini                   # پیکربندی اجرای آزمون‌های پایتون
```

---

## ۴. راه‌اندازی و اجرای پروژه (How to Run)

### اجرای رابط کاربری فرانت‌اند:
```bash
npm install
npm run dev
```
سامانه فرانت‌اند به نشانی `http://localhost:3000` در دسترس خواهد بود.

### اجرای بک‌اند FastAPI:
```bash
pip install -r requirements.txt
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```
مستندات تعاملی Swagger API به نشانی `http://localhost:8000/docs` قابل مشاهده است.

### اجرای آزمون‌های خودکار:
```bash
pytest -v
```
تمامی **۴۷ آزمون** (شامل تست‌های واحد نردبان، هسته، یکپارچگی و اندپوینت‌های FastAPI) با موفقیت کامل پاس می‌شوند:
```text
======================== 47 passed in 0.78s =========================
```
