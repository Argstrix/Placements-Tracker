import type { PrismaClient } from "@prisma/client";

export async function getGeneralNotices(db: PrismaClient) {
  return db.mailEvent.findMany({
    where: { type: "GENERAL_NOTICE" },
    orderBy: { receivedAt: "desc" },
  });
}
