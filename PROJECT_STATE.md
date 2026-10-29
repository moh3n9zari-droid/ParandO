# PROJECT_STATE

## Purpose

This document represents the current operational state of the repository.

This document is the primary continuity mechanism of the project.

Its purpose is to preserve project continuity across:

- conversations
- accounts
- sessions
- AI systems
- development tools
- environments
- repository participants

This document must always reflect repository reality.

Repository reality overrides this document.

If this document becomes inconsistent with repository evidence:

Repository evidence wins.

---

# Repository Identity

Project Name:

ParandO (پرندو) - National Auction & Competition Ecosystem

Project Status:

ACTIVE

Repository Authority:

Git Repository (moh3n9zari-droid/ParandO)

Primary Branch:

main

---

# Continuity Status

Repository Self Sufficiency:

REQUIRED

Participant Neutral:

YES

Project Continuity Source:

PROJECT_STATE.md

Knowledge Authority:

Repository Sources & Verified Test Executions

External Chat Dependency:

NO

Platform Dependency:

NO

Participant Dependency:

NOT ALLOWED

Continuity Status:

ACTIVE (Stage 0 Baseline Reconciled)

---

# Repository Tracking

Current Repository Revision:

UNVERIFIED_LOCAL_GIT (Local container lacks `.git` metadata; git commands return `fatal: not a git repository`)

Last Audited Commit:

594bb4b2617bea51b0285bc99968ba05cbf09790 (Observed remote HEAD per Stage 0 invocation)

Last Audited Branch:

main

Last Repository Review Date:

2026-10-29 (Audit timestamp: 2026-10-29T04:10:00Z)

---

# Current Release State

Current Release Phase:

PHASE_0_LOCAL_PRODUCTION_REMEDIATION (Pre-Production / Hardening)

Current Active Remediation Item:

P0-01_REGRESSION_RECONCILIATION & SOURCE_DOCUMENT_ACQUISITION

Current Status:

REMEDIATION_IN_PROGRESS (P0-02, P0-03, P0-04 Verified; P0-01 Partially Verified due to test:timeout-cleanup regex mismatch; Next phase blocked on missing authoritative remediation plan)

---

# Current Product Direction

Product Vision:

Production-Grade Multi-Tenant National Auction & Commodity Exchange Platform (ADR-001, ADR-002, ADR-003, ADR-004)

Current MVP Focus:

DISCREPANCY_RECORDED:
- Previous `PROJECT_STATE.md` noted: "SIM Card Auction Marketplace"
- Actual Repository Implementation (`src/data/market_modules.ts`, `server.ts`, `README.md`, `PROJECT_MASTER_STATE.md`): 6 Institutional Mercantile Bourses (Gold Bullion, Petrochemical Polymers, Heavy Commercial Fleet, Commercial Real Estate, Agricultural Commodities, Industrial CNC Machinery).
- Note: Final market scope selection requires `PROJECT_OWNER_INTENT.md`.

Current Priority Areas:

- Zero-Regression Test Suite Health
- Financial Integrity & Escrow Hold Enforcement (K-INV-7, K-INV-14)
- Trust Boundary Security & RBAC (P0-02)
- WebSocket Isolation & Zero Credential Disclosure (P0-03)
- Mode Truthfulness & Authoritative Server Alignment (P0-04)
- Persistent Storage Migration (Currently Ephemeral In-Memory)

Marketplace Expansion Status:

PRESERVED_MULTI_TENANT (6 Active Institutional Bourse Modules)

Release Readiness Priority:

HIGH

---

# Marketplace Status

Active Categories (Implemented in Codebase):

- Gold Bullion & Central Bank Coins (`tenant-gold-bourse`)
- Petrochemical & Polymer Products (`tenant-energy-bourse`)
- Heavy Transport & Fleet Logistics (`tenant-automotive-hub`)
- Surplus Government Real Estate & Warehouses (`tenant-realty-holding`)
- Agricultural Export Commodities (`tenant-agri-commodities`)
- Industrial Machinery & 5-Axis CNC Lines (`tenant-industrial-exchange`)

Historical / Unverified Categories from Prior State:

- SIM Cards & Memorable Numbers (Not present in `market_modules.ts`)

Future Expansion Capability:

PRESERVED (Modular tenant architecture via `MarketModuleConfig`)

---

# Completed Remediation Items

List of evidence-supported items:

