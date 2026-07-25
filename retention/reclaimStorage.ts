import type { PrismaClient } from "@prisma/client";
import { retireCompanies } from "./retireCompanies";
import { purgeRetiredCompanyBlobs, type PurgeResult } from "./purgeRetiredBlobs";
import type { RetentionThresholds } from "./retirementPredicate";

export interface ReclaimOptions {
  db: PrismaClient;
  now: Date;
  thresholds: RetentionThresholds;
  deleteBlob: (url: string) => Promise<void>;
  batchSize: number;
}

export interface ReclaimResult extends PurgeResult {
  retired: number;
}

/**
 * The nightly storage sweep: mark finished drives, then reclaim their files.
 *
 * Retiring first means a company that becomes eligible tonight is purged in the
 * same run rather than waiting another day.
 */
export async function reclaimStorage(options: ReclaimOptions): Promise<ReclaimResult> {
  const { retired } = await retireCompanies({
    db: options.db,
    now: options.now,
    thresholds: options.thresholds,
  });

  const purge = await purgeRetiredCompanyBlobs({
    db: options.db,
    now: options.now,
    deleteBlob: options.deleteBlob,
    batchSize: options.batchSize,
  });

  return { retired, ...purge };
}
