# ParandO — Canonical Product & Technical Specification

**Document status:** Owner-approved baseline for implementation  
**Repository:** https://github.com/moh3n9zari-droid/ParandO  
**Default branch:** `main`  
**Language policy:** This specification is written in English for implementation agents. Owner-facing reports and operational instructions must be in clear Persian.  
**Authority:** This is the single canonical product/architecture specification. If another document conflicts with it, do not silently choose: identify the conflict and ask the owner. Update this file rather than creating competing specifications.

---

## 1. Mission and product vision

Build **ParandO**, a single-organization, unified platform for listing, managing, selling and auctioning goods and assets across multiple specialist markets.

The platform must provide one coherent user experience and shared capabilities—identity, verification, notifications, payments/financial records, contracts and administration—while keeping each specialist market's data and domain rules isolated. A change or failure in one market must not contaminate other markets.

The central product principle is:

> Make business operations and routine UI/content changes configurable, without compromising the correctness, security, auditability or availability of the auction and financial cores.

This is an organizational platform owned and operated by **one organization**. It is not a multi-tenant SaaS product. Users, staff, departments, vendors and roles belong to the same organization. Multiple markets are product/domain areas, not separate tenant organizations.

## 2. Target markets and product experience

The intended market areas include:
- Vehicle transfer permits and transfer entitlements.
- Special/vanity SIM numbers.
- Agricultural products, including saffron.
- Gold bars and coins.
- Real estate.
- Petrochemical raw materials, including polymers.
- Industrial machinery and equipment.
- Additional specialist markets in the future.

The first operational market has **not** been selected. Do not select one, hard-code one market's business rules as universal rules, or begin deep market-specific workflows without explicit owner approval.

Users should have one account and one unified experience. Each market may define its own pages, categories, filters, item attributes, listing forms, validations and specialist workflows. Shared capabilities should remain consistent across markets.

## 3. Binding architecture decisions

### 3.1 Architecture style and boundaries
- Start as a **Modular Monolith**, not microservices.
- Define explicit domain modules, data ownership, internal application/API contracts and domain events.
- A module must not directly mutate another module's tables. Cross-module interaction must use documented internal APIs/application services or defined events.
- Preserve the option to extract a module into a service later, but do not introduce distributed-system complexity prematurely.
- Keep one coherent backend and one primary development path. No competing/duplicate backends or parallel architectures.

### 3.2 Technology baseline

| Area | Required baseline |
|---|---|
| Backend/API | Python, Django, Django REST Framework |
| Database | PostgreSQL |
| Cache / rate limiting | Redis; never the source of truth for bids, payments, balances or final contract state |
| Background jobs | Celery with RabbitMQ as the message broker |
| Live updates | Django Channels + WebSocket; Redis may support channel transport |
| Web application | Next.js + TypeScript |
| Admin | One coherent, API-driven administration experience; Django Admin may be extended where suitable, with dedicated frontend admin workflows where required |
| File/object storage | S3-compatible storage abstraction for images, identity documents and contracts; local development may use a compatible local service |
| API schema | OpenAPI, preferably drf-spectacular |
| End-to-end testing | Playwright |
| CI | GitHub Actions |
| Security/dependency scanning | Trivy and appropriate dependency scanners |
| Containers | Docker and Docker Compose |
| Load testing | Grafana k6 |
| Observability | OpenTelemetry-compatible tracing/metrics/logging; Prometheus/Grafana, Flower for Celery and Sentry or an equivalent error tracker where appropriate |

Use supported stable versions available when implementation begins. Pin dependencies and commit lockfiles. Record version choices and reasons. Do not add infrastructure without a concrete requirement.

### 3.3 Web and mobile
- First release target: responsive web application and PWA for desktop and mobile.
- A separate Flutter application is conditional, not part of the initial mandatory scope. Reconsider it only after real mobile requirements demonstrate a need for native notifications, offline operation or device capabilities.
- If a Flutter client is later approved, it must use the same official APIs and domain rules.

## 4. Domain capabilities and module responsibilities

The initial domain map should account for these capabilities. Organize them into appropriately bounded Django apps/modules; avoid creating a separate service for each item.

