import type { PrismaClient } from "@prisma/client";

export async function getIngestionLogSummary(db: PrismaClient) {
  // One row per mail is guaranteed by the unique constraint, so no client-side
  // de-duplication is needed. Ordered by updatedAt so a mail that was retried
  // today surfaces at the top rather than staying buried at its original date.
  return db.ingestionLog.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}
