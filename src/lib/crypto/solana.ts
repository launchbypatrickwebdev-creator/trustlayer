import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// =====================================================
// Cluster + program (fail closed on mainnet without explicit program id)
// Admin / fee: keep current deploy keys (not swapped to program constants yet)
// =====================================================

const requestedCluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim();
if (
  requestedCluster &&
  requestedCluster !== "devnet" &&
  requestedCluster !== "mainnet-beta"
) {
  throw new Error(
    "NEXT_PUBLIC_SOLANA_CLUSTER must be devnet or mainnet-beta."
  );
}
export const SOLANA_CLUSTER: "devnet" | "mainnet-beta" =
  requestedCluster === "mainnet-beta" ? "mainnet-beta" : "devnet";

const configuredProgramId =
  process.env.NEXT_PUBLIC_TRUSTLAYER_PROGRAM_ID?.trim() || "";
if (SOLANA_CLUSTER === "mainnet-beta" && !configuredProgramId) {
  throw new Error(
    "Mainnet is disabled until NEXT_PUBLIC_TRUSTLAYER_PROGRAM_ID points to the verified Mainnet deployment."
  );
}
export const TRUSTLAYER_PROGRAM_ID = new PublicKey(
  configuredProgramId || "99bimYMBRnPkLjFS8CTVy2aUUyoWNC9rLXpaLqUWr7Lb"
);

