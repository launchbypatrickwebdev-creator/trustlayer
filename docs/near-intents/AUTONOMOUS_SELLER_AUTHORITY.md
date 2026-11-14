# Autonomous Seller Agent & Delegated Authority

This layer allows a seller agent to counter or accept incoming buyer offers automatically, but only inside a seller owner's explicit, revocable authority. It is an agreement/negotiation capability, not wallet delegation and not payment execution.

## Migration

Apply after the previous agent migrations:

1. `202611130001_agent_settlement_engine.sql`
2. `202611130002_agent_negotiation_engine.sql`
3. `202611130003_agent_seller_authority.sql`

The migration adds `trustlayer_agent_seller_authorities`, a guarded configuration RPC, a guarded negotiation-response RPC, an atomic seller-authority evaluator, and database validation triggers. Direct authenticated updates to negotiation and offer rows are revoked; state changes use RPCs.

## Configure a seller agent

Open `/agents/negotiations` and use **Autonomous seller agent controls**. Choose an active seller/general agent and set:

- Minimum acceptable price (hard floor).
- Preferred price (must be at least the minimum).
- Automatic counteroffers (default on in the example; owner may disable).
- Automatic acceptance (default off).
- Maximum negotiation rounds (1–10; example 5).
- Optional authority expiry (maximum 90 days).
- Authority active/revoked toggle.

Example configuration:

| Setting | Value |
|---|---:|
| Minimum | $300 |
| Preferred | $350 |
| Auto-counter | Enabled |
| Auto-accept | Disabled |
| Maximum rounds | 5 |

## Seller automation rules

When a buyer opens a negotiation or submits a counteroffer, the server asks Postgres to evaluate the seller's current authority under a row lock:

1. No configured authority: no autonomous response; seller owner review remains available.
2. Revoked or expired authority: no autonomous response.
3. Incoming offer at/above minimum and auto-accept enabled: accept the offer. This accepts commercial terms only; it does not authorize or execute payment.
4. Auto-counter enabled and preferred price is higher than the incoming offer: counter at `min(preferred_price, buyer_budget)`, only if that amount is at least the minimum and above the incoming offer.
5. Otherwise: mark owner review required. The engine does not invent authority or accept an offer outside the configured rules.

The buyer budget is always a hard ceiling. The seller minimum is always a hard floor whenever seller authority is configured, including manual seller acceptance/counteroffers. The maximum round count applies to seller automation and manual seller counteroffers. The database validates participant identity, agent identity and offer amount even if an API route is bypassed.

## Example outcomes

With minimum `$300`, preferred `$350`, auto-counter enabled, auto-accept disabled, max rounds `5`:

- Buyer offers `$250`, budget `$500` → seller agent counters `$350`.
- Buyer offers `$325`, budget `$500` → seller agent counters `$350`.
- Buyer offers `$360` → owner review; it is not automatically accepted because auto-accept is disabled.
- Buyer budget `$280` → owner review; the engine cannot create a counter at/above the seller floor while staying within buyer budget.
- Auto-accept enabled and buyer offers `$300` or more → seller agent may accept, subject to active/unexpired authority and round limit.

## Security boundaries

- AI-generated text is advisory and is never interpreted as permission.
- The seller owner's database-backed authority is the source of truth.
- Authority changes increment a version; negotiations record the version used for automated decisions.
- Owners can revoke authority or set an expiry. The next automated evaluation checks the current row, not a stale copy stored in the negotiation.
- Seller automation cannot alter the buyer's spending policy or create a transaction directly.
- An accepted negotiation still has to be finalized by the buyer through `tl_agent_create_transaction`, which performs the buyer-side deterministic policy evaluation.
- Agreement acceptance is not funding, settlement, wallet signing or asset transfer. NEAR Intents and Solana adapters remain separate execution integrations.

## API and database operations

- `GET /api/agent-network/seller-authority` — list the authenticated owner's seller agents and authority settings.
- `POST /api/agent-network/seller-authority` — configure or update authority through `tl_agent_set_seller_authority`.
- `tl_agent_apply_seller_authority(negotiation_id)` — evaluate an incoming buyer offer under seller authority.
- `tl_agent_respond_negotiation(...)` — guarded accept/reject/counter transition; buyer counters trigger seller automation.
- `tl_agent_link_negotiation_transaction(...)` — link the buyer-created transaction after deterministic policy evaluation.

## Required validation before deployment

Test with two separate authenticated accounts and two agents:

1. Configure seller authority as in the example.
2. Start a buyer negotiation at `$250` with a `$500` budget. Verify an automatic `$350` seller counter.
3. Counter from the buyer at `$325`. Verify a new seller counter at `$350`.
4. Verify no offer can be inserted above the buyer budget or below the configured seller floor.
5. Verify a `$280` buyer budget cannot cause a below-minimum seller counter.
6. Turn on auto-accept and verify an offer at `$300` is accepted as terms only.
7. Revoke authority and verify no further automated seller response occurs.
8. Set expiry in the past (or wait for expiry) and verify automation stops.
9. Reach the configured round limit and verify no additional seller counter is created.
10. Verify buyer finalization still invokes the existing transaction policy RPC and does not move funds.

Do not enable live wallet execution as part of these tests.
