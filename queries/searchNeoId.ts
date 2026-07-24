import type { PrismaClient } from "@prisma/client";
import { hashNeoId } from "@/ingestion/hashNeoId";

/**
 * Looks up a Neo ID against stored shortlist fingerprints. The input is hashed
 * (never stored) and compared to the hashes we keep. Exact match only — since
 * we store one-way hashes rather than the IDs, partial/substring matching isn't
 * possible, and you always know your own full Neo ID anyway.
 */
export async function searchNeoId(db: PrismaClient, rawNeoId: string) {
  const id = rawNeoId.trim();
  if (id.length < 6) return [];
  const idHash = hashNeoId(id);
  return db.shortlistHash.findMany({
    where: { idHash },
    include: { mailEvent: { include: { company: true } } },
    take: 50,
  });
}
