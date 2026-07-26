import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function deriveKey(): Buffer {
  const secret = process.env.NEO_ID_ENC_SECRET ?? "";
  return createHash("sha256").update(secret).digest();
}

/**
 * Reversibly encrypts a user's own Neo ID for opt-in autofill storage.
 *
 * Unlike ingestion/hashNeoId.ts (a one-way fingerprint used to match
 * everyone's Neo IDs against shortlist mail, never linked to an identity),
 * this is a per-user, per-account, explicitly opt-in convenience save — and
 * therefore must be reversible. Keyed by NEO_ID_ENC_SECRET, a separate
 * secret from the hashing pepper, so a leak of one cannot compromise the
 * other.
 *
 * Returns iv || authTag || ciphertext packed into one blob, as a fresh
 * Uint8Array copy — Prisma's Bytes type is Uint8Array<ArrayBuffer>, and a
 * Buffer view can be backed by a pooled SharedArrayBuffer.
 */
export function encryptNeoId(neoId: string): Uint8Array<ArrayBuffer> {
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const normalized = neoId.trim().toUpperCase();
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  return Uint8Array.from(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
}

/** Reverses encryptNeoId. Throws if the secret or the blob doesn't match
 * (wrong key, or the ciphertext/auth tag was tampered with). */
export function decryptNeoId(blob: Uint8Array): string {
  const key = deriveKey();
  const buf = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  const iv = buf.subarray(0, IV_BYTES);
  const authTag = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
