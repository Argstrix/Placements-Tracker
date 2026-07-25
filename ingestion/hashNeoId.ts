import { createHash } from "node:crypto";

/** Width of a stored Neo ID fingerprint, in bytes. */
export const HASH_BYTES = 16;

/**
 * One-way fingerprint of a Neo ID.
 *
 * The database NEVER stores an actual Neo ID — only these hashes — so a leaked
 * database can't reveal anyone's Neo ID or reconstruct a company's confidential
 * shortlist. The pepper (NEO_ID_HASH_SECRET) lives only in the server
 * environment, never in the database, so the hashes can't be brute-forced
 * without it. Deterministic and normalized, so a user's entered ID hashes to
 * the same value we stored at ingestion time, enabling exact-match lookup.
 *
 * Returns the leading 16 bytes of the digest, stored raw rather than as hex.
 * ShortlistHash is the largest table in the database and this halves the cost
 * of its widest column plus that column's index. Truncating to 128 bits is safe
 * here: collision probability across the ~10^5 rows this project will ever hold
 * is negligible, and resistance to recovering a Neo ID never came from digest
 * length — it comes from the pepper, which is unchanged. Because the retained
 * bytes are a prefix of the old hex digest, existing rows migrate losslessly
 * via decode(substring(id_hash, 1, 32), 'hex') and keep matching.
 */
export function hashNeoId(neoId: string): Uint8Array<ArrayBuffer> {
  const pepper = process.env.NEO_ID_HASH_SECRET ?? "";
  const normalized = neoId.trim().toUpperCase();
  const digest = createHash("sha256").update(`${pepper}:${normalized}`).digest();
  // Copy rather than subarray: Prisma's Bytes type is Uint8Array<ArrayBuffer>,
  // and a Buffer view can be backed by a pooled SharedArrayBuffer.
  return Uint8Array.from(digest.subarray(0, HASH_BYTES));
}
