import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { prisma } from "@/db/client";
import { buildLlmClients } from "@/ingestion/llmExtractor";
import { uploadToBlob } from "@/ingestion/uploadAttachment";
import { fetchGmailMessageRaw, listLabeledMessageIds } from "@/ingestion/gmailClient";
import { sendAdminAlert } from "@/notifications/sendAdminAlert";
import { retryFailedIngestions } from "@/ingestion/retryFailedIngestions";
import { syncNewMailFromLabel } from "@/ingestion/syncGmailLabel";
import { verifyCronRequest } from "@/ingestion/verifyCronRequest";
import { enrichAndSaveCompany } from "@/enrichment/enrichAndSaveCompany";
import { reclaimStorage } from "@/retention/reclaimStorage";
import { deleteFromBlob } from "@/retention/deleteBlob";

// Daily fallback: catches anything a missed Pub/Sub push never delivered,
// retries mail that previously failed ingestion, and reclaims storage for
// drives that have finished. All three are idempotent, so running this
// alongside the near-real-time webhook is safe.
//
// Storage reclamation lives here rather than in its own cron route because
// Vercel Hobby caps a project at two cron jobs and vercel.json already uses
// both. This is the daily-maintenance job, so it's the natural home.
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!verifyCronRequest(req, env)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const llmClients = buildLlmClients(env);

  const synced = await syncNewMailFromLabel({
    db: prisma,
    llmClients,
    uploadAttachment: uploadToBlob,
    listLabeledMessageIds: () => listLabeledMessageIds(env),
    fetchRawByGmailId: (id) => fetchGmailMessageRaw(id, env),
    onNewCompany: (company) => enrichAndSaveCompany(company, prisma, env),
  });

  const retried = await retryFailedIngestions({
    db: prisma,
    llmClients,
    uploadAttachment: uploadToBlob,
    fetchRawByGmailId: (id) => fetchGmailMessageRaw(id, env),
    sendAlert: (subject, body) => sendAdminAlert(subject, body, env),
    maxRetries: 3,
    onNewCompany: (company) => enrichAndSaveCompany(company, prisma, env),
  });

  // Reclamation is best-effort and must never mask a sync/retry failure —
  // those are the load-bearing phases. A blob-storage outage should show up in
  // the response, not abort ingestion recovery.
  let reclaimed: Awaited<ReturnType<typeof reclaimStorage>> | { error: string };
  try {
    reclaimed = await reclaimStorage({
      db: prisma,
      now: new Date(),
      thresholds: {
        afterResultDays: env.RETIRE_AFTER_RESULT_DAYS,
        idleDays: env.RETIRE_AFTER_IDLE_DAYS,
      },
      deleteBlob: deleteFromBlob,
      batchSize: env.RECLAIM_BATCH_SIZE,
    });
  } catch (error) {
    reclaimed = { error: error instanceof Error ? error.message : String(error) };
  }

  return NextResponse.json({ synced, retried, reclaimed });
}