/** Legacy export name; RPC follows selected cluster. */
export const DEVNET_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  (SOLANA_CLUSTER === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

export const SYSTEM_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111"
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

/** Native SOL placeholder mint — Pubkey::default() (32 zero bytes), NOT System Program */
export const NATIVE_SOL_MINT = new PublicKey(new Uint8Array(32));

// =====================================================
// Supported mints (align with on-chain allowlist for this deploy)
// =====================================================

const configuredUsdcMint = process.env.NEXT_PUBLIC_USDC_MINT?.trim() || "";
const configuredUsdcCluster =
  process.env.NEXT_PUBLIC_USDC_CLUSTER?.trim() || "";
export const USDC_MINT = new PublicKey(
  configuredUsdcMint ||
    (SOLANA_CLUSTER === "mainnet-beta"
      ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
);

const configuredUsdtMint = process.env.NEXT_PUBLIC_USDT_MINT?.trim() || "";
const configuredUsdtCluster =
  process.env.NEXT_PUBLIC_USDT_CLUSTER?.trim() || "";
/** Null on devnet unless NEXT_PUBLIC_USDT_MINT is set (no silent mainnet mint). */
export const USDT_MINT: PublicKey | null = configuredUsdtMint
  ? new PublicKey(configuredUsdtMint)
  : SOLANA_CLUSTER === "mainnet-beta"
    ? new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB")
    : null;

const configuredEurcMint = process.env.NEXT_PUBLIC_EURC_MINT?.trim() || "";
export const EURC_MINT = new PublicKey(
  configuredEurcMint || "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr"
);

const configuredPyusdMint = process.env.NEXT_PUBLIC_PYUSD_MINT?.trim() || "";
export const PYUSD_MINT = new PublicKey(
  configuredPyusdMint || "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo"
);

const configuredUsdsMint = process.env.NEXT_PUBLIC_USDS_MINT?.trim() || "";
export const USDS_MINT = new PublicKey(
  configuredUsdsMint || "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA"
);

const configuredFdusdMint = process.env.NEXT_PUBLIC_FDUSD_MINT?.trim() || "";
export const FDUSD_MINT = new PublicKey(
  configuredFdusdMint || "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u"
);

function assertConfiguredMintCluster(asset: "USDC" | "USDT") {
  if (
    asset === "USDC" &&
    configuredUsdcMint &&
    configuredUsdcCluster &&
    configuredUsdcCluster !== SOLANA_CLUSTER
  ) {
    throw new Error(
      `NEXT_PUBLIC_USDC_CLUSTER must match NEXT_PUBLIC_SOLANA_CLUSTER (${SOLANA_CLUSTER}).`
    );
  }
  if (asset === "USDT") {
    if (!USDT_MINT) {
      throw new Error(
        "USDT is not configured for this Solana cluster. Set NEXT_PUBLIC_USDT_MINT (and optionally NEXT_PUBLIC_USDT_CLUSTER)."
      );
    }
    if (
      configuredUsdtMint &&
      configuredUsdtCluster &&
      configuredUsdtCluster !== SOLANA_CLUSTER
    ) {
      throw new Error(
        `NEXT_PUBLIC_USDT_CLUSTER must match NEXT_PUBLIC_SOLANA_CLUSTER (${SOLANA_CLUSTER}).`
      );
    }
  }
}

/**
 * Associated Token Account for (owner, mint) under the classic Token program.
 */
export function getAssociatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

export const TRUSTLAYER_FEE_RECEIVER = new PublicKey(
  "CMcXTJKpD5YPgLhoh8eacbe6S9ptRGasJhoDgy1yRny3"
);

/** Must match on-chain TRUSTLAYER_ADMIN for this deploy */
export const TRUSTLAYER_ADMIN = new PublicKey(
  "EWMn7d8QLMu1azzgNTyGA3vMub5yMaVJYc7Fxdjad7Q6"
);

export const SOL_DECIMALS = 9;
export const USDC_DECIMALS = 6;
export const USDT_DECIMALS = 6;
export const EURC_DECIMALS = 6;
export const PYUSD_DECIMALS = 6;
export const USDS_DECIMALS = 6;
export const FDUSD_DECIMALS = 6;

export const MAX_MILESTONES = 10;
export const MIN_ESCROW_DURATION_SECONDS = 60;

const MAX_U64 = 18446744073709551615n;

export type CryptoAssetCode =
  | "SOL"
  | "USDC"
  | "USDT"
  | "EURC"
  | "PYUSD"
  | "USDS"
  | "FDUSD";
export type AssetTypeOnChain = 0 | 1; // NativeSol = 0, Spl = 1

export const CRYPTO_ASSET_CODES: CryptoAssetCode[] = [
  "SOL",
  "USDC",
  "USDT",
  "EURC",
  "PYUSD",
  "USDS",
  "FDUSD",
];

export function isCryptoAssetCode(code: string): code is CryptoAssetCode {
  return (CRYPTO_ASSET_CODES as string[]).includes(code.toUpperCase());
}

/** Classic Token 1/1 NFT (not pNFT / cNFT). */
export function isNftAssetCode(code: string): boolean {
  const c = String(code || "").toUpperCase().trim();
  return c === "NFT";
}

/** pNFT / cNFT are not available in this wave. */
export function isUnavailableNftFamily(code: string): boolean {
  const c = String(code || "").toUpperCase().trim();
  return c === "PNFT" || c === "CNFT";
}

export function assetMeta(asset: CryptoAssetCode): {
  assetType: AssetTypeOnChain;
  mint: PublicKey;
  decimals: number;
} {
  switch (asset) {
    case "SOL":
      return {
        assetType: 0,
        mint: PublicKey.default,
        decimals: SOL_DECIMALS,
      };
    case "USDC":
      assertConfiguredMintCluster("USDC");
      return {
        assetType: 1,
        mint: USDC_MINT,
        decimals: USDC_DECIMALS,
      };
    case "USDT":
      assertConfiguredMintCluster("USDT");
      return {
        assetType: 1,
        mint: USDT_MINT as PublicKey,
        decimals: USDT_DECIMALS,
      };
    case "EURC":
      return {
        assetType: 1,
        mint: EURC_MINT,
        decimals: EURC_DECIMALS,
      };
    case "PYUSD":
      return {
        assetType: 1,
        mint: PYUSD_MINT,
        decimals: PYUSD_DECIMALS,
      };
    case "USDS":
      return {
        assetType: 1,
        mint: USDS_MINT,
        decimals: USDS_DECIMALS,
      };
    case "FDUSD":
      return {
        assetType: 1,
        mint: FDUSD_MINT,
        decimals: FDUSD_DECIMALS,
      };
    default:
      throw new Error("Unsupported asset.");
  }
}

function encodeU64LE(value: bigint): Uint8Array {
  if (value < 0n || value > MAX_U64) {
    throw new Error("Value does not fit into u64.");
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function encodeI64LE(value: bigint): Uint8Array {
  const MIN_I64 = -(1n << 63n);
  const MAX_I64 = (1n << 63n) - 1n;
  if (value < MIN_I64 || value > MAX_I64) {
    throw new Error("Value does not fit into i64.");
  }
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
}

/**
 * PDA: ["escrow", initiator, deal_id_le, milestone_index]
 */
export function deriveEscrowPda(
  initiator: PublicKey,
  chainDealId: string,
  milestoneIndex: number = 0
): [PublicKey, number] {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) {
    throw new Error("Invalid on-chain deal ID.");
  }
  if (milestoneIndex < 0 || milestoneIndex > 255) {
    throw new Error("Invalid milestone index.");
  }

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      initiator.toBuffer(),
      Buffer.from(encodeU64LE(dealId)),
      Buffer.from([milestoneIndex & 0xff]),
    ],
    TRUSTLAYER_PROGRAM_ID
  );
}

export function toBaseUnits(amount: string, decimals: number): bigint {
  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Invalid crypto amount.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new Error(
      `Amount supports at most ${decimals} decimal places for this asset.`
    );
  }
  const padded = fraction.padEnd(decimals, "0");
  const scale = 10n ** BigInt(decimals);
  const result = BigInt(whole) * scale + BigInt(padded || "0");
  if (result <= 0n) {
    throw new Error("Crypto amount must be greater than zero.");
  }
  return result;
}

