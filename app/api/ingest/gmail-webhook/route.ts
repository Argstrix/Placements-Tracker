import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { fetchGmailMessageRaw, listLabeledMessageIds } from "@/ingestion/gmailClient";
import { syncNewMailFromLabel } from "@/ingestion/syncGmailLabel";
import { buildLlmClients } from "@/ingestion/llmExtractor";
import { uploadToBlob } from "@/ingestion/uploadAttachment";
import { prisma } from "@/db/client";

// Pub/Sub push subscriptions are configured with this token as a query
// param on the endpoint URL — a shared secret only Google's push service
// and this route know, guarding against arbitrary internet POSTs. The push
// payload itself only tells us the mailbox changed, not which message —
// so on any valid, authenticated ping we just sync whatever's new under
// the watched label, which is idempotent and safe to over-trigger.
export async function POST(req: NextRequest) {
  const env = getEnv();
  const token = req.nextUrl.searchParams.get("token");
  if (token !== env.GMAIL_PUBSUB_VERIFICATION_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncNewMailFromLabel({
    db: prisma,
    llmClients: buildLlmClients(env),
    uploadAttachment: uploadToBlob,
    listLabeledMessageIds: () => listLabeledMessageIds(env),
    fetchRawByGmailId: (id) => fetchGmailMessageRaw(id, env),
  });

  return NextResponse.json({ ok: true, ...result });
}
