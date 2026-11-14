# Agent Network → TrustLayer Deal → Settlement

## Non-negotiable authority boundary

- Agent network: records discovery, negotiation, delegated commercial authority and accepted terms.
- TrustLayer deal: owns the normal deal lifecycle and settlement adapter.
- Wallet: authorizes every Solana transaction through the existing wallet flow.
- Chain: proves the result; TrustLayer records it only through existing verification/reconciliation routes.

No agent API is permitted to set an agent transaction to `funded` or `settled`. The database trigger permits those states only inside the service-role `tl_agent_sync_verified_deal` path after it verifies the existing crypto settlement record, signature and reconciliation state.

## Promotion flow

1. Seller owner explicitly accepts the agent transaction (`tl_agent_accept_agreement`).
2. Buyer owner confirms the normal TrustLayer agreement checklist and chooses a supported settlement configuration.
3. `POST /api/agent-network/transactions/:id/bridge` verifies the buyer owner, seller acceptance event, converted negotiation, accepted offer, buyer policy decision and explicit execution grant.
4. It calls the existing `createDeal()` domain path and then `finalizeDealAgreement()`. It does not write a parallel deal row.
5. The deal carries `creator_checklist.agent_transaction_id` as an atomic recovery marker. A unique `deals.agent_transaction_id` link is written by `tl_agent_complete_bridge`.
6. The buyer/counterparty then use the existing deal page, deal invitation acceptance, crypto action session, Solana prepare, wallet signing, record and verification flows.

Bridge lease is serialized in `tl_agent_begin_bridge`. If the request stops after deal creation, the marker is used to recover the already-created deal instead of creating a duplicate. A pending lease can be reclaimed after five minutes.

## Settlement configuration

### One-leg

The caller must explicitly provide `SOL` or `USDC` and a positive crypto amount. USD `amount_usd` is not silently treated as SOL or USDC. SOL additionally requires an unexpired quote containing provider, reference, rate, USD amount and exact SOL amount. The supplied quote fields are checked for arithmetic consistency and a short validity window, then persisted with the bridge metadata and TrustLayer deal checklist. The quote source is not independently attested by this bridge; the UI must not describe a user-entered provider/reference as a verified market feed.

### Ax

Ax is available only when the accepted negotiation was explicitly created with `settlementIntent.kind = atomic_exchange`, including both explicitly defined SOL/USDC legs and exact amounts. The existing program's SOL↔SOL pair is permitted; same-asset USDC↔USDC is rejected. The bridge compares its request to those accepted legs. A service purchase cannot be converted to Ax by simply changing a request parameter. Generic seller auto-accept and price-only auto-counter are disabled for Ax negotiations; the seller owner must review and respond explicitly. Existing Ax leg persistence and `solana_ax` prepare/fund/record routes remain authoritative.

Both owners must have their own active execution grant before Ax promotion: the buyer grant authorizes deal creation for leg A, and the seller grant must authorize `settlement:fund` for leg B and the seller's own linked wallet. Each party's grant is rechecked when that party prepares its funding transaction. Both linked wallets are still required by the existing Ax flow.

## Execution grants

`trustlayer_agent_execution_grants` stores owner-authorized scopes, asset allowlists, wallet allowlists, settlement types, per-transaction and daily USD limits, approval thresholds, expiry and revocation. Above-threshold execution requires a separate owner approval event tied to the grant; creating the grant does not approve a purchase. The grant does not contain a private key and cannot sign. `tl_agent_authorize_execution` is called by the bridge and existing Solana prepare routes. Wallet allowlists are enforced at preparation; the bridge binds Ax wallets to the buyer's and seller's own linked Devnet wallet records and never accepts a buyer-supplied seller wallet. Wallet signature is still required. Revocation blocks future prepare requests, but cannot cancel a transaction that was already signed and broadcast to Solana.

## Evidence and risk

Agent evidence uploads are private (`agent-evidence` bucket), authenticated, limited to 10 MB and JPEG/PNG/PDF/plain text. The server validates content signature and records SHA-256. Download access is via short-lived signed URLs for transaction participants. For bridged transactions, evidence creates a deal event but does not advance either transaction status; delivery acceptance and disputes must use the normal deal lifecycle.

Risk evaluation is explainable and rule-based using counterparty flags, dispute events, failed/reversed execution signals and agent status. A risk label is not a fraud determination.

## Agent communication and procurement

Agents advertise protocol version and structured capability tags. Negotiations retain structured business instruction, task, purpose, deliverable, acceptance criteria, offers and messages. Atomic-exchange intent is stored on the negotiation before seller acceptance and copied into the agent transaction.

Business procurement profiles add approved supplier handles, categories, per-purchase/daily budgets, an approval threshold and a repeat-purchase rule. The category, supplier and budget rules are rechecked in the database at bridge time; amounts above the procurement threshold require a separate buyer-owner approval event. When repeat purchases are disabled, the database blocks the same task/category/supplier repeat for 30 days. This is a duplicate-repeat guard, not a recurring procurement scheduler, treasury custody or fiat settlement.

## Multi-rail and NEAR boundary

The bridge uses the shared TrustLayer deal model, whose domain retains `crypto | fiat` rails and settlement-provider abstractions. This agent bridge currently enables only Solana `solana_escrow` and `solana_ax`. Fiat provider registry is not a live fiat escrow or bank settlement service.

NEAR Intents remains a server-side, configuration-gated integration. The linked-deal workspace can request a read-only/dry quote through the agent transaction `near-quote` endpoint. No NEAR swap execution is wired into the agent-to-deal happy path; it cannot bypass the TrustLayer deal, owner grant, wallet authorization or chain reconciliation path.

## Apply and validate

1. Apply `supabase/migrations/202611140001_agent_deal_bridge_security.sql` after migrations 001–003.
2. Ensure the Supabase Storage schema is enabled (the migration creates a private bucket and object policies).
3. Create an owner execution grant for the buyer agent with `deal:create`, `settlement:create`, `settlement:fund`, the exact assets/adapters and the permitted wallet.
4. For Ax, create a separate seller-owner grant with `settlement:fund` for the seller agent and its asset/wallet.
5. Test on Devnet: negotiation → seller agent transaction acceptance → buyer bridge → deal invitation acceptance → existing prepare/sign/record → verified fund → release/dispute/cancel.
6. Confirm agent transaction status changes only after the existing crypto record route calls `tl_agent_sync_verified_deal`; the database trigger rejects funded/settled status changes outside that verified sync context.
7. For an execution grant whose approval threshold is below the transaction amount, record the explicit owner approval from the transaction workspace before bridge or funding.

## Hackathon claim boundaries

Demonstrable after deployment and Devnet testing: agent negotiation and policy, owner grants, bridge into normal TrustLayer deals, Solana escrow/Ax funding through wallet authorization, private evidence and explainable risk signals.

Not claimed as live: fiat escrow, bank-held conditional settlement, autonomous treasury, full recurring procurement, production scam detection, or NEAR live swap execution in the agent happy path.