/** Default on-chain deadline if UI omits: now + 365 days */
export function defaultDeadlineUnix(fromMs: number = Date.now()): number {
  return Math.floor(fromMs / 1000) + 365 * 24 * 60 * 60;
}

export function assertDeadlineUnix(
  deadlineUnix: number,
  nowSec?: number
): void {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(deadlineUnix) || deadlineUnix <= now) {
    throw new Error("Deadline must be in the future.");
  }
  if (deadlineUnix < now + MIN_ESCROW_DURATION_SECONDS) {
    throw new Error(
      `Deadline must be at least ${MIN_ESCROW_DURATION_SECONDS} seconds from now.`
    );
  }
}

/**
 * create_escrow args:
 * deal_id, milestone_index, milestone_count, amount (principal),
 * settlement_fee_amount (explicit face fee), seller, deadline, asset_type, mint
 */
/** On-chain FeePayer: Funder = 0, Receiver = 1 */
export type FeePayerOnChain = 0 | 1;
export const FEE_PAYER_FUNDER: FeePayerOnChain = 0;
export const FEE_PAYER_RECEIVER: FeePayerOnChain = 1;

/**
 * Map web fee_mode to on-chain FeePayer.
 * on_top → Funder (lock amount + fee)
 * from_amount → Receiver (lock amount only; fee from seller proceeds)
 */
/**
 * Map UI fee mode → on-chain FeePayer.
 * Phase 1: always Funder (fee on top). prepare/fund still use amount+fee lock math.
 * from_amount as Receiver needs a full prepare/fund redesign — do not send Receiver yet.
 */
export function feeModeToOnChain(_feeMode: string | null | undefined): FeePayerOnChain {
  return FEE_PAYER_FUNDER;
}

/**
 * create_escrow args: deal_id, milestone_index, milestone_count, amount,
 * settlement_fee_amount, seller, deadline, asset_type, mint, fee_payer
 */
