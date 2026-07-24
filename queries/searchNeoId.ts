import type { PrismaClient } from "@prisma/client";

export async function searchNeoId(db: PrismaClient, partial: string) {
  if (partial.trim().length < 3) return [];
  return db.shortlistEntry.findMany({
    where: { neoId: { contains: partial, mode: "insensitive" } },
    include: { mailEvent: { include: { company: true } } },
    take: 50,
  });
}
