import type { PrismaClient, Company } from "@prisma/client";

export async function getCompaniesInRange(db: PrismaClient, from: Date, to: Date): Promise<Company[]> {
  return db.company.findMany({
    where: { visitDate: { gte: from, lte: to } },
    orderBy: { visitDate: "asc" },
  });
}
