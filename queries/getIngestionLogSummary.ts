import type { PrismaClient } from "@prisma/client";

export async function getIngestionLogSummary(db: PrismaClient) {
  return db.ingestionLog.findMany({
    distinct: ["gmailMessageId"],
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