1. **Identity and access:** user accounts, roles, granular permissions, secure login and MFA for administrators/sensitive operations.
2. **Profiles and KYC:** individual/legal-entity profiles, identity documents and verification status.
3. **Organization structure:** internal teams, departments, staff and vendor relationships within the single organization.
4. **Markets and catalog:** market definitions, categories, product/item types, typed attributes, units, filters and market-specific configuration.
5. **Listings/content:** listing lifecycle, media/documents, moderation, publication, page content and approved visual blocks.
6. **Configuration and policy:** global/market settings, typed rules, versioning and effective-time semantics.
7. **Workflow:** listing review, document verification, sale approval, task assignment and escalation.
8. **Auction engine:** auction types, schedules, eligibility, bid validation, bid ordering, auction state and results.
9. **Fees and commissions:** versioned tariffs based on market, auction type, amount and approved policy.
10. **Financial core:** obligations, payment records, deposits/guarantees, refunds, settlement, balances and ledger.
11. **Installments:** down payment, schedules, due dates, financing cost, grace period, late fees, early settlement and collateral/guarantees where applicable.
12. **Documents and files:** secure storage and controlled access.
13. **Notifications:** SMS, email, push and in-app/internal messages through provider adapters.
14. **Audit and security events:** traceable administrative, financial, auction and security events.
15. **Search and reporting:** listing search, financial reports and management dashboards.
16. **Integrations:** controlled adapters for payment gateways, SMS providers and external systems.
17. **Feature management:** controlled activation of capabilities for permitted markets.

The administration panel is an operational control plane, not a privileged bypass. It must not bypass authorization, domain validation, financial controls or auction rules. Significant configuration changes require validation, versioning and audit history.

## 5. Market model and extensibility

- Each market owns its specialist product/item model, typed attributes, listing form, validation, filters and specialist workflows.
- Use typed attributes such as text, number, date, measurement/unit, enumerated choice and file.
- Flexible attributes may use an extensible representation, but critical business facts must have explicit typed fields and database constraints. Critical facts include bid amount, payment amount, financial balance, contract state and reference identifiers.
- Administrators should be able to configure markets, categories, attributes, display order, filters and listing forms through approved configuration tools.
- When a market requires behavior not supported by the standard configurable components, implement a dedicated domain extension/module rather than weakening the shared core.
- Do not equate `Tenant` with `Market`. Remove or redesign tenant-related concepts only after determining what each existing reference actually represents. The final platform must not implement multi-tenant SaaS isolation.

## 6. Listings and content management

Support a controlled listing lifecycle:
- Draft.
- Attribute/media/document completion.
- Submission for review.
- Approval/rejection with reason.
- Publication.
- Pause/suspension.
- Controlled editing and re-review where required.
- Archive.
- Logical deletion (soft delete) where appropriate.

Administration should support search, filters, bulk operations, scheduled publication, review state and change history.

Provide a shared design system and approved page-block library. Examples include banners, sliders, category sections, listing cards, help/instruction blocks and text blocks. Content administrators may rearrange and configure approved blocks without writing code. Do not permit arbitrary executable code injection through the page builder.

## 7. Auction engine — mandatory correctness standard

The auction engine is a shared capability independent of individual markets. Markets provide item type and specialist configuration; the auction engine owns competition lifecycle, scheduling, bid acceptance, state transitions and result determination.

Support the conceptual auction modes described in the product proposal:
- Immediate auctions with configured start/end windows.
- Standard auctions with organizational stages and scheduling.
- Time-bound auctions with exact start/end times, countdown and an explicitly configured extension rule if applicable.

Authorized administrators may configure duration, start/end time, starting price, minimum increment, participation conditions, guarantees and commission within validated bounds. Each auction must snapshot/version the policies effective at creation. Later configuration edits must not silently change an active auction or an existing contract.

### 7.1 Authoritative bid acceptance
- Bid acceptance is server-side only. Browser-side checks are UX aids, never authoritative.
- PostgreSQL is the source of truth.
- Use database transactions and an appropriate row-locking strategy. The proposal specifically requires a transaction and per-auction row lock (e.g. Django `transaction.atomic` and `select_for_update`) so competing requests for the same auction are evaluated serially.
- All state-changing paths must use a consistent lock acquisition order.
- After acquiring locks, re-check auction state, authoritative server time, bidder eligibility, current price, minimum increment and the auction's versioned rules.
- The accepted order is determined by successful valid server-side transaction ordering, never by the bidder device clock.
- Define and test the exact end-time boundary and conflict-resolution policy before implementing final auction behavior.
- Every bid must have a unique identity, server timestamp, amount, bidder, validation outcome and auction reference.
- Every bid request must carry an idempotency key protected by a database uniqueness constraint. A retry with the same key must return the prior definitive result and must not create a second effect.
- Database constraints, foreign keys and uniqueness rules are a second line of defense.
- Never report success unless the durable transaction committed.

