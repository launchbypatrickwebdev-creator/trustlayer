import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBytes(): Buffer {
  const raw = String(process.env.TRUSTLAYER_IDEMPOTENCY_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new Error("Idempotency response encryption is not configured");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Idempotency response encryption key must be 32 bytes");
  return key;
}
export function assertIdempotencyEncryptionConfigured() { keyBytes(); }
export function encryptIdempotencyResponse(value: unknown) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { response_ciphertext: ciphertext.toString("base64"), response_iv: iv.toString("base64"), response_tag: cipher.getAuthTag().toString("base64") };
}
export function decryptIdempotencyResponse(ciphertext: string, iv: string, tag: string): unknown {
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}
