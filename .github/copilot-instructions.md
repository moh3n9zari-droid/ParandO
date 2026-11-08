# Copilot repository instructions

Before making any project change, read and follow the single authoritative product and technical specification: [`docs/PARANDO_CANONICAL_SPEC.md`](../docs/PARANDO_CANONICAL_SPEC.md). Do not create a competing or duplicate specification. If an implementation request conflicts with that document, identify the conflict and request owner clarification.

## Required engineering rules

- Implement the approved modular-monolith architecture: Django/DRF backend, Next.js/TypeScript web application, PostgreSQL, Redis, Celery with RabbitMQ, and the supporting technologies specified in the canonical document.
- Keep domain ownership and module boundaries explicit. Do not treat markets as tenants or add multi-tenant SaaS isolation. Do not choose an operational pilot market without owner approval.
- PostgreSQL is authoritative for bids and financial state. Never represent a prototype or unimplemented capability as operational.
- Never enable real payments, perform real settlement, deploy to production, or make public releases without explicit owner approval.
- Never delete, reset, overwrite, or migrate owner data or existing database volumes without explicit approval. Preserve existing source assets unless their disposition is reviewed and replacement behavior is working.
- Keep secrets out of source control, logs, tests, and reports. Use environment configuration and placeholders in templates.
- Work on the requested dedicated branch; do not modify `main` or merge pull requests.
- Add or update tests for behavior and report actual commands/results. Clearly distinguish executed checks from checks merely configured.
- Keep the canonical specification authoritative and documentation synchronized with the implementation.
- Owner-facing reports and operational instructions must be in clear Persian.
