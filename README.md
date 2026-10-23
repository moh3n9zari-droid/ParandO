# Parando Auction Ecosystem

## Overview
Parando is a multi-tenant, agentic auction ecosystem designed for handling diverse market modules (Gold, Petrochemicals, Automotive, Real Estate, Agriculture, and Goods).

Rewritten as a React + TypeScript application, preserving all domain logic, invariants, and architecture from ADR-001 through ADR-004.

## Architecture Highlights
- **Clean Core Architecture**: Decoupled domain business rules (ADR-001 through ADR-004) implemented in pure TypeScript with zero external framework/IO coupling.
- **Auction Kernel & Ladder**: Pure domain functions handling deterministic bid validation, optimistic concurrency versioning, and top-$K$ rankings.
- **Ordering Guarantee**: 1. Amount (descending) &rarr; 2. Monotonic timestamp (earlier wins) &rarr; 3. Sequence (deterministic tie-breaker).
- **One Position Per Bidder**: Each bidder holds at most their highest bid on the ladder. Lower bids are superseded.
- **Commitment Guard (ADR-002 Contract)**: Enforces `K-INV-7` (Exposure &le; Guaranteed Amount) and `K-INV-14` (fast read-only pre-authorization port).
- **Multi-tenant Market Isolation**: Tenant matching and policy configuration per market module.
- **Interactive Verification Suite**: Integrated in-browser test suite executing 100% of the core unit and integration test assertions with real-time pass/fail telemetry.

## Available Market Modules
1. **Precious Metals & Gold** (Bullion & Coins)
2. **Petrochemicals & Energy** (Commodity Polymers)
3. **Automotive & Heavy Fleet** (Commercial Haulers)
4. **Real Estate & Land** (Commercial Free-Zone Logistics Hubs)
5. **Agriculture & Exports** (Export Lot Saffron & Pistachio)
6. **Industrial Goods & Machinery** (5-Axis CNC Precision Centers)

## Running Locally
```bash
npm install
npm run dev
```

Build for production:
```bash
npm run build
```
