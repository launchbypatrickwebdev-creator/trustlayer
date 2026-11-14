# TrustLayer Agent Settlement Network — Engine Build

## Product definition

The Agent Settlement Network is a shared TrustLayer transaction workflow for autonomous software agents. Agents can discover counterparties, propose purchases or services, negotiate within owner-defined limits, and create agreement-backed transactions. TrustLayer—not the agent prompt—enforces policy, approvals, evidence and transaction state transitions.

The product has two distinct planes:

1. **TrustLayer control plane:** agent identities, owner policies, proposals, immutable agreement snapshots, approvals, evidence, disputes and audit history.
2. **Execution plane:** a provider adapter (NEAR Intents, Solana escrow/Ax, or a future regulated fiat provider) that executes an authorised settlement instruction. A provider success does not prove service delivery; delivery acceptance is a separate TrustLayer condition.

## Implemented in this build

- Authenticated agent registry with public handles and buyer/seller/general roles.
- Owner-scoped policy records: per-transaction cap, autonomous approval threshold, daily spend limit, agreement requirement and flagged-counterparty rule.
- Database-side policy evaluation in `tl_agent_create_transaction`; browser-supplied decisions are not trusted.
- Idempotent proposal creation using `(owner_user_id, idempotency_key)`.
- Immutable agreement snapshot and SHA-256 hash at proposal time.
- Human approval transition for proposals above the autonomous threshold.
- Seller-owner agreement acceptance.
- Seller evidence submission, buyer delivery acceptance and participant dispute opening.
- Append-only lifecycle events with actor, transition and event details.
- Row-level security for agent ownership, transaction participants, evidence and event visibility.
- API routes under `/api/agent-network/*` and a persistent `/agents` workspace.

## State model

`blocked` or `awaiting_approval` / `awaiting_counterparty` → `agreed` → `evidence_submitted` → `accepted` → `settled` (only after a verified execution adapter is integrated).

A transaction can enter `disputed` from an eligible non-terminal state. The current engine deliberately does not allow a browser or agent to assert that a payment settled. The database records `accepted` as delivery acceptance; it does not imply funds moved.

## Apply the database migration

Apply `supabase/migrations/202611130001_agent_settlement_engine.sql` to the Supabase project before using the `/agents` workspace. It creates the agent registry, policies, flags, transactions, evidence and event tables, RLS policies, and security-definer transition functions. It is additive and does not alter existing deal, Solana escrow, Ax or Aurora tables.

Required existing environment variables remain the normal Supabase URL and anon key. The migration does not require a NEAR wallet, NEAR API key, or service-role key.

## API

- `GET/POST /api/agent-network/agents` — list active public agents and register an owned agent.
- `GET/PATCH /api/agent-network/policy` — retrieve or update owner spending policy.
- `GET/POST /api/agent-network/transactions` — list participant transactions or create an idempotent proposal.
- `GET /api/agent-network/transactions/:id` — transaction, event and evidence history.
- `POST /api/agent-network/transactions/:id/approve` — buyer owner approval.
- `POST /api/agent-network/transactions/:id/accept` — seller owner accepts agreement.
- `POST /api/agent-network/transactions/:id/evidence` — seller submits delivery evidence.
- `POST /api/agent-network/transactions/:id/accept-delivery` — buyer accepts delivery.
- `POST /api/agent-network/transactions/:id/dispute` — either participant opens a dispute.
- `GET/POST /api/agent-network/flags` — owner-specific counterparty risk flags.

## NEAR integration boundary

NEAR Intents is not the agreement or dispute engine. It is an execution/liquidity integration. The current NEAR client foundation remains server-side and disabled by default. No wallet is required for the persistent transaction engine. Do not enable live Agent API execution until owner signing, agent creation, grants, policy-to-grant mapping, idempotency, verified operation status and recovery have been implemented and reviewed.

The 1Click API and Agent API have different execution models; do not conflate user deposit flows with agent-grant execution. Confirm the current official NEAR documentation before connecting live APIs because the Agent API is experimental and network availability may be restricted.

## Not yet implemented

- AI model/provider integration for negotiation and task decomposition. The model may propose; deterministic TrustLayer policy must decide.
- Agent-to-agent messaging/negotiation protocol and discovery search.
- Advanced policy editor controls for approval modes, categories, asset allowlists, agent scopes and expiry. Basic per-transaction, autonomous and daily limits are editable in the workspace.
- Secure evidence file upload/storage lifecycle and malware scanning.
- Dispute resolution/admin review interface.
- Verified NEAR owner wallet signing, agent creation, grants, quote/execution/status adapter and provider callbacks.
- Solana escrow/Ax adapter invocation from an agent transaction.
- Fiat/BaaS execution. Fiat remains a future provider rail and is not removed from the architecture.
- Full integration, load, security and migration testing against the user's Supabase project.

## Security boundaries

- Never expose NEAR partner keys, grant tokens, or wallet private keys in browser code or `NEXT_PUBLIC_*` variables.
- Agents cannot update their own policy or approve their own over-threshold proposals.
- Policy decisions are made in database functions using the authenticated owner and stored policy.
- Agreement snapshots and event history are retained for auditability.
- A proposal, agreement, delivery acceptance and payment settlement are separate facts.
- No payment is moved by the current Agent Settlement Network workflow.
