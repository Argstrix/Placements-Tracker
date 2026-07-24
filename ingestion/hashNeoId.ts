import { createHash } from "node:crypto";

/**
 * One-way fingerprint of a Neo ID.
 *
 * The database NEVER stores an actual Neo ID — only these hashes — so a leaked
 * database can't reveal anyone's Neo ID or reconstruct a company's confidential
 * shortlist. The pepper (NEO_ID_HASH_SECRET) lives only in the server
 * environment, never in the database, so the hashes can't be brute-forced
 * without it. Deterministic and normalized, so a user's entered ID hashes to
 * the same value we stored at ingestion time, enabling exact-match lookup.
 */
export function hashNeoId(neoId: string): string {
  const pepper = process.env.NEO_ID_HASH_SECRET ?? "";
  const normalized = neoId.trim().toUpperCase();
  return createHash("sha256").update(`${pepper}:${normalized}`).digest("hex");
}
