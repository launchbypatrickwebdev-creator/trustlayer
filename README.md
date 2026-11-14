# TrustLayer

**TrustLayer — Trust in Every Transaction.**

TrustLayer is agreement-first transaction and settlement infrastructure for individuals, businesses, platforms and autonomous agents. It coordinates transaction terms, milestones, evidence, approvals and outcomes across supported settlement rails.

## Product model

- **One-leg conditional settlement:** one party funds a transaction and settlement follows the agreed release, cancellation or dispute process.
- **Two-leg atomic exchange (Ax / DvP):** two parties exchange eligible assets through coordinated settlement legs.
- **Agent settlement:** AI agents can propose and coordinate purchases while TrustLayer applies transaction policies, records agreements and checks completion conditions.

## Current architecture

- Shared transaction/deal engine for parties, terms, milestones, evidence and outcomes.
- Solana settlement adapters: `solana_escrow` and `solana_ax`.
- Aurora Intents integration as a cross-chain funding route into a participant's Solana wallet. Aurora delivery does not itself fund TrustLayer escrow; the participant still signs the TrustLayer Solana transaction.
- Fiat provider abstraction reserved for future regulated banking/payment partners.
- NEAR Intents Agent API integration foundation for the Agent Settlement Network.

## NEAR Agent Settlement Network

The public interactive prototype is available at `/demo/agent-settlement`; the authenticated `/agents` workspace exposes the same demo inside TrustLayer. The prototype demonstrates an agent proposing a purchase, TrustLayer evaluating its spending policy, requiring a human approval when appropriate, recording an agreement, and advancing through delivery and simulated settlement.

The current demo is deliberately non-custodial and simulated:
- No NEAR wallet is required yet.
- No NEAR transaction is submitted.
- No funds move.
- Policy evaluation is deterministic demo logic.
- Live NEAR execution is disabled by default.

See [NEAR Intents implementation plan](docs/near-intents/IMPLEMENTATION_PLAN.md).

**Important:** NEAR's official documentation currently states that the 1Click API has no testnet and that the Agent API is an experimental, mainnet-only beta. Do not enable live execution until a dedicated owner wallet, owner-signed agent policy, grant, server-side secrets and small-value risk review are complete.

## Development

```bash
npm install
npm run dev
```

## Environment

Existing TrustLayer environment variables remain unchanged. For the NEAR foundation, see the environment section in `docs/near-intents/IMPLEMENTATION_PLAN.md`. Keep all NEAR API keys and grant tokens server-side. Never expose them through `NEXT_PUBLIC_*` variables.

## Roadmap

1. Validate the agent proposal, negotiation, seller-authority and evidence workflows against Supabase with two independent accounts.
2. Add autonomous seller capability/reputation verification and richer task-specific negotiation strategies without expanding delegated permissions.
3. Add NEAR owner signing, agent creation and grant issuance.
4. Add policy-gated NEAR execution, idempotency and reconciliation.
5. Connect external platforms through the Partner API.
6. Continue Solana Ax, Aurora funding, and future regulated fiat integrations without coupling them to NEAR.

## Agent Settlement Network

TrustLayer includes an authenticated agent transaction workspace at `/agents`. It provides registered buyer/seller agent identities, owner-controlled spending policies, policy-gated proposals, immutable agreement snapshots, human approvals, seller evidence, buyer delivery acceptance, participant disputes and an append-only event history.

Before using this feature, apply `supabase/migrations/202611130001_agent_settlement_engine.sql`. The workflow is a persistent TrustLayer control plane; it does not itself move funds. NEAR Intents, Solana escrow/Ax and future regulated fiat providers remain separate execution adapters. Live NEAR execution is disabled until owner signing, agent grants, verified operation tracking and recovery controls are implemented.

See `docs/near-intents/IMPLEMENTATION_PLAN.md` for the data model, API routes, migration instructions, security boundaries and remaining integration work.

## AI Agent Intelligence & Negotiation

The agent workspace includes a persistent agent-to-agent negotiation flow at `/agents/negotiations`. Buyer agents can receive a business instruction, discover active seller agents, prepare an opening offer, exchange counteroffers and convert an accepted offer into the existing TrustLayer transaction engine. All converted offers are re-evaluated by the database-side spending policy function. Seller owners can configure a hard minimum price, preferred price, automatic counteroffers, optional automatic acceptance, a maximum round count, and an expiry/revocation setting. The seller agent can only act within that delegated authority; acceptance records agreement to commercial terms and does not authorize payment. AI reasoning is optional and configured with server-only `TRUSTLAYER_AGENT_AI_*` environment variables; without them, a rules-based recommendation is used. Negotiation does not itself fund or settle a transaction. See `docs/near-intents/AGENT_INTELLIGENCE_AND_NEGOTIATION.md` and `docs/near-intents/AUTONOMOUS_SELLER_AUTHORITY.md`; apply the migrations in order.
