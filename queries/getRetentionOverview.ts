import type { PrismaClient } from "@prisma/client";

/**
 * Everything the admin retention panel needs: which companies are retired,
 * which still hold files, and how much has already been reclaimed.
 */
export async function getRetentionOverview(db: PrismaClient) {
  const [companies, liveAttachments, purgedAttachments] = await Promise.all([
    db.company.findMany({
      orderBy: [{ retiredAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        retiredAt: true,
        purgedAt: true,
        _count: { select: { mailEvents: true } },
      },
      take: 200,
    }),
    db.attachment.count({ where: { blobUrl: { not: null } } }),
    db.attachment.count({ where: { blobUrl: null } }),
  ]);

  return {
    companies,
    liveAttachments,
    purgedAttachments,
    retiredCount: companies.filter((c) => c.retiredAt).length,
  };
}
