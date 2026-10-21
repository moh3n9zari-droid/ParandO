# Parando Auction Ecosystem

## Overview
Parando is a multi-tenant, agentic auction ecosystem designed for handling diverse market modules (Gold, Petrochemicals, Automotive, Real Estate, Agriculture, and Goods).

## Architecture Highlights
- **Clean Core Architecture**: Decoupled domain business rules (ADR-001 through ADR-004).
- **Core Kernels**: Isolated Bid & Auction Kernel, Financial Ledger, and Settlement System.
- **Agentic Pipeline**: Automated deployment and repository integration via n8n orchestration.

## Repository Structure
- `src/core/`: Central Engine (Auction, Financial, Settlement Kernels)
- `src/plugins/`: Market-specific Policy Adapters