export function createEscrowInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  milestoneCount: number,
  amountBaseUnits: bigint,
  settlementFeeAmount: bigint,
  seller: PublicKey,
  deadlineUnix: number,
  assetType: AssetTypeOnChain,
  mint: PublicKey,
  feePayer: FeePayerOnChain = FEE_PAYER_FUNDER
): Buffer {
  assertDeadlineUnix(deadlineUnix);
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  if (amountBaseUnits <= 0n || amountBaseUnits > MAX_U64) {
    throw new Error("Invalid on-chain amount.");
  }
  if (settlementFeeAmount <= 0n || settlementFeeAmount > MAX_U64) {
    throw new Error("Invalid settlement fee amount.");
  }
  if (feePayer === FEE_PAYER_FUNDER && settlementFeeAmount > amountBaseUnits) {
    throw new Error("Settlement fee cannot exceed principal.");
  }
  if (feePayer === FEE_PAYER_RECEIVER && settlementFeeAmount >= amountBaseUnits) {
    throw new Error("Receiver-pays fee must be less than principal.");
  }
  if (milestoneCount < 1 || milestoneCount > MAX_MILESTONES) {
    throw new Error("Invalid milestone count.");
  }
  if (milestoneIndex < 0 || milestoneIndex >= milestoneCount) {
    throw new Error("Invalid milestone index.");
  }

  const discriminator = Buffer.from([253, 215, 165, 116, 36, 108, 68, 80]);
  const data = new Uint8Array(8 + 8 + 1 + 1 + 8 + 8 + 32 + 8 + 1 + 32 + 1);
  let o = 0;
  data.set(discriminator, o);
  o += 8;
  data.set(encodeU64LE(dealId), o);
  o += 8;
  data[o++] = milestoneIndex & 0xff;
  data[o++] = milestoneCount & 0xff;
  data.set(encodeU64LE(amountBaseUnits), o);
  o += 8;
  data.set(encodeU64LE(settlementFeeAmount), o);
  o += 8;
  data.set(seller.toBytes(), o);
  o += 32;
  data.set(encodeI64LE(BigInt(deadlineUnix)), o);
  o += 8;
  data[o++] = assetType;
  data.set(mint.toBytes(), o);
  o += 32;
  data[o++] = feePayer & 0xff;
  return Buffer.from(data);
}

export function createFundEscrowInstructionData(
  chainDealId: string,
  milestoneIndex: number
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([155, 18, 218, 141, 182, 213, 69, 201]);
  const data = new Uint8Array(17);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  return Buffer.from(data);
}

export function createFundEscrowSplInstructionData(
  chainDealId: string,
  milestoneIndex: number
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([1, 137, 40, 139, 85, 101, 166, 186]);
  const data = new Uint8Array(17);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  return Buffer.from(data);
}

/** release(deal_id, milestone_index, initiator) */
export function createReleaseInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([253, 249, 15, 206, 28, 127, 193, 241]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}

export function createReleaseSplInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([115, 22, 93, 89, 235, 139, 53, 130]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}

export function createCancelBySellerInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([32, 252, 43, 185, 2, 184, 112, 85]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}

export function createCancelSplInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) {
    throw new Error("Invalid on-chain deal ID.");
  }
  const discriminator = Buffer.from([147, 74, 147, 41, 28, 118, 70, 94]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}


/** cancel_unfunded — either party; closes unfunded draft; rent → initiator. */
export function createCancelUnfundedInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([7, 11, 92, 226, 201, 56, 156, 158]);
  const data = new Uint8Array(8 + 8 + 1 + 32);
  let o = 0;
  data.set(discriminator, o); o += 8;
  data.set(encodeU64LE(dealId), o); o += 8;
  data[o++] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), o);
  return Buffer.from(data);
}

export function createOpenDisputeInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([137, 25, 99, 119, 23, 223, 161, 42]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}

export function createAdminResolveReleaseInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([227, 9, 135, 193, 63, 99, 92, 241]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}

export function createAdminResolveRefundInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([227, 143, 18, 108, 25, 0, 106, 230]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}

export function createAdminResolveReleaseSplInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([129, 183, 206, 57, 36, 103, 232, 108]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}

export function createAdminResolveRefundSplInstructionData(
  chainDealId: string,
  milestoneIndex: number,
  initiator: PublicKey
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([116, 172, 152, 221, 242, 26, 211, 82]);
  const data = new Uint8Array(49);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = milestoneIndex & 0xff;
  data.set(initiator.toBytes(), 17);
  return Buffer.from(data);
}

// =====================================================
// Ax (2-leg) — PDA + instruction encoders (fungible wave)
// Program seeds: ["ax", deal_id_le, user_a, user_b]
// =====================================================

export type AxAssetTypeOnChain = 0 | 1 | 2 | 3 | 4; // NativeSol, Spl, Nft, Pnft, Cnft
export type AxReleaseModeOnChain = 0 | 1 | 2; // Parties, Authority, AuthorityOrParties

