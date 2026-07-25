import type { PrismaClient } from "@prisma/client";

export interface PurgeOptions {
  db: PrismaClient;
  now: Date;
  /** Injected so tests never touch blob storage — see retention/deleteBlob.ts. */
  deleteBlob: (url: string) => Promise<void>;
  /** Caps work per run so a large backlog can't blow the cron time limit. */
  batchSize: number;
}

export interface PurgeResult {
  attachmentsPurged: number;
  companiesCompleted: number;
  failures: number;
}

/**
 * Deletes the stored file for every attachment belonging to a retired company,
 * cascading company -> mail events -> attachments, and leaves a tombstone row
 * behind so the timeline can still show that a file existed.
 *
 * Deliberately not one transaction per company: deleting a blob is an external
 * side effect that can't be rolled back, so each attachment is committed as it
 * completes. An interrupted run therefore leaves a consistent partial state
 * that the next run picks up, rather than re-deleting or losing track. A
 * company is stamped `purgedAt` only once nothing beneath it remains.
 */
export async function purgeRetiredCompanyBlobs(options: PurgeOptions): Promise<PurgeResult> {
  const { db, now, deleteBlob, batchSize } = options;

  const companies = await db.company.findMany({
    where: { retiredAt: { not: null }, purgedAt: null },
    select: { id: true },
    orderBy: { retiredAt: "asc" },
  });

  let attachmentsPurged = 0;
  let companiesCompleted = 0;
  let failures = 0;
  let budget = batchSize;

  for (const company of companies) {
    if (budget <= 0) break;

    const pending = await db.attachment.findMany({
      where: { blobUrl: { not: null }, mailEvent: { companyId: company.id } },
      select: { id: true, blobUrl: true },
      take: budget,
    });

    let companyFailures = 0;
    for (const attachment of pending) {
      budget -= 1;
      try {
        await deleteBlob(attachment.blobUrl!);
        await db.attachment.update({
          where: { id: attachment.id },
          data: { blobUrl: null, purgedAt: now },
        });
        attachmentsPurged += 1;
      } catch {
        // Leave the row untouched so the next run retries it. Never stamp the
        // company complete while a file it owns may still be sitting in storage.
        companyFailures += 1;
        failures += 1;
      }
    }

    // Stamp the company complete only when nothing it owns is still holding a
    // blob URL. Re-counting rather than inferring from this pass keeps the
    // marker honest whether we ran out of budget, hit a failure, or finished.
    const remaining = await db.attachment.count({
      where: { blobUrl: { not: null }, mailEvent: { companyId: company.id } },
    });
    if (remaining === 0 && companyFailures === 0) {
      await db.company.update({ where: { id: company.id }, data: { purgedAt: now } });
      companiesCompleted += 1;
    }
  }

  return { attachmentsPurged, companiesCompleted, failures };
}
