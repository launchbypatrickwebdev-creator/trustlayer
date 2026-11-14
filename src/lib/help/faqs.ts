export type FaqItem = {
  id: string;
  q: string;
  a: string;
};

/**
 * Single source of truth for /faq and Support search.
 * Common questions on Support are a subset by id (COMMON_FAQ_IDS).
 */
export const FAQS: FaqItem[] = [
  {
    id: "custodial",
    q: "Is TrustLayer custodial?",
    a: "No. Crypto escrow is non-custodial. You authorize every movement with your own wallet. Funds sit in a Solana program account (PDA) until release, cancel, or admin resolve after a dispute. TrustLayer never holds your private keys or seed phrase. You can use TrustLayer from the web app, the Telegram bot, or the partner API — same deals and same on-chain settlement.",
  },
  {
    id: "deal-flow",
    q: "How does a deal work from start to finish?",
    a: "1) Create a deal (web, bot, or API): parties, amount, asset, rail, optional milestones and deadline. 2) Counterparty accepts the terms. 3) The funder locks funds on-chain with a wallet signature. 4) When the outcome is clear: release to the seller, cancel back toward the buyer (per program rules), or open a dispute. Creating a deal does not move money — only settlement actions do.",
  },
  {
    id: "kyc",
    q: "Do I need KYC to escrow SOL or USDC?",
    a: "No banking-style KYC is required for non-custodial crypto deals. Your full legal name on the profile supports identity, support, and disputes. Fiat rails may require country-specific verification when enabled.",
  },
  {
    id: "what-is-deal",
    q: "What is a TrustLayer deal?",
    a: "A deal is an agreement record: parties, amount, milestones, deadline, and rail (crypto or future fiat). Money movement only happens through settlement actions, not by editing the deal text.",
  },
  {
    id: "one-time-vs-milestone",
    q: "What is the difference between one-time and milestone escrow?",
    a: "One-time locks the full amount in a single on-chain escrow. Milestone splits the deal into stages; each stage has its own escrow that can be funded, released, or cancelled independently. Use one-time for a single delivery; milestones when work or payment is split.",
  },
  {
    id: "devnet-test",
    q: "How do I test on Solana Devnet?",
    a: "TrustLayer on Devnet uses test tokens only (no real value). 1) Install Phantom or Solflare. 2) Switch the wallet to Devnet — it must match the cluster shown in the app (e.g. “Solana Devnet · live”). 3) Link that wallet under Profile. 4) Get Devnet SOL (and USDC if you test SPL). 5) Create a small deal, fund, then release or cancel. Wrong network is the most common reason nothing works.",
  },
  {
    id: "devnet-faucet",
    q: "How do I get Devnet SOL and USDC?",
    a: "Devnet SOL (fees and SOL deals): use faucet.solana.com (paste your Devnet address), or backups such as solfaucet.com, faucet.quicknode.com/solana/devnet, or devnetfaucet.org. Some faucets ask for GitHub sign-in and may require account history (age or a repo or two) — that is the faucet’s rule, not TrustLayer’s. If one fails, wait for the rate limit or try another. Devnet USDC: use a Solana Devnet USDC faucet (e.g. faucet.circle.com when Solana Devnet is offered). Devnet USDC is not mainnet USDC. You need a little Devnet SOL first for fees and token accounts. If faucets keep failing, open a Support ticket with your Devnet address and what you already tried. Never share seed phrases.",
  },
  {
    id: "release",
    q: "When can the buyer release funds?",
    a: "After the escrow for that milestone is funded and not in dispute. Release is a wallet-signed transaction that pays the seller (minus the settlement fee) and closes the on-chain escrow.",
  },
  {
    id: "cancel",
    q: "When can the seller cancel?",
    a: "After the escrow is funded (rules depend on who created the deal). Cancel returns funds toward the buyer per program rules and may apply a smaller cancellation fee. Unfunded buyer-created escrows generally cannot be seller-cancelled until funded.",
  },
  {
    id: "dispute",
    q: "What happens in a dispute?",
    a: "Release and cancel freeze for that milestone. Both parties can share evidence in the dispute room. An admin can release to the seller or refund the buyer on-chain. Extending the admin review window does not change the agreed trade deadline.",
  },
  {
    id: "status-mismatch",
    q: "What if the blockchain succeeded but the app still shows the old status?",
    a: "The chain is the source of truth. Use retry or verify on the deal, or (for admins) Reconcile confirmed transaction with the Solana signature. That updates the database from the confirmed transaction without sending a second one.",
  },
  {
    id: "fees",
    q: "How do fees work?",
    a: "A settlement fee is charged on successful release (typically 2.5% on 1-leg fungible release (1.25% per Ax leg; 2% of USD valuation for NFT, paid in SOL). Cancel is about 0.2%; admin refund path about 0.5%. See fee mode on the deal. Network gas is always paid by the wallet that signs — you need SOL on the same cluster for fees. TrustLayer does not charge gas; the chain does.",
  },
  {
    id: "wallets",
    q: "Which wallets and networks are supported?",
    a: "Solana wallets such as Phantom and Solflare via the in-app selector. The wallet network must match TrustLayer (Devnet for testing, Mainnet when the app is on mainnet). Always check the cluster badge in the app and the network banner in the wallet before signing.",
  },
  {
    id: "simulation",
    q: "Why did my fund or release simulation fail?",
    a: "Common causes: insufficient SOL for amount + fee + network fee, wrong network, expired blockhash if you waited too long on the wallet prompt, or PDA mismatch. Ensure balance headroom, confirm Devnet vs Mainnet, and approve prompts promptly.",
  },
  {
    id: "fiat",
    q: "Is fiat (e.g. NGN) live?",
    a: "Not for live settlement yet. Fiat will use the same deal and event model; payment will go through a provider when compliance and rails are ready. Limits and verification may apply by country. Crypto on Solana is the live path today.",
  },
  {
    id: "telegram",
    q: "Can I use TrustLayer from Telegram?",
    a: "Yes. The TrustLayer Telegram bot is live. It uses the same account and deals as the web app — not a separate escrow system. Crypto fund, release, and cancel still require your wallet signature. Partners can also integrate via the API.",
  },
  {
    id: "help",
    q: "How do I get help?",
    a: "Use Support in the web app (include your deal code when the issue is about a transaction), the Telegram bot, or this FAQ. Partners can use the API. Never share your seed phrase, private key, password, or recovery code — TrustLayer staff will never ask for them. See Terms and Privacy in the footer for legal details.",
  },
];

/** Support page “Common questions” when search is empty */
export const COMMON_FAQ_IDS = [
  "deal-flow",
  "devnet-test",
  "devnet-faucet",
  "dispute",
] as const;

export function getCommonFaqs(): FaqItem[] {
  return COMMON_FAQ_IDS.map((id) => FAQS.find((f) => f.id === id)!).filter(
    Boolean
  );
}