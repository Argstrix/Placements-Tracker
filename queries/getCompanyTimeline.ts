import type { PrismaClient } from "@prisma/client";

export async function getCompanyTimeline(db: PrismaClient, companyId: string) {
  return db.company.findUnique({
    where: { id: companyId },
    include: {
      mailEvents: {
        orderBy: { receivedAt: "asc" },
        include: { attachments: true },
      },
    },
  });
}
