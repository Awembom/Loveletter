import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts letter text before it goes into the database (AES-256-GCM).
//
// Stored format: "v1.<iv>.<ciphertext+tag>", both parts base64url.
// Each value is bound to its letter ID and field name (as GCM "additional
// data"), so a ciphertext copied into another row or column won't decrypt.
//
// The key comes from LETTER_ENCRYPTION_KEY: 32 random bytes, base64.
// Losing or changing it makes every stored letter unreadable.

const PREFIX = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let key: Buffer | null = null;

function getKey(): Buffer {
  if (key) return key;
  const raw = process.env.LETTER_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing LETTER_ENCRYPTION_KEY (see .env.local).");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("LETTER_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  key = k;
  return k;
}

/** Encrypt one field of a letter. */
export function encryptField(plain: string, letterId: string, field: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(Buffer.from(`${letterId}:${field}`));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${PREFIX}.${iv.toString("base64url")}.${data.toString("base64url")}`;
}

/**
 * Decrypt one field. Values without the "v1." prefix are letters saved
 * before encryption was added, and are returned as they are.
 */
export function decryptField(stored: string, letterId: string, field: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return stored;
  const iv = Buffer.from(parts[1], "base64url");
  const data = Buffer.from(parts[2], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAAD(Buffer.from(`${letterId}:${field}`));
  decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]).toString("utf8");
}
