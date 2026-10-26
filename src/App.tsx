import { useState, useEffect, useMemo } from 'react';
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
import { Navbar } from './components/Navbar';
import { MarketSelector } from './components/MarketSelector';
import { AuctionHeader } from './components/AuctionHeader';
import { LadderView } from './components/LadderView';
import { BidConsole } from './components/BidConsole';
import { TransitionsLog, AuditEvent } from './components/TransitionsLog';
import { CommitmentGuardPanel } from './components/CommitmentGuardPanel';
import { TestRunnerModal } from './components/TestRunnerModal';
import { ArchitectureInfoModal } from './components/ArchitectureInfoModal';
import { NetworkResilienceModal } from './components/NetworkResilienceModal';
import { OfflineResilienceManager, ResilientOffer } from './services/resilienceQueue';
import { RealTimeAuctionHub, WebSocketConnectionStatus, RealTimeEvent } from './services/realtimeAuctionHub';
import { createLadderDeterminedEvent, processSettlement, SettlementStatement } from './core/settlement_module';
import { SettlementModal } from './components/SettlementModal';
import { HookRegistry } from './core/extension_hooks';
import { AuditComplianceModal } from './components/AuditComplianceModal';
import { formatDualCurrency, toPersianDigits } from './utils/formatters';

export function App() {
  const [currentModule, setCurrentModule] = useState<MarketModuleConfig>(MARKET_MODULES[0]);

  // Simulation Clock
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [isClockRunning, setIsClockRunning] = useState<boolean>(true);

  // Modals state
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState<boolean>(false);
  const [isResilienceModalOpen, setIsResilienceModalOpen] = useState<boolean>(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);

  // ADR-004 Hook Registry
  const hookRegistry = useMemo(() => HookRegistry.getInstance(), []);

  // Real-Time WebSocket Hub State
  const realtimeHub = useMemo(() => RealTimeAuctionHub.getInstance(), []);
  const [wsStatus, setWsStatus] = useState<WebSocketConnectionStatus>('CONNECTED');
  const [wsLatency, setWsLatency] = useState<number>(24);
  const [lastUpdatedOfferId, setLastUpdatedOfferId] = useState<string | undefined>(undefined);

  // Settlement Module (ADR-003) State
  const [settlementStatement, setSettlementStatement] = useState<SettlementStatement | null>(null);
  const [isSettlementFinalized, setIsSettlementFinalized] = useState<boolean>(false);

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

  // Real-Time WebSocket Hub Listener
  useEffect(() => {
    const unsubStatus = realtimeHub.subscribeStatus((st, lat) => {
      setWsStatus(st);
      setWsLatency(lat);
    });

    const unsubEvents = realtimeHub.subscribe((event: RealTimeEvent) => {
      if (event.type === 'LADDER_UPDATED') {
        if (event.payload.ladder.length > 0) {
          setLastUpdatedOfferId(event.payload.ladder[0].offerId);
        }
      } else if (event.type === 'LADDER_DETERMINED') {
        if (event.payload.statement) {
          setSettlementStatement(event.payload.statement);
          setIsSettlementFinalized(true);
        }
      }
    });

    return () => {
      unsubStatus();
      unsubEvents();
    };
  }, [realtimeHub]);

  // Initialize Competition based on Market Module (TR-01)
  const createInitialCompetition = (mod: MarketModuleConfig, baseTime: Date) => {
    const rules = new CompetitionRules(mod.basePrice, mod.minIncrement, mod.depositRateBps);
    return new Competition({
      competitionId: `COMP-${mod.id.toUpperCase()}-001`,
      tenantId: mod.tenantId,
      sellerId: mod.sellerId,
      rules,
      startsAt: new Date(baseTime.getTime() - 10 * 60 * 1000),
      endsAt: new Date(baseTime.getTime() + mod.durationMinutes * 60 * 1000),
      status: CompetitionStatus.ACTIVE,
      ladderSize: mod.ladderSize,
    });
  };

  const [competition, setCompetition] = useState<Competition>(() =>
    createInitialCompetition(MARKET_MODULES[0], currentTime)
  );

  // Offerers pool (TR-01)
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

  // TR-12 Idempotency Store: key -> { command, result }
  const [seenRecords, setSeenRecords] = useState<Map<string, { command: SubmitOfferCommand; result: SubmitOfferResult }>>(
    new Map()
  );

  // Audit Events
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // Submission messages feedback
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  // Clock interval with WebSocket real-time broadcast
  useEffect(() => {
    if (!isClockRunning) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = new Date(prev.getTime() + 1000);
        const remainingSeconds = Math.max(0, Math.floor((competition.endsAt.getTime() - next.getTime()) / 1000));
        realtimeHub.broadcastTick(next.getTime(), remainingSeconds, remainingSeconds === 0);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isClockRunning, competition.endsAt, realtimeHub]);

  // ADR-003 Settlement Finalizer
  const finalizeSettlementFor = (comp: Competition) => {
    const event = createLadderDeterminedEvent(comp);
    const statement = processSettlement(
      event,
      proofs.map((p) => ({
        offererId: p.offererId,
        tenantId: p.tenantId,
        guaranteedAmount: p.guaranteedAmount,
      }))
    );
    setSettlementStatement(statement);
    setIsSettlementFinalized(true);
    realtimeHub.broadcastLadderDetermined(event, statement);
    hookRegistry.dispatchOnDetermined({
      competition: comp,
      statement,
      timestamp: currentTime,
    });
    setLastSuccess(`رویداد رسمی ladder.determined صادر شد و صورت‌حساب مالی ADR-003 نهایی گردید.`);
  };

  const handleOpenSettlement = () => {
    if (!settlementStatement) {
      const event = createLadderDeterminedEvent(competition);
      const draft = processSettlement(
        event,
        proofs.map((p) => ({
          offererId: p.offererId,
          tenantId: p.tenantId,
          guaranteedAmount: p.guaranteedAmount,
        }))
      );
      setSettlementStatement(draft);
    }
    setIsSettlementModalOpen(true);
  };

  const handleFinalizeSettlement = () => {
    handleChangeStatus(CompetitionStatus.CLOSED);
  };

  // Market Switch
  const handleSelectModule = (mod: MarketModuleConfig) => {
    setCurrentModule(mod);
    const newComp = createInitialCompetition(mod, currentTime);
    setCompetition(newComp);
    setSettlementStatement(null);
    setIsSettlementFinalized(false);
    setLastUpdatedOfferId(undefined);

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
      { offererId: 'offerer-alpha', tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-beta', tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-gamma', tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-low-funds', tenantId: mod.tenantId, guaranteedAmount: 10_000, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-foreign-tenant', tenantId: 'foreign-tenant-xyz', guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: 'offerer-ineligible', tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
      { offererId: mod.sellerId, tenantId: mod.tenantId, guaranteedAmount: mod.basePrice * 2, validUntil: new Date(currentTime.getTime() + 24 * 3600_000) },
    ];
    setProofs(updatedProofs);
    setLastError(null);
    setLastSuccess(`بازار معاملاتی به «${mod.name}» تغییر یافت.`);
  };

  const handleToggleClock = () => setIsClockRunning((prev) => !prev);
  const handleAdvanceTime = (seconds: number) => {
    setCurrentTime((prev) => new Date(prev.getTime() + seconds * 1000));
  };
  const handleResetTime = () => {
    const fresh = new Date();
    setCurrentTime(fresh);
    setCompetition(createInitialCompetition(currentModule, fresh));
    setSettlementStatement(null);
    setIsSettlementFinalized(false);
  };

  const handleChangeStatus = (status: CompetitionStatus) => {
    const updatedComp = new Competition({
      competitionId: competition.competitionId,
      tenantId: competition.tenantId,
      sellerId: competition.sellerId,
      rules: competition.rules,
      startsAt: competition.startsAt,
      endsAt: competition.endsAt,
      status,
      version: competition.version,
      highestOffer: competition.highestOffer,
      offerCount: competition.offerCount,
      ladderSize: competition.ladderSize,
      ladder: competition.ladder,
    });
    setCompetition(updatedComp);
    realtimeHub.broadcastStatusChanged(updatedComp.competitionId, status);

    if (status === CompetitionStatus.CLOSED) {
      finalizeSettlementFor(updatedComp);
    }
  };

  const handleModifyLadderSize = (ladderSize: number) => {
    try {
      setCompetition(
        new Competition({
          competitionId: competition.competitionId,
          tenantId: competition.tenantId,
          sellerId: competition.sellerId,
          rules: competition.rules,
          startsAt: competition.startsAt,
          endsAt: competition.endsAt,
          status: competition.status,
          version: competition.version,
          highestOffer: competition.highestOffer,
          offerCount: competition.offerCount,
          ladderSize,
          ladder: competition.ladder.slice(0, ladderSize),
        })
      );
      setLastSuccess(`ظرفیت نردبان رقابت به ${toPersianDigits(ladderSize)} جایگاه به‌روزرسانی شد.`);
    } catch (e: unknown) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  };

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
    setLastSuccess(`سپرده تضمین برای ${offererId} با موفقیت افزایش یافت (+${formatDualCurrency(amount).rial})`);
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

  // Submit Offer through pure kernel with TR-01, TR-12, and TR-13, and National Network Resilience
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
        `پایداری شبکه ملی: به علت نوسان یا قطعی شبکه، پیشنهاد با مبلغ ${formatDualCurrency(amount).rial} در صف امن محلی ذخیره شد و به محض بازیابی ارتباط ارسال خواهد شد.`
      );
      return;
    }

    // ADR-004 Hook Pipeline: Pre-offer evaluation (Velocity, AML, Market Integrity)
    const hookEval = hookRegistry.evaluateBeforeOffer({
      competition,
      offerer: activeOfferer,
      amount,
      idempotencyKey,
      offerId,
      timestamp: currentTime,
    });

    if (!hookEval.allowed) {
      const rejectedEvent: AuditEvent = {
        id: `evt-reject-${Date.now()}-${Math.random()}`,
        timestamp: currentTime,
        offerId,
        offererId: activeOfferer.offererId,
        amount,
        type: 'REJECTED',
        reason: `${hookEval.code || 'HOOK_REJECTED'}: ${hookEval.reason || 'توسط نظارت هوک مسدود شد'}`,
        transitions: [],
        rankChanges: [],
      };
      setAuditEvents((prev) => [rejectedEvent, ...prev]);
      setLastError(`${hookEval.code || 'مقررات نظارتی'}: ${hookEval.reason}`);
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
      setLastUpdatedOfferId(result.offer.offerId);

      // Real-Time WebSocket Broadcast (Slice 3)
      realtimeHub.broadcastLadderUpdate({
        competitionId: result.competition.competitionId,
        ladder: result.competition.ladder,
        highestOffer: result.competition.highestOffer,
        offerCount: result.competition.offerCount,
        rankChanges: result.rankChanges,
        transitions: result.transitions,
        timestamp: currentTime.getTime(),
      });
      realtimeHub.broadcastOfferPlaced(result.offer, result.rank);

      // ADR-004 Hook Pipeline: Post-offer dispatch
      hookRegistry.dispatchAfterOffer({
        competition: result.competition,
        offer: result.offer,
        rank: result.rank,
        rankChanges: result.rankChanges,
        transitions: result.transitions,
        timestamp: currentTime,
      });

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
          `پاسخ تکرارپذیر TR-12: کلید «${idempotencyKey}» با مشخصات قبلی تطابق داشت؛ نتیجه قبلی (رتبه ${toPersianDigits(result.rank)}) بدون اجرای مجدد بازگردانده شد.`
        );
      } else {
        setLastSuccess(
          `پیشنهاد با موفقیت در رتبه ${toPersianDigits(result.rank)} ثبت شد (${formatDualCurrency(amount).rial})! توالی TR-13: شماره ${toPersianDigits(result.offer.sequence)}، نسخه v${toPersianDigits(result.competition.version)}.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof CompetitionError ? (err as CompetitionError).code : 'ERROR';

      // ADR-004 Hook Pipeline: Reject dispatch
      hookRegistry.dispatchOnReject({
        competition,
        offerer: activeOfferer,
        amount,
        idempotencyKey,
        offerId,
        errorCode: code,
        errorMessage: msg,
        timestamp: currentTime,
      });

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" dir="rtl">
      {/* Top Navbar */}
      <Navbar
        currentModule={currentModule}
        currentTime={currentTime}
        isClockRunning={isClockRunning}
        onToggleClock={handleToggleClock}
        onAdvanceTime={handleAdvanceTime}
        onResetTime={handleResetTime}
        onOpenTests={() => setIsTestModalOpen(true)}
        onOpenDocs={() => setIsDocsModalOpen(true)}
        onOpenAudit={() => setIsAuditModalOpen(true)}
        isOnline={isOnline}
        isSimulatingDisruption={isSimulatingDisruption}
        onToggleDisruption={() => resilienceManager.setSimulatedDisruption(!isSimulatingDisruption)}
        pendingQueueCount={pendingQueue.length}
        onOpenQueueModal={() => setIsResilienceModalOpen(true)}
        wsStatus={wsStatus}
        wsLatency={wsLatency}
        onOpenSettlement={handleOpenSettlement}
        hasSettlementStatement={Boolean(settlementStatement)}
      />

      {/* Market Modules Bar */}
      <MarketSelector
        activeModuleId={currentModule.id}
        onSelectModule={handleSelectModule}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <AuctionHeader
          competition={competition}
          currentModule={currentModule}
          currentTime={currentTime}
          onChangeStatus={handleChangeStatus}
          onModifyLadderSize={handleModifyLadderSize}
          onOpenSettlement={handleOpenSettlement}
          hasSettlementStatement={Boolean(settlementStatement)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 flex flex-col">
            <LadderView
              competition={competition}
              activeOffererId={activeOfferer.offererId}
              lastUpdatedOfferId={lastUpdatedOfferId}
            />
          </div>

          <div className="lg:col-span-6 flex flex-col">
            <BidConsole
              competition={competition}
              offerers={offerers}
              activeOfferer={activeOfferer}
              onSelectOfferer={setActiveOfferer}
              guard={guard}
              onTopUpFunds={handleTopUpFunds}
              onSubmitOffer={handleSubmitOffer}
              lastError={lastError}
              lastSuccess={lastSuccess}
              isOnline={isOnline}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 flex flex-col">
            <CommitmentGuardPanel
              proofs={proofs}
              rules={competition.rules}
              currentTime={currentTime}
              onTopUp={handleTopUpFunds}
              onExpireProof={handleExpireProof}
              onRestoreProof={handleRestoreProof}
            />
          </div>

          <div className="lg:col-span-6 flex flex-col">
            <TransitionsLog
              events={auditEvents}
              onClear={() => setAuditEvents([])}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800 bg-slate-900/60 py-4 text-center text-xs text-slate-500">
        <p>
          سامانه حراج و مبادلات ملی پاراندو (ParandO) &middot; اسلایس چهارم و نهایی: معماری افزونه‌ها و هوک‌های نظارتی (ADR-004) و ممیزی بازپخش قطعی (Zero-Drift Replay) &bull; آماده تحویل (Production-Ready)
        </p>
      </footer>

      {/* Modals */}
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

      <SettlementModal
        isOpen={isSettlementModalOpen}
        onClose={() => setIsSettlementModalOpen(false)}
        statement={settlementStatement}
        isFinalized={isSettlementFinalized}
        onFinalizeSettlement={handleFinalizeSettlement}
      />

      <AuditComplianceModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        competition={competition}
        marketModule={currentModule}
        auditEvents={auditEvents}
        proofs={proofs}
      />
    </div>
  );
}

export default App;