### 7.2 Durable event sequence and reconnect recovery
- WebSocket, Django Channels and Redis are transport/notification mechanisms, not the authoritative auction state or sole event history.
- Every committed auction event must have a monotonically increasing, unique **Auction Sequence ID** within its auction.
- Sequence allocation and durable event/state recording must be atomic with the state transition.
- Use a durable event/outbox record and **Transactional Outbox** publication after database commit. Do not publish in a way that can lose an event between state commit and message dispatch.
- On reconnect, the client supplies its last sequence ID. The server replays missing events from durable storage, or returns a current authoritative snapshot when replay is not possible.
- Clients must detect duplicate events, verify ordering and avoid treating stale state as final before synchronization completes.

### 7.3 Do not put bid acceptance behind background workers
- The critical bid transaction and auction-state update must not depend on Celery workers or notification queue availability.
- Commit the authoritative transaction to PostgreSQL first; dispatch noncritical work through the outbox afterward.
- SMS/email/push notifications, analytics and other noncritical processing may use Celery.
- Consumers must be idempotent under at-least-once delivery.
- Define retry, backoff, dead-letter and controlled replay policies. Monitor queue backlog and oldest-message age.

### 7.4 Auction security and audit
Implement server-side rate limiting, suspicious-pattern detection, security event logging and authorized suspension controls for accounts/auctions. Audit all material auction state transitions and administrative interventions.

### 7.5 Auction acceptance tests
Before an auction capability is considered complete, tests must prove:
- Concurrent bids cannot violate eligibility, auction state, minimum increment or final ordering rules.
- No invalid bid is accepted.
- Retrying the same idempotency key produces exactly one effect and returns the prior definitive result.
- Disconnect/reconnect cannot lose committed state; clients recover through event replay or authoritative snapshot.
- Redis/WebSocket interruption cannot erase a bid already committed to PostgreSQL; event publication resumes after recovery.
- Celery worker interruption does not stop bid acceptance; noncritical work resumes after recovery.
- Final state and winner are reproducible and auditable.

## 8. Financial core and installments

The financial core is independent of market presentation and owns obligations, payment records, fees, commissions, guarantees/deposits, refunds, settlement and balances.

- Every financial event has a unique identifier and business reference. Retries or ambiguous gateway responses must not duplicate financial effects.
- Use a **double-entry ledger**.
- Posted ledger entries are immutable: never delete or overwrite a posted entry. Correct mistakes through reversal or adjustment entries.
- Balances must be derivable/reconcilable from valid ledger entries.
- Restrict financial operations by role and permission. Audit all financial operations and provide reconciliation/mismatch reporting.
- Keep payment-provider integration behind an adapter and use sandbox/mock behavior until the owner explicitly approves real payment activation and supplies the necessary provider/business decisions.
- Never activate live payment, collect real money or initiate real settlement without explicit owner approval.

For each installment contract, maintain an independent schedule including total amount, fixed/percentage down payment, number/frequency of installments, each amount and due date, financing cost, grace period, late fee, early settlement and (if applicable) guarantee/collateral. Track each installment's state, payments and outstanding amount separately.

Financial terms are versioned and fixed at contract creation. New policy versions apply to new contracts; existing contracts follow their own agreed snapshot unless an authorized and legally valid amendment is explicitly recorded.

## 9. Administration and configurable operations

The management experience is a core product capability. Aim to let authorized business administrators manage routine operations without code changes:

| Routine change | Expected administration capability |
|---|---|
| Listings, images, text and documents | Listing/content management |
| Markets and categories | Market/category configuration |
| Specialist item attributes | Typed attribute and form builder |
| Standard page layout | Approved page-block builder |
| Auction duration/type | Versioned auction policy configuration |
| Price increments and commission | Validated rule/tariff configuration |
| Review/approval stages | Constrained workflow designer |
| Message templates | Editor with approved variables |
| Common reports | Reports over authorized data |

