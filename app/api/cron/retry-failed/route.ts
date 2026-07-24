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

// Daily fallback: catches anything a missed Pub/Sub push never delivered,
// and retries mail that previously failed ingestion. Both operations are
// idempotent, so running this alongside the near-real-time webhook is safe.
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

  return NextResponse.json({ synced, retried });
}