export function assetCodeToAxAssetType(code: string): AxAssetTypeOnChain {
  const c = String(code || "").toUpperCase().trim();
  if (c === "PNFT") {
    throw new Error("pNFT is not available yet. Use classic Token NFT only.");
  }
  if (c === "CNFT") {
    throw new Error("cNFT is not available yet. Use classic Token NFT only.");
  }
  if (c === "NFT") return 2; // AssetType::Nft
  if (!isCryptoAssetCode(c)) {
    throw new Error(`Unsupported asset code for Ax: ${c}`);
  }
  return assetMeta(c as CryptoAssetCode).assetType === 0 ? 0 : 1;
}

/**
 * PDA: ["ax", deal_id_le, user_a, user_b]
 * Party A must be buyer wallet; Party B seller wallet.
 */
export function deriveAxPda(
  chainDealId: string,
  userA: PublicKey,
  userB: PublicKey
): [PublicKey, number] {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) {
    throw new Error("Invalid on-chain deal ID.");
  }
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("ax"),
      Buffer.from(encodeU64LE(dealId)),
      userA.toBuffer(),
      userB.toBuffer(),
    ],
    TRUSTLAYER_PROGRAM_ID
  );
}

function encodePubkey(pk: PublicKey): Uint8Array {
  return pk.toBytes();
}

/**
 * create_ax_split discriminator [162, 95, 54, 239, 255, 179, 217, 67]
 * Both fee_a and fee_b must be > 0 (program enforced).
 * NFT fields zeroed for fungible wave.
 */
export function createAxSplitInstructionData(input: {
  chainDealId: string;
  amountA: bigint;
  amountB: bigint;
  feeA: bigint;
  feeB: bigint;
  releaseMode?: AxReleaseModeOnChain;
  releaseAuthority?: PublicKey;
  userASettlement: PublicKey;
  userBSettlement: PublicKey;
  expiryTimestamp: number;
  earliestSettlementTimestamp?: number;
  assetTypeA: AxAssetTypeOnChain;
  assetTypeB: AxAssetTypeOnChain;
  mintA: PublicKey;
  mintB: PublicKey;
  tokenProgramA: PublicKey;
  tokenProgramB: PublicKey;
  feePayer?: FeePayerOnChain;
}): Buffer {
  const dealId = BigInt(input.chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  if (input.feeA <= 0n || input.feeB <= 0n) {
    throw new Error("Ax requires a positive fee on both legs.");
  }

  const discriminator = Buffer.from([162, 95, 54, 239, 255, 179, 217, 67]);
  // 8 disc + 5*u64 + u8 + 3*32 + 2*i64 + 2*u8 + 4*32 + u8 + 2*u64 + 4*32
  // = 8+40+1+96+16+2+128+1+16+128 = 436
  const data = new Uint8Array(436);
  let o = 0;
  data.set(discriminator, o); o += 8;
  data.set(encodeU64LE(dealId), o); o += 8;
  data.set(encodeU64LE(input.amountA), o); o += 8;
  data.set(encodeU64LE(input.amountB), o); o += 8;
  data.set(encodeU64LE(input.feeA), o); o += 8;
  data.set(encodeU64LE(input.feeB), o); o += 8;
  data[o++] = (input.releaseMode ?? 0) & 0xff;
  data.set(
    encodePubkey(input.releaseAuthority ?? PublicKey.default),
    o
  ); o += 32;
  data.set(encodePubkey(input.userASettlement), o); o += 32;
  data.set(encodePubkey(input.userBSettlement), o); o += 32;
  data.set(encodeI64LE(BigInt(input.expiryTimestamp)), o); o += 8;
  data.set(
    encodeI64LE(BigInt(input.earliestSettlementTimestamp ?? 0)),
    o
  ); o += 8;
  data[o++] = input.assetTypeA & 0xff;
  data[o++] = input.assetTypeB & 0xff;
  data.set(encodePubkey(input.mintA), o); o += 32;
  data.set(encodePubkey(input.mintB), o); o += 32;
  data.set(encodePubkey(input.tokenProgramA), o); o += 32;
  data.set(encodePubkey(input.tokenProgramB), o); o += 32;
  data[o++] = (input.feePayer ?? 0) & 0xff; // Funder
  data.set(encodeU64LE(0n), o); o += 8; // cnft_nonce_a
  data.set(encodeU64LE(0n), o); o += 8; // cnft_nonce_b
  data.set(encodePubkey(PublicKey.default), o); o += 32;
  data.set(encodePubkey(PublicKey.default), o); o += 32;
  data.set(encodePubkey(PublicKey.default), o); o += 32;
  data.set(encodePubkey(PublicKey.default), o); o += 32;
  if (o !== 436) throw new Error(`create_ax_split data length mismatch: ${o}`);
  return Buffer.from(data);
}

/** fund_ax [226, 16, 22, 227, 31, 249, 161, 18] — leg 0 = A, leg 1 = B */
export function createFundAxInstructionData(
  chainDealId: string,
  leg: 0 | 1
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([226, 16, 22, 227, 31, 249, 161, 18]);
  const data = new Uint8Array(17);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = leg & 0xff;
  return Buffer.from(data);
}

/** release_ax [113, 201, 171, 29, 194, 210, 193, 23] */
export function createReleaseAxInstructionData(chainDealId: string): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([113, 201, 171, 29, 194, 210, 193, 23]);
  const data = new Uint8Array(16);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  return Buffer.from(data);
}

