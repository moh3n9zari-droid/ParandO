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
  Offer,
} from './core/competition_kernel';
import { MARKET_MODULES, MarketModuleConfig } from './data/market_modules';
import { TopHeader } from './components/TopHeader';
import { BottomNav, NavTab } from './components/BottomNav';
import { AuctionCard } from './components/AuctionCard';
import { PriceLadderWidget } from './components/PriceLadderWidget';
import { QuickBidModal } from './components/QuickBidModal';
import { AuctionDetailView } from './components/AuctionDetailView';
import { SellerDashboard } from './components/SellerDashboard';
import { WatchlistModal } from './components/WatchlistModal';
import { Footer } from './components/Footer';
import { SettlementDashboard } from './components/SettlementDashboard';
import { CommitmentGuardPanel } from './components/CommitmentGuardPanel';
import { TransitionsLog, AuditEvent } from './components/TransitionsLog';
import { TestRunnerModal } from './components/TestRunnerModal';
import { ArchitectureInfoModal } from './components/ArchitectureInfoModal';
import { NetworkResilienceModal } from './components/NetworkResilienceModal';
import { OfflineResilienceManager, ResilientOffer } from './services/resilienceQueue';
import { formatDualCurrency, formatDuration, formatTimestamp, toPersianDigits } from './utils/formatters';
import {
  Trophy,
  Flame,
  Zap,
  TrendingUp,
  ShieldCheck,
  Building2,
  Coins,
  Truck,
  Wheat,
  Cpu,
  FileText,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  ChevronRight,
  Info,
  Server,
  Layers,
  Sparkles,
  ChevronLeft,
  Scale,
  Lock,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Clock,
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
  const [selectedDetailModule, setSelectedDetailModule] = useState<MarketModuleConfig | null>(null);

  // Watchlist state (eBay mechanic)
  const [watchlistIds, setWatchlistIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('parando_watchlist');
      return saved ? JSON.parse(saved) : ['gold', 'automotive'];
    } catch {
      return ['gold', 'automotive'];
    }
  });
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);

  const handleToggleWatchlist = (id: string) => {
    setWatchlistIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      localStorage.setItem('parando_watchlist', JSON.stringify(next));
      return next;
    });
  };

  // Seller Dashboard Drawer/Modal state
  const [isSellerDashboardView, setIsSellerDashboardView] = useState<boolean>(false);

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

  // Hero carousel active slide
  const [heroSlideIndex, setHeroSlideIndex] = useState<number>(0);
  const featuredHeroModules = useMemo(() => MARKET_MODULES.slice(0, 3), []);

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

  // Carousel auto-timer for hero
  useEffect(() => {
    const timer = setInterval(() => {
      setHeroSlideIndex((prev) => (prev + 1) % featuredHeroModules.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [featuredHeroModules.length]);

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
    setSelectedDetailModule(mod);
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

  const activeProof = guard.getProof(activeOfferer.offererId, activeOfferer.tenantId);
  const activeProofAmount = activeProof ? activeProof.guaranteedAmount : 0;

  return (
    <div
      className={`min-h-screen transition-colors duration-200 flex flex-col font-sans select-none pb-20 ${
        isDarkTheme ? 'bg-[#121212] text-slate-100' : 'bg-[#F7F7FA] text-slate-900'
      }`}
      dir="rtl"
    >
      {/* 1. Global Navigation Bar */}
      <TopHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onSelectCategory={(catId) => {
          setSelectedCategory(catId);
          setSelectedDetailModule(null);
          setIsSellerDashboardView(false);
          if (activeTab !== 'home') setActiveTab('home');
        }}
        isDarkTheme={isDarkTheme}
        onToggleTheme={handleToggleTheme}
        isOnline={isOnline}
        onOpenResilienceModal={() => setIsResilienceModalOpen(true)}
        pendingQueueCount={pendingQueue.length}
        watchlistCount={watchlistIds.length}
        onOpenWatchlist={() => setIsWatchlistModalOpen(true)}
        walletBalance={activeProofAmount}
        activeBidsCount={competition.offerCount}
        onOpenWalletTab={() => {
          setActiveTab('wallet');
          setSelectedDetailModule(null);
          setIsSellerDashboardView(false);
        }}
        onOpenSellerDashboard={() => {
          setIsSellerDashboardView(true);
          setSelectedDetailModule(null);
        }}
      />

      {/* Main Body per Active Tab or View */}
      <main className="flex-1 w-full space-y-6">
        {/* Alerts / Feedback Bar */}
        {(lastError || lastSuccess) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3">
            <div
              className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-medium flex items-center justify-between gap-3 shadow-xs transition-all ${
                lastError
                  ? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30'
                  : 'bg-[#00A86B]/10 text-emerald-800 dark:text-emerald-300 border-[#00A86B]/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#FF5000]" />
                <span>{lastError || lastSuccess}</span>
              </div>
              <button
                onClick={() => {
                  setLastError(null);
                  setLastSuccess(null);
                }}
                className="text-xs opacity-70 hover:opacity-100 cursor-pointer font-bold"
              >
                بستن
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* VIEW: SELLER & INSTITUTIONAL DASHBOARD               */}
        {/* ---------------------------------------------------- */}
        {isSellerDashboardView ? (
          <SellerDashboard
            competitions={[competition]}
            modules={MARKET_MODULES}
            currentModule={currentModule}
            currentCompetition={competition}
            auditEvents={auditEvents}
            onSettleCompetition={handleSettleCompetition}
            onSelectCompetition={(mod) => handleSelectModule(mod)}
            onClose={() => setIsSellerDashboardView(false)}
            isDarkTheme={isDarkTheme}
          />
        ) : selectedDetailModule ? (
          /* ---------------------------------------------------- */
          /* VIEW: AUCTION DETAIL PAGE (SECTION 3.C)              */
          /* ---------------------------------------------------- */
          <AuctionDetailView
            module={selectedDetailModule}
            competition={selectedDetailModule.id === currentModule.id ? competition : createInitialCompetition(selectedDetailModule, currentTime)}
            currentTime={currentTime}
            onBack={() => setSelectedDetailModule(null)}
            onOpenQuickBid={handleOpenQuickBid}
            isDarkTheme={isDarkTheme}
            isLiveConnected={isOnline}
            isWatchlisted={watchlistIds.includes(selectedDetailModule.id)}
            onToggleWatchlist={handleToggleWatchlist}
          />
        ) : (
          /* ---------------------------------------------------- */
          /* TABS CONTAINER                                       */
          /* ---------------------------------------------------- */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
            {/* ---------------------------------------------------- */}
            {/* TAB 1: HOME (70% PARANDO | 20% EBAY | 10% TEMU)       */}
            {/* ---------------------------------------------------- */}
            {activeTab === 'home' && (
              <div className="space-y-6">
                {/* 1. Hero Merchandising Carousel (Section 3.B.1) */}
                {featuredHeroModules.length > 0 && (
                  <div className="relative rounded-2xl overflow-hidden border border-[#E5E7EB] dark:border-slate-800 bg-[#121212] text-white shadow-xl">
                    {/* Background Slide Image with Scrim */}
                    <div className="relative h-64 sm:h-80 md:h-96 w-full overflow-hidden">
                      <img
                        src={featuredHeroModules[heroSlideIndex].imageUrl}
                        alt={featuredHeroModules[heroSlideIndex].defaultTitle}
                        className="w-full h-full object-cover opacity-60 scale-105 transition-all duration-700"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent" />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#121212]/90 via-[#121212]/40 to-transparent" />

                      {/* Content Overlay */}
                      <div className="absolute inset-0 p-5 sm:p-8 flex flex-col justify-between">
                        {/* Top Badges */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-[#FF5000] text-white shadow-md">
                              {featuredHeroModules[heroSlideIndex].badge}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur-md">
                              شناسه رسمی: {featuredHeroModules[heroSlideIndex].lotNumber}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-amber-300 text-xs font-bold font-mono">
                            <Clock className="w-3.5 h-3.5 text-[#FF5000]" />
                            <span>زمان مانده: {formatDuration(Math.max(0, competition.endsAt.getTime() - currentTime.getTime()))}</span>
                          </div>
                        </div>

                        {/* Middle Text Details */}
                        <div className="max-w-2xl space-y-2">
                          <h2 className="text-xl sm:text-2xl md:text-3xl font-black leading-tight text-white drop-shadow-sm">
                            {featuredHeroModules[heroSlideIndex].defaultTitle}
                          </h2>
                          <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 leading-relaxed">
                            {featuredHeroModules[heroSlideIndex].description}
                          </p>

                          <div className="flex items-center gap-4 pt-1 font-mono text-xs text-slate-300">
                            <div>
                              <span className="text-slate-400 block text-[10px]">قیمت پایه کارشناسی:</span>
                              <span className="font-bold text-[#00A86B] font-tnum text-base sm:text-lg">
                                {formatDualCurrency(featuredHeroModules[heroSlideIndex].basePrice).toman}
                              </span>
                            </div>
                            <div className="hidden sm:block border-r border-white/20 pr-4">
                              <span className="text-slate-400 block text-[10px]">حداقل گام افزایش:</span>
                              <span className="font-bold text-white font-tnum">
                                {formatDualCurrency(featuredHeroModules[heroSlideIndex].minIncrement).toman}
                              </span>
                            </div>
                            <div className="hidden md:block border-r border-white/20 pr-4">
                              <span className="text-slate-400 block text-[10px]">ودیعه مسدودی امانی:</span>
                              <span className="font-bold text-amber-400">۱۵٪ (ADR-002)</span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Actions & Slide Dots */}
                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenQuickBid(featuredHeroModules[heroSlideIndex])}
                              className="py-2.5 px-5 rounded-full text-xs sm:text-sm font-black bg-[#FF5000] hover:bg-[#E64A00] text-white shadow-lg flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
                            >
                              <Zap className="w-4 h-4 fill-current" />
                              <span>ثبت پیشنهاد فوری در این حراج</span>
                            </button>

                            <button
                              onClick={() => handleCardClick(featuredHeroModules[heroSlideIndex])}
                              className="py-2.5 px-4 rounded-full text-xs sm:text-sm font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors cursor-pointer"
                            >
                              مشاهده شناسنامه و اسناد
                            </button>
                          </div>

                          {/* Slide Carousel Dots */}
                          <div className="flex items-center gap-1.5">
                            {featuredHeroModules.map((_, dotIdx) => (
                              <button
                                key={dotIdx}
                                onClick={() => setHeroSlideIndex(dotIdx)}
                                className={`h-2 rounded-full transition-all cursor-pointer ${
                                  heroSlideIndex === dotIdx ? 'w-6 bg-[#FF5000]' : 'w-2 bg-white/40'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Institutional Security & Trust Strip (Section 3.B.2) */}
                <div className="rounded-xl border border-emerald-500/30 bg-[#00A86B]/10 dark:bg-emerald-950/20 p-3.5 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-[#00A86B] shrink-0" />
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      تضمین سپرده قانونی ۱۵٪ | تسویه رمزنگاری‌شده ADR-003 | نظارت ممیزی مستقل
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300 font-medium">
                    <span className="hidden sm:inline">تسویه تضمینی توسط خزانه‌داری</span>
                    <button
                      onClick={() => setIsDocsModalOpen(true)}
                      className="text-[#FF5000] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <span>مطالعه منشور حقوق خریداران</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Section Header */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white">
                      ویترین مزایدات رسمی و تالارهای در حال برگزاری
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      شامل {toPersianDigits(filteredModules.length)} محموله و دارایی فعال با قیمت‌گذاری کارشناسی
                    </p>
                  </div>

                  <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                    چینش: زمان خاتمه و اولویت فوریت
                  </span>
                </div>

                {/* 3. Hybrid Auction Grid (Desktop 4-Col / Tablet 3-Col / Mobile 2-Col Masonry) */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                  {filteredModules.map((mod) => {
                    const isSelectedModule = mod.id === currentModule.id;
                    const compHighest = isSelectedModule ? competition.highestOffer : null;
                    const compLadder = isSelectedModule ? competition.ladder : [];

                    return (
                      <AuctionCard
                        key={mod.id}
                        module={mod}
                        highestOffer={compHighest}
                        ladder={compLadder}
                        currentTime={currentTime}
                        endsAt={isSelectedModule ? competition.endsAt : new Date(currentTime.getTime() + mod.durationMinutes * 60_000)}
                        onQuickBid={handleOpenQuickBid}
                        onSelectDetails={handleCardClick}
                        isDarkTheme={isDarkTheme}
                        isWatchlisted={watchlistIds.includes(mod.id)}
                        onToggleWatchlist={handleToggleWatchlist}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* TAB 2: CATEGORIES (Explorer Grid)                    */}
            {/* ---------------------------------------------------- */}
            {activeTab === 'categories' && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl border bg-white dark:bg-[#1E1E24] border-[#E5E7EB] dark:border-slate-800">
                  <h2 className="font-black text-lg sm:text-xl text-slate-900 dark:text-white mb-1">
                    دسته‌بندی‌های تالارهای رسمی مبادلات پرندو
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    تفکیک بر مبنای حوزه‌های پتروشیمی، فلزات گرانبها، ناوگان ترابری و املاک مازاد دولتی
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
                  {[
                    { id: 'gold', name: 'طلا، جواهرات و مسکوکات', count: 12, icon: Coins, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                    { id: 'petro', name: 'فرآورده‌های پتروشیمی و پلیمر', count: 8, icon: Flame, color: 'text-[#FF5000]', bg: 'bg-orange-500/10' },
                    { id: 'automotive', name: 'خودرو و ناوگان تجاری سنگین', count: 5, icon: Truck, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { id: 'realty', name: 'املاک و اراضی سازمان اموال تملیکی', count: 19, icon: Building2, color: 'text-[#00A86B]', bg: 'bg-emerald-500/10' },
                    { id: 'agri', name: 'محصولات استراتژیک کشاورزی صادراتی', count: 7, icon: Wheat, color: 'text-yellow-600', bg: 'bg-yellow-600/10' },
                    { id: 'goods', name: 'ماشین‌آلات صنعتی و خطوط تولید', count: 14, icon: Cpu, color: 'text-purple-500', bg: 'bg-purple-500/10' },
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
                            ? 'bg-[#1E1E24] border-slate-800 hover:border-[#FF5000] hover:bg-slate-800'
                            : 'bg-white border-[#E5E7EB] hover:border-[#FF5000] hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`p-3 rounded-xl ${cat.bg} ${cat.color}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">{cat.name}</h4>
                          <span className="text-xs text-slate-400 font-mono mt-1 block">
                            {toPersianDigits(cat.count)} حراج فعال
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
              <div className="space-y-6">
                {/* Live Interactive Control Bar */}
                <div
                  className={`p-4 sm:p-5 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
                    isDarkTheme ? 'bg-[#1E1E24] border-slate-800' : 'bg-white border-[#E5E7EB] shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-3.5 h-3.5 rounded-full bg-red-600 animate-ping" />
                    <div>
                      <h2 className="font-black text-base sm:text-lg text-slate-900 dark:text-white">
                        تالار رقابت زنده: {currentModule.name}
                      </h2>
                      <span className="text-xs text-slate-500 font-mono">
                        کد رقابت: {competition.competitionId} (ADR-001)
                      </span>
                    </div>
                  </div>

                  {/* Bot Simulation Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsBotSimRunning((prev) => !prev)}
                      className={`px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isBotSimRunning
                          ? 'bg-[#FF5000] text-white animate-pulse'
                          : isDarkTheme ? 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700' : 'bg-[#F7F7FA] text-slate-700 hover:bg-slate-200 border border-slate-300'
                      }`}
                    >
                      {isBotSimRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isBotSimRunning ? 'توقف شبیه‌ساز رقبا' : 'شبیه‌سازی پیشنهادهای زنده رقیب'}</span>
                    </button>

                    <button
                      onClick={handleSimulateBotBid}
                      className="px-3.5 py-2 rounded-full text-xs font-bold bg-[#00A86B] hover:bg-emerald-600 text-white transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>تولید پیشنهاد رقیب</span>
                    </button>
                  </div>
                </div>

                {/* Animated Live Price Ladder Widget */}
                <PriceLadderWidget
                  ladder={competition.ladder}
                  ladderSize={competition.ladderSize}
                  basePrice={competition.rules.basePrice}
                  isDarkTheme={isDarkTheme}
                  competitionId={competition.competitionId}
                  isLiveConnected={isOnline}
                  onQuickBidClick={() => handleOpenQuickBid(currentModule)}
                  depositRateBps={currentModule.depositRateBps}
                  guaranteedAmount={activeProofAmount}
                />
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* TAB 4: WALLET & ESCROW (ADR-002)                     */}
            {/* ---------------------------------------------------- */}
            {activeTab === 'wallet' && (
              <div className="space-y-6">
                <div
                  className={`p-5 rounded-2xl border ${
                    isDarkTheme ? 'bg-[#1E1E24] border-slate-800' : 'bg-white border-[#E5E7EB] shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <ShieldCheck className="w-6 h-6 text-amber-500" />
                    <h2 className="font-black text-lg text-slate-900 dark:text-white">
                      مدیریت تعهدات و سپرده‌های تضمینی (ADR-002 / K-INV-7)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    بر اساس ضابطه K-INV-7، مشارکت‌کنندگان مجاز به ثبت پیشنهاد تا سقف اعتبارسنجی‌شده در گواهی مسدودی ضمانت بانکی خود هستند.
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
              <div className="space-y-6">
                <div
                  className={`p-5 rounded-2xl border flex items-center justify-between gap-4 ${
                    isDarkTheme ? 'bg-[#1E1E24] border-slate-800' : 'bg-white border-[#E5E7EB] shadow-xs'
                  }`}
                >
                  <div>
                    <h2 className="font-black text-lg text-slate-900 dark:text-white mb-1">
                      حاکمیت، ممیزی قانونی و تسویه ADR-003
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      پایشگر صحت اجرای تراکنش‌ها مطابق با قوانین دیوان محاسبات و خزانه‌داری
                    </p>
                  </div>

                  <button
                    onClick={() => setIsSellerDashboardView(true)}
                    className="px-4 py-2 rounded-full text-xs font-bold bg-[#FF5000] text-white hover:bg-[#E64A00] transition-colors cursor-pointer"
                  >
                    ورود به پنل فروشنده و تسویه
                  </button>
                </div>

                {/* Settlement Dashboard */}
                <SettlementDashboard
                  competition={competition}
                  module={currentModule}
                  onSettleCompetition={handleSettleCompetition}
                  isDarkTheme={isDarkTheme}
                />

                {/* Transitions & Audit Log */}
                <TransitionsLog events={auditEvents} onClear={() => setAuditEvents([])} />

                {/* System Verification Triggers */}
                <div
                  className={`p-5 rounded-2xl border ${
                    isDarkTheme ? 'bg-[#1E1E24] border-slate-800' : 'bg-white border-[#E5E7EB]'
                  }`}
                >
                  <h3 className="font-extrabold text-sm mb-3 flex items-center gap-2">
                    <Server className="w-4 h-4 text-amber-500" />
                    <span>ابزارهای انطباق معماری و آزمون‌های هسته (ADR-001 الی ADR-004)</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => setIsTestModalOpen(true)}
                      className={`p-3.5 rounded-xl border text-right font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        isDarkTheme
                          ? 'bg-slate-900 hover:bg-slate-850 border-slate-700 text-slate-200'
                          : 'bg-[#F7F7FA] hover:bg-slate-200 border-slate-200 text-slate-800'
                      }`}
                    >
                      <span>کنسول آزمون‌های هسته منطقی</span>
                      <Play className="w-4 h-4 text-emerald-500" />
                    </button>
                    <button
                      onClick={() => setIsDocsModalOpen(true)}
                      className={`p-3.5 rounded-xl border text-right font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        isDarkTheme
                          ? 'bg-slate-900 hover:bg-slate-850 border-slate-700 text-slate-200'
                          : 'bg-[#F7F7FA] hover:bg-slate-200 border-slate-200 text-slate-800'
                      }`}
                    >
                      <span>مستندات معماری و استانداردهای ADR</span>
                      <FileText className="w-4 h-4 text-amber-500" />
                    </button>
                    <button
                      onClick={() => setIsResilienceModalOpen(true)}
                      className={`p-3.5 rounded-xl border text-right font-bold text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        isDarkTheme
                          ? 'bg-slate-900 hover:bg-slate-850 border-slate-700 text-slate-200'
                          : 'bg-[#F7F7FA] hover:bg-slate-200 border-slate-200 text-slate-800'
                      }`}
                    >
                      <span>تاب‌آوری شبکه ملی (صف آفلاین)</span>
                      <Server className="w-4 h-4 text-blue-500" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Enterprise Institutional Footer */}
      <Footer
        isDarkTheme={isDarkTheme}
        onOpenDocsModal={() => setIsDocsModalOpen(true)}
        onOpenTestModal={() => setIsTestModalOpen(true)}
      />

      {/* Floating Quick Bid Drawer Modal */}
      <QuickBidModal
        isOpen={isQuickBidOpen}
        onClose={() => setIsQuickBidOpen(false)}
        module={quickBidTarget}
        highestOffer={quickBidTarget.id === currentModule.id ? competition.highestOffer : null}
        activeOfferer={activeOfferer}
        activeProof={activeProof}
        onSubmitOffer={handleSubmitOffer}
        isDarkTheme={isDarkTheme}
        isOnline={isOnline}
      />

      {/* Watchlist Modal */}
      <WatchlistModal
        isOpen={isWatchlistModalOpen}
        onClose={() => setIsWatchlistModalOpen(false)}
        watchlistIds={watchlistIds}
        allModules={MARKET_MODULES}
        onRemoveFromWatchlist={handleToggleWatchlist}
        onSelectLot={(mod) => {
          setSelectedDetailModule(mod);
          setIsWatchlistModalOpen(false);
        }}
        onQuickBid={(mod) => handleOpenQuickBid(mod)}
        isDarkTheme={isDarkTheme}
      />

      {/* Mobile-First Sticky Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSelectedDetailModule(null);
          setIsSellerDashboardView(false);
        }}
        isDarkTheme={isDarkTheme}
        liveAuctionCount={MARKET_MODULES.length}
        pendingHoldsCount={pendingQueue.length}
      />

      {/* Subsystem Modals */}
      <TestRunnerModal isOpen={isTestModalOpen} onClose={() => setIsTestModalOpen(false)} />

      <ArchitectureInfoModal isOpen={isDocsModalOpen} onClose={() => setIsDocsModalOpen(false)} />

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
