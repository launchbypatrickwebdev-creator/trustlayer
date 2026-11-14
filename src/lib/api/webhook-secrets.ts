import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncryptedSecret = { ciphertext: string; iv: string; tag: string };

function encryptionKey(): Buffer {
  const raw = process.env.TRUSTLAYER_WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (!raw) throw new Error("TRUSTLAYER_WEBHOOK_SECRET_ENCRYPTION_KEY is required");
  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TRUSTLAYER_WEBHOOK_SECRET_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function encryptWebhookSecret(secret: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptWebhookSecret(value: EncryptedSecret): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
