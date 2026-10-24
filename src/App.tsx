import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Competition,
  CompetitionRules,
  CompetitionStatus,
  Offerer,
  CommitmentGuard,
  CommitmentProof,
  FixedClock,
  submitOffer,
  CompetitionError,
  SubmitOfferCommand,
  SubmitOfferResult,
} from './core/competition_kernel';
import { MARKET_MODULES, MarketModuleConfig } from './data/market_modules';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { TrustSecurityBar } from './components/TrustSecurityBar';
import { CategoryPills } from './components/CategoryPills';
import { AuctionGrid } from './components/AuctionGrid';
import { BottomNav, NavTab } from './components/BottomNav';
import { PriceLadderWidget } from './components/PriceLadderWidget';
import { QuickBidModal } from './components/QuickBidModal';
import { SettlementDashboard } from './components/SettlementDashboard';
import { CommitmentGuardPanel } from './components/CommitmentGuardPanel';
import { TransitionsLog, AuditEvent } from './components/TransitionsLog';
import { TestRunnerModal } from './components/TestRunnerModal';
import { ArchitectureInfoModal } from './components/ArchitectureInfoModal';
import { NetworkResilienceModal } from './components/NetworkResilienceModal';
import { OfflineResilienceManager, ResilientOffer } from './services/resilienceQueue';
import { formatDualCurrency, formatTimestamp, toPersianDigits } from './utils/formatters';
import {
  Play,
  Pause,
  AlertCircle,
  TrendingUp,
  FileText,
  Server,
  Building2,
  Coins,
  Flame,
  Truck,
  Wheat,
  Cpu,
  ChevronRight,
  ShieldCheck,
  Lock,
  Headphones,
  FileCheck2,
} from 'lucide-react';

