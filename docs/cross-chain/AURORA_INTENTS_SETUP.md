# TrustLayer cross-chain funding — Aurora Intents Deposits

Aurora is a funding rail only. It delivers an eligible fungible asset to the participant's Solana wallet. The participant then signs TrustLayer's existing `fund_*` or `fund_ax` transaction. Aurora status never marks a deal or escrow leg funded.

## Environment

Set these server-side values after validating the asset IDs against Aurora's supported-token response and completing real Solana destination tests:

- `AURORA_INTENTS_APP_KEY`
- `AURORA_SOLANA_SOL_ASSET_ID`
- `AURORA_SOLANA_USDC_ASSET_ID`
- `AURORA_SOLANA_USDT_ASSET_ID`
- `SOLANA_RPC_URL` (recommended; otherwise existing cluster RPC is used)

Do not set destination IDs by symbol alone. Confirm that each exact Aurora asset ID represents the intended Solana mint on the selected cluster. USDT must also be configured in TrustLayer's Solana environment.

## API

- `GET /api/cross-chain/assets` — authenticated supported-token response and enabled TrustLayer destinations.
- `POST /api/cross-chain/quote` — authenticated participant quote; body: `{ dealId, sourceAssetId, sourceAmount, sourceChain, refundTo, legIndex? }`. `sourceAmount` is the integer base-unit amount expected by Aurora. `legIndex` is `0` or `1` for Ax; omit for one-leg.
- `GET /api/cross-chain/orders/:orderId` — participant-owned order lookup.
- `GET /api/cross-chain/status?orderId=...` — polls Aurora transaction history, then independently verifies the returned Solana signature before marking `asset_delivered`.

The initial UI accepts the exact Aurora source asset ID and raw source amount. Replace this operator-oriented input with a token picker/decimal-aware amount entry once the live `/api/tokens` response shape and asset catalog have been verified in the target Aurora account.

## NFT policy

TrustLayer's existing Solana NFT escrow remains intact. The `cross_chain_nft_transfers` table reserves a provider-neutral record for a future verified NFT bridge/transfer adapter. The fungible Deposits API is not treated as an NFT bridge. No cross-chain NFT funding is enabled until a provider demonstrates source NFT lock/burn, destination mint/representation, metadata/collection integrity and verifiable Solana ownership.

## Important pre-production gates

1. Verify exact recipient format for a normal Solana wallet with a real quote.
2. Verify SOL, official USDC and official USDT destination IDs/mints on the configured cluster.
3. Complete a real source deposit and capture a Solana destination transaction signature.
4. Confirm direct delivery to the participant wallet (no intermediary withdrawal step).
5. Validate the `transactions` endpoint's `walletAddress` query semantics and returned transaction matching against the real quote.
6. Verify source asset ID, chain and refund address ownership/format against the live token catalogue and connected source wallet.
7. Add a background poll/reconciliation worker before production; the status endpoint currently refreshes on participant request.

## Security note

The quote route derives the deal, participant, required destination asset, destination mint and destination wallet from TrustLayer records. Source-chain refund address is supplied by the participant and must be validated against the connected source wallet in the production wallet flow. Never treat the `asset_delivered` state as escrow funding; existing on-chain escrow verification remains authoritative.
