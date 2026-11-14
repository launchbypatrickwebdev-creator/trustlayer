# TrustLayer Hackathon Repository Status

## Scope
This repository is curated from the supplied `trustlayer-hackathons.zip` for the TrustLayer agent-settlement hackathon demo. The application source has been retained broadly to avoid breaking shared imports and routes.

## What this repository contains
- Next.js application and its existing source tree.
- Agent workspace and negotiation pages/API routes present in the supplied archive.
- NEAR Intents integration foundation and related implementation notes.
- Solana/deal code present in the supplied archive.
- Agent bridge/security design documentation.

## Important verification status
This archive has been curated, not certified as build-ready or production-ready. A successful local `npm ci` and `npm run build` have not been established by this packaging step.

The supplied ZIP did **not** contain a `supabase/migrations/` directory. Therefore, the database migrations required by the README and agent bridge documentation are not included here. Restore the exact, reviewed SQL migrations (including the corrected migration 004, if that is the version you intend to use) under `supabase/migrations/` before expecting another developer to reproduce the database setup. Do not replace them with guessed or regenerated SQL.

## Demo limitations to disclose
- NEAR live execution is not demonstrated by this repository's README; the described demo is simulated and does not submit NEAR transactions or move funds.
- The presence of Solana settlement source code does not by itself prove that the agent bridge is connected end-to-end or that a wallet-authorized settlement has been tested.
- Fiat settlement is a future provider integration, not a live feature.
- Do not describe unverified flows as production-ready.

## Before pushing
1. Restore and review the required Supabase SQL migrations.
2. Copy `.env.example` to `.env.local` and fill only the credentials needed for local testing.
3. Confirm `.env.local`, private keys, service-role keys, grant tokens and other secrets are not staged.
4. Run `npm ci`, `npm run build`, and the relevant two-account Supabase/Devnet end-to-end tests.
5. Update this file with the actual test results before publishing.
