import type { PrismaClient, Company, Program } from "@prisma/client";

export async function getCompaniesInRange(
  db: PrismaClient,
  from: Date,
  to: Date,
  program?: Program
): Promise<Company[]> {
  return db.company.findMany({
    where: {
      visitDate: { gte: from, lte: to },
      // Filtering to BTECH or MTECH always includes BOTH drives — those are
      // open to this student too, so excluding them would hide drives they
      // are eligible for.
      ...(program ? { program: { in: [program, "BOTH"] } } : {}),
    },
    orderBy: { visitDate: "asc" },
  });
}