/** cancel_ax [195, 62, 103, 184, 83, 252, 114, 200] */
export function createCancelAxInstructionData(chainDealId: string): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([195, 62, 103, 184, 83, 252, 114, 200]);
  const data = new Uint8Array(16);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  return Buffer.from(data);
}

/** reclaim_ax [91, 35, 144, 7, 25, 88, 123, 32] */
export function createReclaimAxInstructionData(
  chainDealId: string,
  leg: 0 | 1
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([91, 35, 144, 7, 25, 88, 123, 32]);
  const data = new Uint8Array(17);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  data[16] = leg & 0xff;
  return Buffer.from(data);
}

/** open_dispute_ax [113, 107, 154, 9, 33, 100, 114, 22] */
export function createOpenDisputeAxInstructionData(
  chainDealId: string
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([113, 107, 154, 9, 33, 100, 114, 22]);
  const data = new Uint8Array(16);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  return Buffer.from(data);
}

/** cancel_unfunded_ax [63, 14, 94, 180, 244, 212, 190, 10] */
export function createCancelUnfundedAxInstructionData(
  chainDealId: string
): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([63, 14, 94, 180, 244, 212, 190, 10]);
  const data = new Uint8Array(16);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  return Buffer.from(data);
}

/**
 * Dual-SPL release: leg B fee ATA is remaining_accounts[0].
 * Callers must pass feeReceiverAtaA as fee_token and feeReceiverAtaB as remaining[0]
 * when both legs are SPL with fees.
 */

/** admin_resolve_release_ax [10, 211, 84, 208, 102, 35, 218, 3] — requires Disputed */
export function createAdminResolveReleaseAxInstructionData(chainDealId: string): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([10, 211, 84, 208, 102, 35, 218, 3]);
  const data = new Uint8Array(16);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  return Buffer.from(data);
}

/** admin_resolve_refund_ax [86, 47, 121, 134, 62, 168, 0, 122] — requires Disputed */
export function createAdminResolveRefundAxInstructionData(chainDealId: string): Buffer {
  const dealId = BigInt(chainDealId);
  if (dealId <= 0n || dealId > MAX_U64) throw new Error("Invalid on-chain deal ID.");
  const discriminator = Buffer.from([86, 47, 121, 134, 62, 168, 0, 122]);
  const data = new Uint8Array(16);
  data.set(discriminator, 0);
  data.set(encodeU64LE(dealId), 8);
  return Buffer.from(data);
}

/** On-chain dispute reclaim window (matches DISPUTE_STALE_SECONDS). */
export const AX_DISPUTE_STALE_SECONDS = 7 * 24 * 60 * 60;

export function dualSplFeeRemainingAccounts(feeReceiverAtaB: PublicKey): {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}[] {
  return [{ pubkey: feeReceiverAtaB, isSigner: false, isWritable: true }];
}

export function explorerTxUrl(
  signature: string,
  cluster: "devnet" | "mainnet-beta" = SOLANA_CLUSTER
) {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function explorerAddressUrl(
  address: string,
  cluster: "devnet" | "mainnet-beta" = SOLANA_CLUSTER
) {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}
