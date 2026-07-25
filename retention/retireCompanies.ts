import type { PrismaClient } from "@prisma/client";
import { isRetirable, type RetentionThresholds } from "./retirementPredicate";

export interface RetireOptions {
  db: PrismaClient;
  now: Date;
  thresholds: RetentionThresholds;
}

/**
 * Marks every company whose drive has finished as retired. Marking only — the
 * blob purge is a separate pass, so that an admin retiring a company by hand
 * and the nightly sweep both funnel through exactly one deletion path.
 */
export async function retireCompanies(options: RetireOptions): Promise<{ retired: number }> {
  const { db, now, thresholds } = options;

  const candidates = await db.company.findMany({
    where: { retiredAt: null },
    select: {
      id: true,
      retiredAt: true,
      mailEvents: { select: { type: true, receivedAt: true } },
    },
  });

  const toRetire = candidates.filter((c) => isRetirable(c, now, thresholds)).map((c) => c.id);
  if (toRetire.length === 0) return { retired: 0 };

  await db.company.updateMany({
    where: { id: { in: toRetire } },
    data: { retiredAt: now },
  });

  return { retired: toRetire.length };
}
