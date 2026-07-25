import type { PrismaClient, Company, Program } from "@prisma/client";

export async function getCompaniesInRange(
  db: PrismaClient,
  from: Date,
  to: Date,
  program?: Program
): Promise<Company[]> {
  return db.company.findMany({
    where: {
      // Undated drives are included deliberately. A NULL visitDate fails any
      // range comparison in SQL, so filtering on the range alone made a
      // company that hadn't announced its date invisible on /companies while
      // still existing everywhere else — the drive was live and unfindable.
      // They surface under "Date not announced" instead.
      OR: [{ visitDate: { gte: from, lte: to } }, { visitDate: null }],
      // Filtering to BTECH or MTECH always includes BOTH drives — those are
      // open to this student too, so excluding them would hide drives they
      // are eligible for.
      ...(program ? { program: { in: [program, "BOTH"] } } : {}),
    },
    orderBy: { visitDate: "asc" },
  });
}