export function App() {
  // Navigation & Theme
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
    const saved = localStorage.getItem('parando_theme');
    return saved === 'dark';
  });

  const handleToggleTheme = () => {
    setIsDarkTheme((prev) => {
      const next = !prev;
      localStorage.setItem('parando_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Active Market Module & Competition
  const [currentModule, setCurrentModule] = useState<MarketModuleConfig>(MARKET_MODULES[0]);

  // Simulation Clock
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [isClockRunning, setIsClockRunning] = useState<boolean>(true);

  // Modals state
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState<boolean>(false);
  const [isResilienceModalOpen, setIsResilienceModalOpen] = useState<boolean>(false);

  // Quick Bid Bottom Sheet Modal
  const [isQuickBidOpen, setIsQuickBidOpen] = useState<boolean>(false);
  const [quickBidTarget, setQuickBidTarget] = useState<MarketModuleConfig>(MARKET_MODULES[0]);

  // Simulated Live Competing Bot Activity
  const [isBotSimRunning, setIsBotSimRunning] = useState<boolean>(false);

  // National Network Resilience Queue State
  const resilienceManager = useMemo(() => OfflineResilienceManager.getInstance(), []);
  const [pendingQueue, setPendingQueue] = useState<ResilientOffer[]>([]);
  const [isSimulatingDisruption, setIsSimulatingDisruption] = useState<boolean>(false);
  const isOnline = !isSimulatingDisruption;

  useEffect(() => {
    const unsub = resilienceManager.subscribe((q, isSim) => {
      setPendingQueue(q);
      setIsSimulatingDisruption(isSim);
    });
    return unsub;
  }, [resilienceManager]);

  // Initialize Competition based on Market Module (TR-01)
  const createInitialCompetition = useCallback((mod: MarketModuleConfig, baseTime: Date) => {
    const rules = new CompetitionRules(mod.basePrice, mod.minIncrement, mod.depositRateBps);
    return new Competition({
      competitionId: `COMP-${mod.id.toUpperCase()}-001`,
      tenantId: mod.tenantId,
      sellerId: mod.sellerId,
      rules,
      startsAt: new Date(baseTime.getTime() - 15 * 60 * 1000),
      endsAt: new Date(baseTime.getTime() + mod.durationMinutes * 60 * 1000),
      status: CompetitionStatus.ACTIVE,
      ladderSize: mod.ladderSize,
    });
  }, []);

  const [competition, setCompetition] = useState<Competition>(() =>
    createInitialCompetition(MARKET_MODULES[0], currentTime)
  );

  // Offerers pool
  const [offerers, setOfferers] = useState<Offerer[]>([
    { offererId: 'offerer-alpha', tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
    { offererId: 'offerer-beta', tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
    { offererId: 'offerer-gamma', tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
    { offererId: 'offerer-low-funds', tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
    { offererId: 'offerer-foreign-tenant', tenantId: 'foreign-tenant-xyz', isEligible: true },
    { offererId: 'offerer-ineligible', tenantId: MARKET_MODULES[0].tenantId, isEligible: false },
    { offererId: MARKET_MODULES[0].sellerId, tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
  ]);

  const [activeOfferer, setActiveOfferer] = useState<Offerer>(offerers[0]);

  // Commitment Proofs in Financial Ledger
  const [proofs, setProofs] = useState<CommitmentProof[]>([
    {
      offererId: 'offerer-alpha',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 200_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      offererId: 'offerer-beta',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 250_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      offererId: 'offerer-gamma',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 150_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      offererId: 'offerer-low-funds',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 500_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      offererId: 'offerer-foreign-tenant',
      tenantId: 'foreign-tenant-xyz',
      guaranteedAmount: 100_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      offererId: 'offerer-ineligible',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 100_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      offererId: MARKET_MODULES[0].sellerId,
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 100_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
  ]);

  const guard = useMemo<CommitmentGuard>(() => {
    return {
      getProof(offererId: string, tenantId: string): CommitmentProof | null {
        const found = proofs.find((p) => p.offererId === offererId && p.tenantId === tenantId);
        return found || null;
      },
    };
  }, [proofs]);

  // TR-12 Idempotency Store
  const [seenRecords, setSeenRecords] = useState<Map<string, { command: SubmitOfferCommand; result: SubmitOfferResult }>>(
    new Map()
  );

  // Audit Events
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  // Clock interval
  useEffect(() => {
    if (!isClockRunning) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => new Date(prev.getTime() + 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isClockRunning]);

  // Market Switch
  const handleSelectModule = (mod: MarketModuleConfig) => {
    setCurrentModule(mod);
    const newComp = createInitialCompetition(mod, currentTime);
    setCompetition(newComp);

    const updatedOfferers: Offerer[] = [
      { offererId: 'offerer-alpha', tenantId: mod.tenantId, isEligible: true },
      { offererId: 'offerer-beta', tenantId: mod.tenantId, isEligible: true },
      { offererId: 'offerer-gamma', tenantId: mod.tenantId, isEligible: true },
      { offererId: 'offerer-low-funds', tenantId: mod.tenantId, isEligible: true },
      { offererId: 'offerer-foreign-tenant', tenantId: 'foreign-tenant-xyz', isEligible: true },
      { offererId: 'offerer-ineligible', tenantId: mod.tenantId, isEligible: false },
      { offererId: mod.sellerId, tenantId: mod.tenantId, isEligible: true },
    ];
    setOfferers(updatedOfferers);
    setActiveOfferer(updatedOfferers[0]);

    const updatedProofs: CommitmentProof[] = [
      { offererId: 'offerer-alpha', tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2.5, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-beta', tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2.5, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-gamma', tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2.5, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-low-funds', tenantId: mod.tenantId, guaranteedAmount: 10_000, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-foreign-tenant', tenantId: 'foreign-tenant-xyz', guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-ineligible', tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: mod.sellerId, tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
    ];
    setProofs(updatedProofs);
    setLastError(null);
    setLastSuccess(`نمای زنده به بازار «${mod.name}» منتقل شد.`);
  };

  const handleOpenQuickBid = (mod: MarketModuleConfig) => {
    if (mod.id !== currentModule.id) {
      handleSelectModule(mod);
    }
    setQuickBidTarget(mod);
    setIsQuickBidOpen(true);
  };

  const handleCardClick = (mod: MarketModuleConfig) => {
    if (mod.id !== currentModule.id) {
      handleSelectModule(mod);
    }
    setActiveTab('live');
  };

  // Submit Offer through pure kernel with TR-01, TR-12, TR-13, and National Network Resilience
  const handleSubmitOffer = (
    amount: number,
    customIdempotencyKey?: string,
    expectedVersion?: number | null
  ) => {
    setLastError(null);
    setLastSuccess(null);

    const idempotencyKey =
      customIdempotencyKey ||
      `idem-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const offerId = `offer-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    // National Network Resilience Check: If offline / simulated disruption
    if (!resilienceManager.isOnline()) {
      resilienceManager.enqueue({
        competitionId: competition.competitionId,
        offererId: activeOfferer.offererId,
        tenantId: activeOfferer.tenantId,
        amount,
        idempotencyKey,
        expectedVersion,
      });

      setLastSuccess(
        `پایداری شبکه ملی: به علت نوسان ارتباط، پیشنهاد با مبلغ ${formatDualCurrency(amount).rial} در صف محلی ذخیره شد.`
      );
      return;
    }

    const clock = new FixedClock(currentTime);
    const isReplay = seenRecords.has(idempotencyKey);

    try {
      const result = submitOffer(
        competition,
        {
          competitionId: competition.competitionId,
          offerer: activeOfferer,
          amount,
          offerId,
          idempotencyKey,
          expectedVersion,
        },
        guard,
        clock,
        seenRecords
      );

      setCompetition(result.competition);

      const newEvent: AuditEvent = {
        id: `evt-${Date.now()}-${Math.random()}`,
        timestamp: currentTime,
        offerId: result.offer.offerId,
        offererId: activeOfferer.offererId,
        amount,
        type: isReplay ? 'REPLAY' : 'ACCEPTED',
        rank: result.rank,
        transitions: result.transitions,
        rankChanges: result.rankChanges,
      };

      setAuditEvents((prev) => [newEvent, ...prev]);

      if (isReplay) {
        setLastSuccess(
          `پاسخ تکرارپذیر TR-12: کلید «${idempotencyKey}» مطابقت داشت؛ نتیجه قبلی (رتبه ${toPersianDigits(result.rank)}) بدون اجرای تکراری بازگردانده شد.`
        );
      } else {
        setLastSuccess(
          `پیشنهاد در رتبه ${toPersianDigits(result.rank)} ثبت شد (${formatDualCurrency(amount).rial})! ترتیب TR-13: #${toPersianDigits(result.offer.sequence)}، نسخه v${toPersianDigits(result.competition.version)}.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof CompetitionError ? (err as CompetitionError).code : 'ERROR';

      const rejectedEvent: AuditEvent = {
        id: `evt-reject-${Date.now()}-${Math.random()}`,
        timestamp: currentTime,
        offerId,
        offererId: activeOfferer.offererId,
        amount,
        type: 'REJECTED',
        reason: `${code}: ${msg}`,
        transitions: [],
        rankChanges: [],
      };

      setAuditEvents((prev) => [rejectedEvent, ...prev]);
      setLastError(`${code}: ${msg}`);
    }
  };

  // Bot Simulation: Trigger simulated competing participant bid
  const handleSimulateBotBid = useCallback(() => {
    const candidateBots = offerers.filter(
      (o) => o.offererId !== activeOfferer.offererId && o.offererId !== currentModule.sellerId && o.isEligible
    );
    if (candidateBots.length === 0) return;
    const randomBot = candidateBots[Math.floor(Math.random() * candidateBots.length)];

    const highestAmt = competition.highestOffer ? competition.highestOffer.amount : currentModule.basePrice;
    const newAmt = highestAmt + currentModule.minIncrement;

    const clock = new FixedClock(currentTime);
    const offerId = `offer-bot-${Date.now().toString(36)}`;
    const idempotencyKey = `idem-bot-${Date.now().toString(36)}`;

    try {
      const res = submitOffer(
        competition,
        {
          competitionId: competition.competitionId,
          offerer: randomBot,
          amount: newAmt,
          offerId,
          idempotencyKey,
        },
        guard,
        clock,
        seenRecords
      );

      setCompetition(res.competition);
      setAuditEvents((prev) => [
        {
          id: `evt-bot-${Date.now()}`,
          timestamp: currentTime,
          offerId,
          offererId: randomBot.offererId,
          amount: newAmt,
          type: 'ACCEPTED',
          rank: res.rank,
          transitions: res.transitions,
          rankChanges: res.rankChanges,
        },
        ...prev,
      ]);
      setLastSuccess(`پیشنهاد زنده جدید از رقیب ${randomBot.offererId} در رتبه ${toPersianDigits(res.rank)} ثبت شد!`);
    } catch {
      // Ignore simulated bot errors
    }
  }, [activeOfferer.offererId, competition, currentModule, currentTime, guard, offerers, seenRecords]);

  // Periodic bot bids if active
  useEffect(() => {
    if (!isBotSimRunning) return;
    const interval = setInterval(() => {
      handleSimulateBotBid();
    }, 4500);
    return () => clearInterval(interval);
  }, [isBotSimRunning, handleSimulateBotBid]);

  // Settlement execution (ADR-003)
  const handleSettleCompetition = () => {
    setCompetition(
      new Competition({
        competitionId: competition.competitionId,
        tenantId: competition.tenantId,
        sellerId: competition.sellerId,
        rules: competition.rules,
        startsAt: competition.startsAt,
        endsAt: currentTime,
        status: CompetitionStatus.CLOSED,
        version: competition.version + 1,
        highestOffer: competition.highestOffer,
        offerCount: competition.offerCount,
        ladderSize: competition.ladderSize,
        ladder: competition.ladder,
      })
    );
    setLastSuccess('تسویه قطعی ADR-003 اجرا گردید: برنده نهایی مشخص و وجوه مسدودی سایرین آزاد شد.');
  };

  // Top Up & Funds
  const handleTopUpFunds = (offererId: string, amount: number) => {
    setProofs((prev) =>
      prev.map((p) =>
        p.offererId === offererId
          ? {
              ...p,
              guaranteedAmount: p.guaranteedAmount + amount,
              validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
            }
          : p
      )
    );
    setLastSuccess(`سپرده تضمین برای ${offererId} افزایش یافت (+${formatDualCurrency(amount).rial})`);
  };

  const handleExpireProof = (offererId: string) => {
    setProofs((prev) =>
      prev.map((p) =>
        p.offererId === offererId
          ? { ...p, validUntil: new Date(currentTime.getTime() - 60_000) }
          : p
      )
    );
    setLastError(`گواهی ضمانت مالی ${offererId} منقضی اعلام گردید.`);
  };

  const handleRestoreProof = (offererId: string) => {
    setProofs((prev) =>
      prev.map((p) =>
        p.offererId === offererId
          ? { ...p, validUntil: new Date(currentTime.getTime() + 3600_000) }
          : p
      )
    );
    setLastSuccess(`گواهی اعتبار مالی ${offererId} به مدت ۱ ساعت تمدید شد.`);
  };

  // Flush pending offline resilience queue when back online
  const handleFlushQueue = () => {
    const queue = resilienceManager.getPendingQueue();
    if (queue.length === 0) return;

    let flushedCount = 0;
    const clock = new FixedClock(currentTime);
    let currentComp = competition;

    for (const item of queue) {
      try {
        const off = offerers.find((o) => o.offererId === item.offererId) || {
          offererId: item.offererId,
          tenantId: item.tenantId,
          isEligible: true,
        };

        const res = submitOffer(
          currentComp,
          {
            competitionId: item.competitionId,
            offerer: off,
            amount: item.amount,
            offerId: `offer-flushed-${Date.now()}`,
            idempotencyKey: item.idempotencyKey,
            expectedVersion: item.expectedVersion,
          },
          guard,
          clock,
          seenRecords
        );

        currentComp = res.competition;
        resilienceManager.markSynced(item.queueId);
        flushedCount += 1;
      } catch (err: unknown) {
        resilienceManager.markFailed(item.queueId, err instanceof Error ? err.message : String(err));
      }
    }

    setCompetition(currentComp);
    setLastSuccess(`همگام‌سازی شبکه ملی: تعداد ${toPersianDigits(flushedCount)} پیشنهاد معوق با موفقیت به هسته مرکزی منتقل شد.`);
  };

  // Filter products by search and category
  const filteredModules = useMemo(() => {
    return MARKET_MODULES.filter((mod) => {
      const matchesCategory = selectedCategory === 'all' || mod.categoryKey === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        mod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mod.defaultTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mod.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mod.lotNumber.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div
      className={`min-h-screen transition-colors duration-200 flex flex-col font-sans select-none pb-20 md:pb-0 ${
        isDarkTheme
          ? 'bg-slate-950 text-slate-100'
          : 'bg-slate-50 text-slate-800'
      }`}
      dir="rtl"
    >
      {/* 1. Desktop & Mobile Header (Temu-Style Top Bar + Orange Brand Row) */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isDarkTheme={isDarkTheme}
        onToggleTheme={handleToggleTheme}
        isOnline={isOnline}
        onOpenResilienceModal={() => setIsResilienceModalOpen(true)}
        pendingQueueCount={pendingQueue.length}
        onNavigateTab={(tab) => setActiveTab(tab)}
        activeTab={activeTab}
        activeOffererId={activeOfferer.offererId}
      />

      {/* 2. Main Body Container (Standard 1440px Desktop Max Width) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 space-y-4">
        {/* Alerts / Feedback Bar */}
        {(lastError || lastSuccess) && (
          <div
            className={`p-3 rounded-2xl border text-xs sm:text-sm font-medium flex items-center justify-between gap-2 shadow-xs transition-all ${
              lastError
                ? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30'
                : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{lastError || lastSuccess}</span>
            </div>
            <button
              onClick={() => {
                setLastError(null);
                setLastSuccess(null);
              }}
              className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
            >
              بستن
            </button>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 1: HOME (Temu-Style Desktop Storefront Experience) */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'home' && (
          <div className="space-y-4">
            {/* Hero Promotional Banner */}
            <HeroBanner
              currentTime={currentTime}
              onExploreLive={() => setActiveTab('live')}
              onOpenEscrowInfo={() => setActiveTab('wallet')}
              isDarkTheme={isDarkTheme}
            />

            {/* Trust & Security Guarantee Bar (Temu-Style Strip) */}
            <TrustSecurityBar isDarkTheme={isDarkTheme} />

            {/* Category Navigation Pills (Explore Your Interests) */}
            <CategoryPills
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              isDarkTheme={isDarkTheme}
            />

            {/* Product & Auction Multi-Column Responsive Grid */}
            <AuctionGrid
              modules={filteredModules}
              currentModuleId={currentModule.id}
              highestOffer={competition.highestOffer}
              ladder={competition.ladder}
              currentTime={currentTime}
              endsAt={competition.endsAt}
              onQuickBid={handleOpenQuickBid}
              onSelectDetails={handleCardClick}
              isDarkTheme={isDarkTheme}
            />
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 2: CATEGORIES (Explorer Grid)                    */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <h2 className="font-black text-base sm:text-lg mb-1">دسته‌بندی‌های تالارهای معاملاتی پرندو</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                بر اساس تالارهای رسمی بورس کالا، بورس انرژی و املاک مازاد دولتی
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
              {[
                { id: 'gold', name: 'طلا، جواهرات و مسکوکات', count: 12, icon: Coins, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                { id: 'petro', name: 'فرآورده‌های پتروشیمی و گاز', count: 8, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                { id: 'automotive', name: 'خودرو و ناوگان تجاری سنگین', count: 5, icon: Truck, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { id: 'realty', name: 'املاک و اراضی سازمان اموال تملیکی', count: 19, icon: Building2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { id: 'agri', name: 'محصولات استراتژیک و صادراتی', count: 7, icon: Wheat, color: 'text-yellow-600', bg: 'bg-yellow-600/10' },
                { id: 'goods', name: 'ماشین‌آلات و خطوط تولید صنعتی', count: 14, icon: Cpu, color: 'text-purple-500', bg: 'bg-purple-500/10' },
              ].map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setActiveTab('home');
                    }}
                    className={`p-5 rounded-2xl border text-right transition-all group flex flex-col justify-between h-36 cursor-pointer ${
                      isDarkTheme
                        ? 'bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:bg-slate-850'
                        : 'bg-white border-slate-200 hover:border-orange-400 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`p-3 rounded-xl ${cat.bg} ${cat.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm sm:text-base">{cat.name}</h4>
                      <span className="text-xs text-slate-400">
                        {toPersianDigits(cat.count)} حراج و مزایده فعال
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 3: LIVE AUCTIONS & LADDER WIDGET                 */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'live' && (
          <div className="space-y-4">
            {/* Live Interactive Control Bar */}
            <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
              isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-600 animate-ping" />
                <h2 className="font-black text-sm sm:text-base">
                  تالار رقابت زنده: {currentModule.name}
                </h2>
              </div>

              {/* Bot Simulation Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsBotSimRunning((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isBotSimRunning
                      ? 'bg-red-600 text-white animate-pulse'
                      : isDarkTheme ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {isBotSimRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isBotSimRunning ? 'توقف شبیه‌ساز رقبا' : 'فعال‌سازی پیشنهادهای رقابتی زنده'}</span>
                </button>

                <button
                  onClick={handleSimulateBotBid}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#fb7701] hover:bg-orange-600 text-white transition-all flex items-center gap-1 cursor-pointer"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>تولید یک پیشنهاد رقیب</span>
                </button>
              </div>
            </div>

            {/* Current Item Specs Card */}
            <div className={`p-4 rounded-2xl border grid grid-cols-1 md:grid-cols-12 gap-4 ${
              isDarkTheme ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="md:col-span-4 rounded-xl overflow-hidden aspect-16/9 md:aspect-auto">
                <img
                  src={currentModule.imageUrl}
                  alt={currentModule.defaultTitle}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="md:col-span-8 flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#fb7701] font-bold mb-1">
                    <span>{currentModule.badge}</span>
                    <span>&bull;</span>
                    <span className="font-mono">{currentModule.lotNumber}</span>
                  </div>
                  <h3 className="font-extrabold text-sm sm:text-base mb-1">
                    {currentModule.defaultTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {currentModule.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">قیمت پایه:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatDualCurrency(currentModule.basePrice).toman}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">حداقل گام:</span>
                    <span className="font-bold">
                      {formatDualCurrency(currentModule.minIncrement).toman}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">نرخ ودیعه الزامی:</span>
                    <span className="font-bold text-amber-500">۱۵٪ (۱۵۰۰ bps)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">طرف فعال شما:</span>
                    <span className="font-bold font-mono text-[#fb7701]">
                      {activeOfferer.offererId}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Animated Live Price Ladder Widget (TR-01 / TR-13) */}
            <PriceLadderWidget
              ladder={competition.ladder}
              ladderSize={competition.ladderSize}
              basePrice={competition.rules.basePrice}
              isDarkTheme={isDarkTheme}
              competitionId={competition.competitionId}
              isLiveConnected={true}
              onQuickBidClick={() => handleOpenQuickBid(currentModule)}
            />
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 4: WALLET & ESCROW (ADR-002)                     */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border ${
              isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-5 h-5 text-amber-500" />
                <h2 className="font-black text-base sm:text-lg">
                  مدیریت تعهدات و سپرده‌های تضمینی (ADR-002 / K-INV-7)
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                بر اساس تعهدنامه K-INV-7، مشارکت‌کنندگان مجاز به ثبت پیشنهاد تا سقف اعتبارسنجی‌شده در گواهی ضمانت بانکی خود هستند.
              </p>
            </div>

            <CommitmentGuardPanel
              proofs={proofs}
              rules={competition.rules}
              currentTime={currentTime}
              onTopUp={handleTopUpFunds}
              onExpireProof={handleExpireProof}
              onRestoreProof={handleRestoreProof}
            />
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 5: PROFILE & GOVERNANCE (ADR-003 & AUDIT)        */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'profile' && (
          <div className="space-y-5">
            {/* Settlement Dashboard for ADR-003 */}
            <SettlementDashboard
              competition={competition}
              module={currentModule}
              onSettleCompetition={handleSettleCompetition}
              isDarkTheme={isDarkTheme}
            />

            {/* Transitions & Audit Log */}
            <TransitionsLog
              events={auditEvents}
              onClear={() => setAuditEvents([])}
            />

            {/* System Modals & Verification Triggers */}
            <div className={`p-4 sm:p-5 rounded-2xl border ${
              isDarkTheme ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <h3 className="font-extrabold text-sm mb-3 flex items-center gap-2">
                <Server className="w-4 h-4 text-amber-500" />
                <span>ابزارهای انطباق معماری و آزمون‌های هسته (ADR-001 الی ADR-004)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => setIsTestModalOpen(true)}
                  className={`p-3 rounded-xl border text-right font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    isDarkTheme ? 'bg-slate-800 hover:bg-slate-700 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 border-slate-200'
                  }`}
                >
                  <span>اجرای آزمون‌های هسته منطقی (Pytest)</span>
                  <Play className="w-4 h-4 text-emerald-500" />
                </button>
                <button
                  onClick={() => setIsDocsModalOpen(true)}
                  className={`p-3 rounded-xl border text-right font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    isDarkTheme ? 'bg-slate-800 hover:bg-slate-700 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 border-slate-200'
                  }`}
                >
                  <span>مستندات معماری و استانداردهای ADR</span>
                  <FileText className="w-4 h-4 text-amber-500" />
                </button>
                <button
                  onClick={() => setIsResilienceModalOpen(true)}
                  className={`p-3 rounded-xl border text-right font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    isDarkTheme ? 'bg-slate-800 hover:bg-slate-700 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 border-slate-200'
                  }`}
                >
                  <span>مدیریت تاب‌آوری شبکه ملی (صف آفلاین)</span>
                  <Server className="w-4 h-4 text-blue-500" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 3. Professional Desktop E-Commerce Footer */}
      <footer className="mt-8 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 text-xs text-slate-500 dark:text-slate-400 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <h5 className="font-bold text-slate-900 dark:text-slate-100 mb-2">حراج ملی پرندو</h5>
              <p className="text-[11px] leading-relaxed">
                سامانه رسمی مزایدات و معاملات امانی کالاهای دولتی و سرمایه‌ای کشور تحت قوانین هسته قطعی ADR-001 و ضمانت مالی ADR-002.
              </p>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-slate-100 mb-2">تالارهای معاملاتی</h5>
              <ul className="space-y-1 text-[11px]">
                <li>بورس طلا و مسکوکات رسمی</li>
                <li>فرآورده‌های پلیمری و صادراتی</li>
                <li>ناوگان خودروهای تجاری سنگین</li>
                <li>املاک و مستغلات دولتی</li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-slate-100 mb-2">قوانین و ضمانت‌ها</h5>
              <ul className="space-y-1 text-[11px]">
                <li>سپرده ودیعه ۱۵٪ (K-INV-7)</li>
                <li>پروتکل تکرارپذیری TR-12</li>
                <li>تقدم شماره ترتیب TR-13</li>
                <li>تسویه قطعی ADR-003</li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-slate-100 mb-2">امنیت و پشتیبانی</h5>
              <p className="text-[11px] leading-relaxed mb-2">
                مرکز پاسخگویی متقاضیان و پشتیبانی فنی شبکه ملی اطلاعات (NIN).
              </p>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>گواهی اتصال پایدار به شبکه ملی</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <p>
              &copy; {new Date().getFullYear()} سامانه حراج ملی پرندو (Parando) &middot; تمامی حقوق محفوظ است.
            </p>
            <div className="flex items-center gap-4">
              <span className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">شرایط و قوانین</span>
              <span className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">حریم خصوصی</span>
              <span className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">دیوان محاسبات کشور</span>
            </div>
          </div>
        </div>
      </footer>

      {/* 4. Floating Quick Bid Drawer Modal */}
      <QuickBidModal
        isOpen={isQuickBidOpen}
        onClose={() => setIsQuickBidOpen(false)}
        module={quickBidTarget}
        highestOffer={quickBidTarget.id === currentModule.id ? competition.highestOffer : null}
        activeOfferer={activeOfferer}
        activeProof={guard.getProof(activeOfferer.offererId, activeOfferer.tenantId)}
        onSubmitOffer={handleSubmitOffer}
        isDarkTheme={isDarkTheme}
        isOnline={isOnline}
      />

      {/* 5. Mobile Sticky Bottom Navigation (Mobile & Tablet thumb navigation) */}
      <div className="md:hidden">
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isDarkTheme={isDarkTheme}
          liveAuctionCount={MARKET_MODULES.length}
          pendingHoldsCount={pendingQueue.length}
        />
      </div>

      {/* 6. Subsystem Modals */}
      <TestRunnerModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
      />

      <ArchitectureInfoModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
      />

      <NetworkResilienceModal
        isOpen={isResilienceModalOpen}
        onClose={() => setIsResilienceModalOpen(false)}
        queue={pendingQueue}
        isOnline={isOnline}
        isSimulatingDisruption={isSimulatingDisruption}
        onToggleDisruption={() => resilienceManager.setSimulatedDisruption(!isSimulatingDisruption)}
        onFlushQueue={handleFlushQueue}
        onClearQueue={() => resilienceManager.clearQueue()}
      />
    </div>
  );
}

export default App;