- P0-02: VERIFIED (Server-Side Authentication, Strict Token Claims, Fail-Closed Trust Boundary, RBAC, Multi-Tenant Isolation, Resource Ownership Enforcement). Verified via `npm run test:security` (100% PASS).
- P0-03: VERIFIED (WebSocket Upgrade Authentication, Competition Authorization, Strict Multi-Tenant Event Isolation, Zero Credential Reflection in Handshake/Protocols). Verified via `npm run test:websocket-security` (12/12 PASS).
- P0-04: VERIFIED (Truthful Demo/Real Mode Semantics, Authoritative Initial State Sync, Disconnect Truthfulness, Zero Fake Latency, Fail-Closed Mutation Gating). Verified via `npm run test:mode` (12/12 PASS).
- P0-01: PARTIALLY_VERIFIED (Production Boot, Lifecycle, Graceful Shutdown, Process Group & Escalation Management). Verified passing: `test:smoke` (12/12 PASS), `test:escalation` (2/2 PASS), `test:failure-cleanup` (6/6 PASS). Known defect: `test:timeout-cleanup` fails Case 7/7 on strict regex match for `<!--DEV_ONLY_SCRIPT_START-->`.

---

# Active Remediation Item

Identifier:

P0-01_REGRESSION_RECONCILIATION

Status:

BLOCKED_BY_STAGE_RESTRICTION (Code edits prohibited during Stage 0; technical cause identified as regex mismatch in `test_timeout_cleanup.ts` against `index.html`)

Summary:

Reconcile `index.html` structure with `scripts/test_timeout_cleanup.ts` Case 7/7 assertion while retaining React preamble safety, achieving 100% pass across all 8 validation test suites.

---

# Next Planned Item

Identifier:

STAGE_1_REMEDIATION_OR_PERSISTENCE_INTEGRATION

Dependency Status:

BLOCKED

Blocking Dependencies:

1. Resolution of `test:timeout-cleanup` failure.
2. Missing Authoritative Planning Documents: `RELEASE_READINESS_REMEDIATION_PLAN.md` and `PROJECT_OWNER_INTENT.md` (cannot authoritatively determine whether P0-05 exists or if P1 commences next).
3. Persistent Database Architecture Decision (Transitioning from ephemeral in-memory state to durable storage).

---

# Release Readiness

P0 Status:

PARTIALLY_COMPLETE (P0-02, P0-03, P0-04 Verified Complete; P0-01 3 of 4 suites pass, 1 suite blocked by regex match; P0-05+ status undefined due to missing remediation plan)

P1 Status:

NOT_STARTED / UNVERIFIED

P2 Status:

NOT_STARTED / UNVERIFIED

P3 Status:

NOT_STARTED / UNVERIFIED

Overall Release Status:

NOT_READY (Pre-Production / Ephemeral In-Memory State / Missing Source Specifications)

---

# Repository Health

Build Status:

VERIFIED (`npm run build` / `compile_applet` succeeds cleanly)

Test Status:

PARTIALLY_VERIFIED:
- `npm test` (Core Domain Kernel): 26/26 PASSED (VERIFIED)
- `npm run test:security` (P0-02 RBAC & Auth): PASSED (VERIFIED)
- `npm run test:websocket-security` (P0-03 WS Security): 12/12 PASSED (VERIFIED)
- `npm run test:mode` (P0-04 Truthfulness): 12/12 PASSED (VERIFIED)
- `npm run test:smoke` (Production Boot & Lifecycle): 12/12 PASSED (VERIFIED)
- `npm run test:escalation` (Process Escalation): 2/2 PASSED (VERIFIED)
- `npm run test:failure-cleanup` (Post-Readiness Cleanup): 6/6 PASSED (VERIFIED)
- `npm run test:timeout-cleanup` (Timeout Path Cleanup): FAILED (Assertion failed: DEV_ONLY_SCRIPT block found in index.html)

Security Validation:

VERIFIED (Strict fail-closed on missing secret, zero credential disclosure, tenant-isolated message bus)

Regression Status:

REGRESSION_DETECTED (Single test assertion failure in `test:timeout-cleanup`)

Continuity Validation:

PARTIALLY_VERIFIED (Continuity documented, but 5 expected governance source files absent)

---

# Verified Capabilities

Authentication (REST & WS):

VERIFIED (`auth_service.ts` enforcing HMAC SHA-256 tokens, mandatory expiration, strict claims)

Authorization & RBAC:

VERIFIED (Role-based access control for `OFFERER`, `SELLER`, `EXCHANGE_ADMIN`, `AUDITOR`)

Multi-Tenant Isolation:

VERIFIED (REST and WebSocket boundaries reject cross-tenant offers, settlement, and events)

Auction Lifecycle:

VERIFIED (Pure domain kernel `Competition`, `CompetitionLadder`, tie-breaking TR-13, idempotency TR-12)

Real-Time Communication:

VERIFIED (`ws` server multiplexed on port 3000, presence tracking, ping/pong heartbeats)

Settlement Workflows:

