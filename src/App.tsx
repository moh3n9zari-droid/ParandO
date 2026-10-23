import { useState, useEffect, useMemo } from 'react';
import {
  Auction,
  AuctionRules,
  AuctionStatus,
  Bidder,
  CommitmentGuard,
  CommitmentProof,
  FixedClock,
  submitBid,
  AuctionError,
} from './core/auction_kernel';
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
import { formatDualCurrency } from './utils/formatters';

export function App() {
  // Current active market module
  const [currentModule, setCurrentModule] = useState<MarketModuleConfig>(MARKET_MODULES[0]);

  // Clock state
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [isClockRunning, setIsClockRunning] = useState<boolean>(true);

  // Modals state
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState<boolean>(false);

  // Initialize auction based on market module
  const createInitialAuction = (mod: MarketModuleConfig, baseTime: Date) => {
    const rules = new AuctionRules(mod.basePrice, mod.minIncrement, mod.depositRateBps);
    return new Auction({
      auctionId: `AUC-${mod.id.toUpperCase()}-001`,
      tenantId: mod.tenantId,
      sellerId: mod.sellerId,
      rules,
      startsAt: new Date(baseTime.getTime() - 10 * 60 * 1000), // started 10 mins ago
      endsAt: new Date(baseTime.getTime() + mod.durationMinutes * 60 * 1000), // ends in N minutes
      status: AuctionStatus.ACTIVE,
      ladderSize: mod.ladderSize,
    });
  };

  const [auction, setAuction] = useState<Auction>(() =>
    createInitialAuction(MARKET_MODULES[0], currentTime)
  );

  // Bidders pool
  const [bidders, setBidders] = useState<Bidder[]>([
    { bidderId: 'bidder-alpha', tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
    { bidderId: 'bidder-beta', tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
    { bidderId: 'bidder-gamma', tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
    { bidderId: 'bidder-low-funds', tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
    { bidderId: 'bidder-foreign-tenant', tenantId: 'foreign-tenant-xyz', isEligible: true },
    { bidderId: 'bidder-ineligible', tenantId: MARKET_MODULES[0].tenantId, isEligible: false },
    { bidderId: MARKET_MODULES[0].sellerId, tenantId: MARKET_MODULES[0].tenantId, isEligible: true },
  ]);

  const [activeBidder, setActiveBidder] = useState<Bidder>(bidders[0]);

  // Commitment Proofs in Financial Ledger
  const [proofs, setProofs] = useState<CommitmentProof[]>([
    {
      bidderId: 'bidder-alpha',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 200_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      bidderId: 'bidder-beta',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 250_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      bidderId: 'bidder-gamma',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 150_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      bidderId: 'bidder-low-funds',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 500_000, // Insufficient for required exposure
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      bidderId: 'bidder-foreign-tenant',
      tenantId: 'foreign-tenant-xyz',
      guaranteedAmount: 100_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      bidderId: 'bidder-ineligible',
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 100_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
    {
      bidderId: MARKET_MODULES[0].sellerId,
      tenantId: MARKET_MODULES[0].tenantId,
      guaranteedAmount: 100_000_000_000,
      validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
    },
  ]);

  // CommitmentGuard implementation
  const guard = useMemo<CommitmentGuard>(() => {
    return {
      getProof(bidderId: string, tenantId: string): CommitmentProof | null {
        const found = proofs.find((p) => p.bidderId === bidderId && p.tenantId === tenantId);
        return found || null;
      },
    };
  }, [proofs]);

  // Seen idempotency keys
  const [seenKeys, setSeenKeys] = useState<Set<string>>(new Set());

  // Audit Events
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // Submission message feedback
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

  // Handle Market Module Switch
  const handleSelectModule = (mod: MarketModuleConfig) => {
    setCurrentModule(mod);
    const newAuction = createInitialAuction(mod, currentTime);
    setAuction(newAuction);

    // Update bidder tenant IDs for current market
    const updatedBidders: Bidder[] = [
      { bidderId: 'bidder-alpha', tenantId: mod.tenantId, isEligible: true },
      { bidderId: 'bidder-beta', tenantId: mod.tenantId, isEligible: true },
      { bidderId: 'bidder-gamma', tenantId: mod.tenantId, isEligible: true },
      { bidderId: 'bidder-low-funds', tenantId: mod.tenantId, isEligible: true },
      { bidderId: 'bidder-foreign-tenant', tenantId: 'foreign-tenant-xyz', isEligible: true },
      { bidderId: 'bidder-ineligible', tenantId: mod.tenantId, isEligible: false },
      { bidderId: mod.sellerId, tenantId: mod.tenantId, isEligible: true },
    ];
    setBidders(updatedBidders);
    setActiveBidder(updatedBidders[0]);

    // Update proofs
    const updatedProofs: CommitmentProof[] = [
      {
        bidderId: 'bidder-alpha',
        tenantId: mod.tenantId,
        guaranteedAmount: mod.basePrice * 2,
        validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
      },
      {
        bidderId: 'bidder-beta',
        tenantId: mod.tenantId,
        guaranteedAmount: mod.basePrice * 2,
        validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
      },
      {
        bidderId: 'bidder-gamma',
        tenantId: mod.tenantId,
        guaranteedAmount: mod.basePrice * 2,
        validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
      },
      {
        bidderId: 'bidder-low-funds',
        tenantId: mod.tenantId,
        guaranteedAmount: 10_000,
        validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
      },
      {
        bidderId: 'bidder-foreign-tenant',
        tenantId: 'foreign-tenant-xyz',
        guaranteedAmount: mod.basePrice * 2,
        validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
      },
      {
        bidderId: 'bidder-ineligible',
        tenantId: mod.tenantId,
        guaranteedAmount: mod.basePrice * 2,
        validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
      },
      {
        bidderId: mod.sellerId,
        tenantId: mod.tenantId,
        guaranteedAmount: mod.basePrice * 2,
        validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
      },
    ];
    setProofs(updatedProofs);
    setLastError(null);
    setLastSuccess(`Switched to ${mod.name} module.`);
  };

  // Clock manipulations
  const handleToggleClock = () => setIsClockRunning((prev) => !prev);
  const handleAdvanceTime = (seconds: number) => {
    setCurrentTime((prev) => new Date(prev.getTime() + seconds * 1000));
  };
  const handleResetTime = () => {
    const fresh = new Date();
    setCurrentTime(fresh);
    setAuction(createInitialAuction(currentModule, fresh));
  };

  // Status changes
  const handleChangeStatus = (status: AuctionStatus) => {
    setAuction(
      new Auction({
        auctionId: auction.auctionId,
        tenantId: auction.tenantId,
        sellerId: auction.sellerId,
        rules: auction.rules,
        startsAt: auction.startsAt,
        endsAt: auction.endsAt,
        status,
        version: auction.version,
        highestBid: auction.highestBid,
        bidCount: auction.bidCount,
        ladderSize: auction.ladderSize,
        ladder: auction.ladder,
      })
    );
  };

  // Ladder size change
  const handleModifyLadderSize = (ladderSize: number) => {
    try {
      setAuction(
        new Auction({
          auctionId: auction.auctionId,
          tenantId: auction.tenantId,
          sellerId: auction.sellerId,
          rules: auction.rules,
          startsAt: auction.startsAt,
          endsAt: auction.endsAt,
          status: auction.status,
          version: auction.version,
          highestBid: auction.highestBid,
          bidCount: auction.bidCount,
          ladderSize,
          ladder: auction.ladder.slice(0, ladderSize),
        })
      );
      setLastSuccess(`Ladder capacity updated to Top-${ladderSize}`);
    } catch (e: unknown) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  };

  // Proof top-up
  const handleTopUpFunds = (bidderId: string, amount: number) => {
    setProofs((prev) =>
      prev.map((p) =>
        p.bidderId === bidderId
          ? {
              ...p,
              guaranteedAmount: p.guaranteedAmount + amount,
              validUntil: new Date(currentTime.getTime() + 24 * 3600_000),
            }
          : p
      )
    );
    setLastSuccess(`Funds pre-authorized for ${bidderId} (+${formatDualCurrency(amount).rial})`);
  };

  // Expire proof
  const handleExpireProof = (bidderId: string) => {
    setProofs((prev) =>
      prev.map((p) =>
        p.bidderId === bidderId
          ? { ...p, validUntil: new Date(currentTime.getTime() - 60_000) }
          : p
      )
    );
    setLastError(`Commitment proof expired for ${bidderId}`);
  };

  // Restore proof
  const handleRestoreProof = (bidderId: string) => {
    setProofs((prev) =>
      prev.map((p) =>
        p.bidderId === bidderId
          ? { ...p, validUntil: new Date(currentTime.getTime() + 3600_000) }
          : p
      )
    );
    setLastSuccess(`Commitment proof extended for ${bidderId}`);
  };

  // Bid submission through pure kernel
  const handleSubmitBid = (amount: number, expectedVersion?: number | null) => {
    setLastError(null);
    setLastSuccess(null);

    const bidId = `bid-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const idempotencyKey = `idem-${bidId}`;

    const clock = new FixedClock(currentTime);

    try {
      const result = submitBid(
        auction,
        {
          auctionId: auction.auctionId,
          bidder: activeBidder,
          amount,
          bidId,
          idempotencyKey,
          expectedVersion,
        },
        guard,
        clock,
        seenKeys
      );

      // Record seen idempotency key
      setSeenKeys((prev) => new Set([...prev, idempotencyKey]));

      // Update auction state
      setAuction(result.auction);

      // Record audit event
      const newEvent: AuditEvent = {
        id: `evt-${Date.now()}-${Math.random()}`,
        timestamp: currentTime,
        bidId,
        bidderId: activeBidder.bidderId,
        amount,
        type: 'ACCEPTED',
        rank: result.rank,
        transitions: result.transitions,
        rankChanges: result.rankChanges,
      };

      setAuditEvents((prev) => [newEvent, ...prev]);
      setLastSuccess(
        `Bid accepted at Rank #${result.rank} (${formatDualCurrency(amount).rial})! Version bumped to v${result.auction.version}.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof AuctionError ? (err as AuctionError).code : 'ERROR';

      // Record rejection in audit log
      const rejectedEvent: AuditEvent = {
        id: `evt-reject-${Date.now()}-${Math.random()}`,
        timestamp: currentTime,
        bidId,
        bidderId: activeBidder.bidderId,
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
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
      />

      {/* Market Modules Bar */}
      <MarketSelector
        activeModuleId={currentModule.id}
        onSelectModule={handleSelectModule}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Auction Summary & Parameters */}
        <AuctionHeader
          auction={auction}
          currentModule={currentModule}
          currentTime={currentTime}
          onChangeStatus={handleChangeStatus}
          onModifyLadderSize={handleModifyLadderSize}
        />

        {/* 2-Column Grid: Ladder vs Bid Console */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Top-K Ladder View */}
          <div className="lg:col-span-6 flex flex-col">
            <LadderView
              auction={auction}
              activeBidderId={activeBidder.bidderId}
            />
          </div>

          {/* Bid Submission Console */}
          <div className="lg:col-span-6 flex flex-col">
            <BidConsole
              auction={auction}
              bidders={bidders}
              activeBidder={activeBidder}
              onSelectBidder={setActiveBidder}
              guard={guard}
              onTopUpFunds={handleTopUpFunds}
              onSubmitBid={handleSubmitBid}
              lastError={lastError}
              lastSuccess={lastSuccess}
            />
          </div>
        </div>

        {/* Lower Row: Financial Commitment Proofs & Transitions Log */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 flex flex-col">
            <CommitmentGuardPanel
              proofs={proofs}
              rules={auction.rules}
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

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-4 text-center text-xs text-slate-500">
        <p>
          Parando Auction Ecosystem &middot; Clean Core Architecture &middot; ADR-001 through ADR-004
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
    </div>
  );
}

export default App;
