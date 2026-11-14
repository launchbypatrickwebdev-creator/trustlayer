# TrustLayer Agent Intelligence & Negotiation Engine

## Purpose

The engine lets a buyer agent receive a business instruction, select a registered seller agent, create an opening offer, exchange counteroffers and convert an accepted offer into a TrustLayer transaction. It is an application-layer capability and is deliberately independent of NEAR or Solana wallet execution.

## Trust boundaries

- AI is advisory. It may summarise context and draft negotiation language, but it cannot approve spending, accept delivery, resolve disputes or execute payments.
- The buyer's maximum budget is stored on the negotiation and enforced again by the API when a counteroffer is submitted.
- When an offer is accepted, the buyer must explicitly convert it into a transaction.
- Conversion calls `tl_agent_create_transaction`, the existing database-side policy gate. This rechecks the buyer agent, seller agent, spending policy, daily limit, flagged counterparties and agreement requirements.
- An accepted negotiation is not a funded or settled transaction. Settlement requires a separately authorised adapter and verifiable execution reference.
- Seller and buyer must be different authenticated TrustLayer accounts.

## Database

Apply migrations in order:

1. `202611130001_agent_settlement_engine.sql`
2. `202611130002_agent_negotiation_engine.sql`
3. `202611130003_agent_seller_authority.sql`

The second migration adds persistent negotiation sessions, offer rounds and conversation messages. The third adds owner-configured seller authority, automatic counteroffers/acceptance, hard minimum-price enforcement, expiry/revocation, round limits, and guarded database state-transition functions. Apply all three in Supabase before using `/agents/negotiations`.

## AI provider

The engine works without an external model using a deterministic rules-based recommendation. To enable model-assisted reasoning, configure these server-only environment variables:

- `TRUSTLAYER_AGENT_AI_BASE_URL` — OpenAI-compatible API base URL (for example `https://api.openai.com/v1`).
- `TRUSTLAYER_AGENT_AI_API_KEY` — secret API key.
- `TRUSTLAYER_AGENT_AI_MODEL` — model identifier supported by that endpoint.

The server calls `/chat/completions` and requests JSON output. If the provider is unavailable, malformed, or unconfigured, the rules-based recommendation is used. The model output is validated and its recommended price is clamped to the buyer's maximum budget. Do not place these values in `NEXT_PUBLIC_*` variables.

## API

- `GET /api/agent-network/discover?q=design&type=seller` — discover active seller agents owned by other accounts.
- `GET /api/agent-network/negotiations` — list negotiations visible to the authenticated participant.
- `POST /api/agent-network/negotiations` — create a negotiation and its opening offer.
- `POST /api/agent-network/negotiations/:id/respond` — accept, reject or counter the current open offer.
- `POST /api/agent-network/negotiations/:id/finalize` — buyer-only conversion of an accepted offer into the existing policy-controlled transaction engine.

## Current limitations

- Price and agreement fields are USD-denominated for this prototype. Do not treat USD as a supported fiat payment rail.
- Discovery is based on registered public agent profiles, not a reputation or capability-verification network.
- Seller owners can delegate bounded automatic counteroffers and optional acceptance to their seller agents. No unrestricted agent authority or wallet key delegation is provided.
- Automatic acceptance accepts commercial terms only. It does not authorize funding, release, or settlement.
- Seller authority is USD-denominated in this prototype; multi-currency pricing and FX routing remain separate work.
- This layer does not implement NEAR wallet signatures, NEAR Intents execution, Solana signing, escrow funding or settlement.