A completely new algorithm or domain capability requires engineering, tests and controlled release. Configurability is bounded: administrators may use supported options and blocks, but cannot alter core auction algorithms, bypass financial controls or execute arbitrary code.

## 10. Performance, cache and asynchronous work

- Use Redis for frequently read, relatively stable data such as published settings, public lists and selected homepage data. Version settings and invalidate/update related cache on publication.
- Bids, payments, final balances and final contract states must be read/written against authoritative transactional storage; cache is never authoritative for these operations.
- Use asynchronous queues for noncritical background work.
- Apply the Transactional Outbox pattern for durable event dispatch.
- Avoid premature search infrastructure: start with PostgreSQL search; consider OpenSearch only when measured requirements justify it.

## 11. Security, auditability and continuity

Implement:
- Role-based access control with granular permissions for users, vendors, specialists, financial reviewers and administrators.
- MFA for administrators and sensitive operations.
- Encryption in transit and least-privilege access.
- Secrets only in environment configuration or a secret manager; never commit secrets or print them in logs/reports.
- Audit records for actor, timestamp, operation type, before/after values and reason for sensitive changes.
- Append-only/protected audit history; ordinary administrators cannot delete or alter it.
- Database and file backups, tested restoration, and documented RPO/RTO targets (targets require owner/operational input).
- Separate Development, Staging and Production configurations.
- Synthetic or anonymized test data; do not use real personal/financial data in tests unless properly anonymized.
- Security testing, dependency scanning, code review and penetration testing before public release.
- Rate limiting, web attack protections and anomaly logging.

## 12. Quality engineering, observability and load testing

### 12.1 Required automated quality
- Unit and integration tests for domain rules.
- Explicit boundary tests for auction concurrency, auction close, duplicate payment requests, gateway delays, payment reversals, installment settlement and policy version changes.
- Playwright end-to-end tests for critical user journeys.
- GitHub Actions for repeatable CI checks.
- OpenAPI schema generation and validation.
- Trivy/dependency vulnerability scanning.
- Database migrations must be reviewed and applied in a controlled, reversible/forward-fix-aware manner.

### 12.2 Auction load testing
Use **Grafana k6** for realistic auction load scenarios, including:
- Spike tests for sudden surges in users and bids.
- Soak tests for sustained/variable load and detection of memory/resource leaks, queue buildup and performance degradation.
- Concurrent bid tests validating invalid-bid rejection, idempotency, increments, final price and winner consistency.

Track error rate, p95/p99 latency, throughput, lock wait time and queue drain time. Do not invent capacity claims. Numerical targets for concurrent users, bids/second and latency must be determined and approved during testing on the target Staging infrastructure. Local development is not the basis for production capacity claims.

### 12.3 Monitoring
Provide visibility into:
- PostgreSQL connections, query duration, lock waits, deadlocks, disk and backup health.
- Redis memory, hit/miss, connections, evictions, latency and availability.
- Celery queue length, oldest message age, success/failure/retry rates, task duration and worker health.
- Auction event publication delay, sequence gaps, reconnect failures, rejected bid rate, bid response time and lock wait.
- Correlation IDs across logs/events.

Use Prometheus/Grafana for metrics/dashboards, Flower for Celery and Sentry or an equivalent application error tracker where appropriate. Important alerts require severity, threshold, response owner and runbook.

### 12.4 Staging
Run heavy Spike/Soak/load tests in a separate Staging environment representative of Production in software versions, topology, configuration and resources. Use synthetic/anonymized data. Record code version, configuration, data, scenario, results and environment limitations for every run.

## 13. Local development environment — inspect before changing

The owner's source proposal records this existing local setup:
- Windows 11 + Docker Desktop.
- PostgreSQL 18.6 via Docker Compose.
- Docker service: `postgres`.
- Container name: `auction-postgres`.
- Database: `auction_platform`.
- Database user: `auction_admin`.
- Host port: `5432`, bound only to `127.0.0.1`.
- Data directory: `F:\AuctionPlatform\data\postgres`.
- Secrets are in `.env`.
- The owner reports that connectivity and the container health check were previously successful.
- `.env` and database data directory are intended to be excluded by `.gitignore`.

