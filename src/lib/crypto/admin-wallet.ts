import { Keypair } from "@solana/web3.js";
import { TRUSTLAYER_ADMIN } from "@/lib/crypto/solana";

/**
 * Server-only. TRUSTLAYER_ADMIN_SECRET_KEY must be a JSON array of secret key bytes.
 * Public key MUST equal the program TRUSTLAYER_ADMIN constant.
 */
export function loadAdminKeypair(): Keypair {
  const raw = process.env.TRUSTLAYER_ADMIN_SECRET_KEY;
  if (!raw) {
    throw new Error("TRUSTLAYER_ADMIN_SECRET_KEY is not configured on the server.");
  }
  let secret: number[];
  try {
    secret = JSON.parse(raw) as number[];
  } catch {
    throw new Error(
      "TRUSTLAYER_ADMIN_SECRET_KEY must be a JSON array of bytes, not a base58 pubkey."
    );
  }
  if (!Array.isArray(secret) || secret.length < 32) {
    throw new Error("TRUSTLAYER_ADMIN_SECRET_KEY byte array is invalid.");
  }
  const kp = Keypair.fromSecretKey(Uint8Array.from(secret));
  if (kp.publicKey.toBase58() !== TRUSTLAYER_ADMIN.toBase58()) {
    throw new Error(
      `Admin key mismatch. Expected ${TRUSTLAYER_ADMIN.toBase58()}, got ${kp.publicKey.toBase58()}.`
    );
  }
  return kp;
}