VERIFIED (ADR-003 commission sharing, VAT, net seller payout, outbid collateral unfreezing, SHA-256 seal digests)

Auditability:

PARTIALLY_VERIFIED (In-memory audit log queryable via `/api/v1/audit/events`; not persisted to disk)

Production Certification:

NOT_VERIFIED (Lacks persistent database, production secrets management, and deployment orchestrator)

Master / Admin Provisioning Panel:

NOT_IMPLEMENTED (Basic role checks present; no administrative UI or user provisioning APIs exist)

---

# Known Blockers

Current Blockers:

1. **Missing Authoritative Requirements & Planning Documents:**
   - `PROJECT_OWNER_INTENT.md` (ABSENT)
   - `CURRENT_STATE_AUDIT.md` (ABSENT)
   - `PRODUCT_CONSTRUCTION_RULES.md` (ABSENT)
   - `QUALITY_RUBRIC.md` (ABSENT)
   - `RELEASE_READINESS_REMEDIATION_PLAN.md` (ABSENT)
   *Impact:* Cannot authoritatively establish acceptance gates, release rubric, or post-P0 roadmap.

2. **Failing Timeout Cleanup Regression Test:**
   - `npm run test:timeout-cleanup` fails Case 7/7 due to strict regex expectation on `index.html`.

3. **Ephemeral In-Memory Persistence:**
   - Server state (`competitionsMap`, `proofsMap`, `seenRecordsMap`, `auditEvents`) resides entirely in process RAM. Restarts reset all auction data.

4. **CI Workflow Parity Gap:**
   - `.github/workflows/ci.yml` lacks execution step for `npm run test:mode`.
   - Local container cannot independently query remote GitHub Actions CI run status.

Last Reviewed:

2026-10-29T04:10:00Z

---

# Open Risks

- **Persistence Wipe Risk:** In-memory state is erased whenever container sleeps or server restarts.
- **Specification Ambiguity Risk:** Marketplace focus (SIM Card vs Commodity Bourses) ambiguous without `PROJECT_OWNER_INTENT.md`.
- **Remote CI State Drift:** Inability to independently verify live GitHub Actions runs from isolated container.
- **Scope Creep / Premature Production Claims:** Documents such as `PROJECT_MASTER_STATE.md` claim "Production-Ready / Production Certified" despite ephemeral storage and missing database integration.

---

# Repository Continuity Validation

Critical Knowledge Stored In Repository:

YES (Kernels, tests, evidence reports, architecture ADRs present)

Critical Knowledge Stored Only In Conversations:

NO

Repository Can Continue With New Participant:

YES (Preserved via `PROJECT_STATE.md` and evidence reports)

Repository Can Continue Without Previous Sessions:

YES

Continuity Validation Status:

RECONCILED (Stage 0 completed; discrepancies formally cataloged)

---

# Last Verification

Verification Date:

2026-10-29T04:10:00Z

Verified By:

Principal Systems & Security Architect (Stage 0 Continuity Auditor)

Verification Scope:

Full repository baseline audit, execution of 8 test suites, inspection of evidence directories, and source document discrepancy reconciliation.

Evidence Location:

`/evidence/p0-01/`, `/evidence/p0-02/`, `/evidence/p0-03/`, `/evidence/p0-04/`

---

# Current Objective

Current Objective:

Establish verified baseline continuity, resolve the `test:timeout-cleanup` regression, and obtain authoritative guidance on missing source documents.

Success Condition:

All 8 test suites exit 0; source document discrepancies resolved; release roadmap aligned with owner intent.

---

# Project Completion Rule

The project may be declared:

PROJECT_COMPLETE

only when:

- required remediation items are complete
- release gates are satisfied
- production readiness demonstrated with durable persistence
- no critical blocker remains
- no critical regression remains
- repository continuity verified

---

# Update Requirements

Update this document whenever:

- active remediation item changes
- remediation status changes
- repository revision changes
- release phase changes
- release readiness changes
- blockers change
- risks materially change
- continuity status changes
- project completion is declared

---

# Repository First Rule

Priority Order:

1. Repository Evidence
2. PROJECT_STATE.md
3. Repository Sources
4. Historical Audits
5. Conversation History

Repository evidence always wins.

---

# Participant Neutrality Rule

No critical project knowledge may exist exclusively inside:

- chat history
- AI memory
- account memory
- session memory
- platform memory

All critical project knowledge must exist inside repository-controlled sources.

Loss of any repository participant must not interrupt project continuity.

---

# Final Principle

This document exists to preserve repository continuity.

This document is not a roadmap.

This document is not a planning document.

This document is not an audit report.

This document records current verified repository reality so that any future repository participant can continue work without access to previous conversations.