These are owner-reported facts, not proof that the agent's cloud environment can access the owner's Windows machine. Inspect repository Compose/configuration and document the actual local setup. Reuse the existing database/container if valid. Do not reinstall PostgreSQL, delete data, recreate the database, change storage layout or overwrite local volumes without documented technical necessity and explicit owner approval. Do not expect a GitHub-hosted agent to access `F:\` or the owner's local Docker daemon.

Provide a reproducible Docker Compose development environment and precise Windows PowerShell instructions. Keep host database exposure loopback-only. Ensure environment templates contain placeholders only; never copy real secrets into the repository.

## 14. Repository reconstruction policy

The existing repository is an early/experimental version of the same product, not an architecture contract.

- Inspect all current files, code, dependencies, tests, assets, workflows and capabilities before deciding what to reuse.
- Existing React/Vite/TypeScript, Node.js/Express, WebSocket, domain models, sample market data, UI components, security/resilience code and GitHub Actions are candidate assets only—not automatically approved architecture.
- No obligation exists to preserve the current React/Express/TypeScript architecture.
- Reuse, adapt or migrate an existing asset only when evidence shows it is valuable and compatible.
- Rewrite when that is simpler, safer and less costly than adapting.
- Remove obsolete or unused code as part of the approved reconstruction, but never delete real database data, secrets or user-owned data.
- Do not retain duplicate backends, parallel folders, competing architecture or contradictory documentation merely for historical reasons.
- The final repository must have one coherent architecture and one primary development path.
- The owner reports having a backup of the original repository; this does not authorize destructive actions against live/local database data or secrets.

Do not assume a repository feature exists merely because it is mentioned in the proposal. Verify it in code and tests.

## 15. Delivery phases and implementation order

Proceed in small, reviewable phases. The first market remains undecided, so build the reusable platform foundation first.

### Phase 0 — Repository and environment audit
- Inventory repository structure, current architecture, dependencies, tests, workflows and existing assets.
- Identify reusable, replaceable and obsolete components with file-path evidence.
- Inspect current database/Compose configuration without destructive actions.
- Record risks, gaps, assumptions and owner decisions.
- Do not claim the audit is complete without examining the actual repository.

### Phase 1 — Architecture skeleton and developer experience
- Establish the Django/DRF backend and Next.js/TypeScript frontend as the single target architecture.
- Define modular boundaries and project conventions.
- Add pinned dependencies/lockfiles, environment templates, Dockerfiles and Docker Compose.
- Add health checks, structured configuration, logging and initial CI.
- Document local Windows setup and cloud-agent limitations.
- Add basic tests and OpenAPI generation.
- Do not remove existing assets until their disposition is documented and the replacement path is working.

### Phase 2 — Shared platform foundation
- Implement identity/access foundations, role/permission model, organization context, audit framework, configuration/policy versioning, file abstraction and notification interfaces.
- Implement shared market/category/typed-attribute primitives without choosing a first market.
- Provide safe admin workflows through official APIs.
- Use adapters/mocks for external integrations until credentials and owner approval exist.

### Phase 3 — Listing and market framework
- Implement generic listing lifecycle, moderation, media/document references, typed attributes, search/filter foundations and approved content blocks.
- Demonstrate extensibility with neutral fixtures or generic examples only; do not designate a real market as the operational pilot.

### Phase 4 — Auction foundation
- Implement auction state machine and policy snapshots.
- Implement durable concurrent bid acceptance, row locking, idempotency, sequence IDs, outbox, replay/snapshot recovery and audit.
- Add deterministic concurrency/integration tests before UI polish.
- WebSocket updates must be a projection of committed state, never the source of truth.

### Phase 5 — Financial foundation (non-live)
- Implement ledger primitives, immutable postings, reversals/adjustments, financial references, reconciliation scaffolding and installment schedule model.
- Use simulated/sandbox adapters only.
- Do not activate real payments, real guarantees, real settlement or production financial operations.

### Phase 6 — Admin experience, reporting and hardening
- Complete the bounded admin workflows, policy/configuration UI, audit search, reporting and operational dashboards.
- Complete security checks, recovery tests, performance profiling and Staging load-test plan.
- Do not claim production readiness without evidence and owner approval.

### Phase 7 — First market and production launch (blocked pending owner decisions)
- Wait for the owner to choose the first market and approve its business rules, legal/compliance requirements, operational workflows, payment provider and production launch plan.
- Only then implement market-specific behavior and production integrations.
- Production deployment/public release requires explicit owner approval.

Each phase must end with: changed-file summary, architecture decisions, commands run, test results, known gaps, risks, and a Persian owner-facing report. Do not mark a feature complete merely because code was generated; it must be tested and its evidence reported.

## 16. Agent authority and owner approval gates

The agent may, within this specification:
- Redesign project structure.
- Move, rewrite or remove incompatible code and unused files.
- Add tests, fix technical defects and update documentation.
- Create logical commits and work on a dedicated branch.
- Open pull requests for owner review.

The agent must not, without explicit owner approval:
- Change core business/product decisions in this document.
- Select the first operational market.
- Activate live payment or real financial operations.
- Deploy publicly or move to Production.
- Delete real data or alter/destroy existing database volumes.
- Expose secrets or transfer them to external services.
- Perform irreversible actions outside the approved reconstruction scope.

Never print secrets in logs, issue comments, PRs or reports. Ask the owner only when a material business choice or approval gate is genuinely reached; do not block routine technical decisions that are already constrained by this specification.

## 17. Git and collaboration workflow

- Use a dedicated working branch for implementation; do not commit directly to `main`.
- Make small, logically grouped commits with clear messages.
- Open a PR with summary, rationale, test evidence, risks and rollback/migration notes.
- Do not merge PRs, deploy or trigger production actions. The owner reviews and approves merges.
- Keep one primary coding agent responsible for code changes at a time to avoid conflicting edits. A second agent may perform independent review later.
- Avoid repeated repository scans, duplicate documents and unnecessary changes that waste agent context/resources.
- Keep documentation synchronized with actual code.

## 18. Required final reconstruction acceptance criteria

The reconstruction is complete only when:
1. Implemented architecture matches this specification and approved owner decisions.
2. One coherent backend and one primary architecture remain.
3. Domain boundaries and data ownership are explicit.
4. No obsolete duplicate architecture or unused code remains without a documented reason.
5. Development environment can be reproducibly started from documented instructions.
6. Dependencies are pinned and secrets/data are excluded from version control.
7. Critical tests and quality/security checks run successfully.
8. Auction concurrency, idempotency, reconnect recovery and audit requirements are proven by tests.
9. Financial records are traceable, immutable after posting and reconcilable; live payment remains disabled absent approval.
10. Documentation matches the actual code and setup.
11. No incomplete/experimental capability is represented as operational.
12. The path for adding future specialist markets is clear.
13. Backup/restore procedures are documented and restoration is tested in a safe environment.
14. Staging load-test evidence and operational monitoring/runbooks exist before public auction launch.

## 19. Owner decisions still open — do not invent answers

The source proposal intentionally leaves these business/operational decisions unresolved:
- Which market is the first operational pilot.
- Market-specific legal, regulatory, identity/KYC and document requirements.
- The final business rules for each market and auction type where not specified here.
- Actual payment gateway/provider, settlement model and credentials.
- Approved financial rates, commission schedules, guarantee rules, financing costs and late-fee policy.
- Required MFA method/provider, SMS/email/push vendors and production credentials.
- Production hosting, domain, data residency, backup retention, RPO/RTO and service-level targets.
- Target production capacity and numeric latency/throughput thresholds.
- Exact role matrix and approval authority for real organizational workflows.

Continue with reversible technical foundations and safe mock/test behavior while these decisions are open. Record assumptions explicitly. Do not turn assumptions into owner-approved requirements.

---

## Appendix A — Source alignment

This specification consolidates the owner's 19-page Persian technical/product proposal and the subsequent explicit implementation choices:
- One owning organization; specialist markets are domain modules, not tenants.
- Modular Monolith; Django/DRF, Next.js/TypeScript, PostgreSQL, Redis, Celery/RabbitMQ, Django Channels/WebSocket.
- Responsive web/PWA first; Flutter only if justified later.
- No first market selected; no live payment or Production launch without owner approval.
- Windows 11/Docker Desktop local development and the PostgreSQL details recorded in Section 13.
- Dedicated branches and PR-based owner review; no direct commits to `main`.

Where the source proposal does not specify a business value or vendor, this document marks it open rather than inventing it.
