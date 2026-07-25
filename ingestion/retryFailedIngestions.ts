import type { PrismaClient } from "@prisma/client";
import type { LlmClients } from "./llmExtractor";
import type { ParsedAttachment } from "./parseMail";
import { ingestMail } from "./ingestMail";

export interface RetryOptions {
  db: PrismaClient;
  llmClients: LlmClients;
  uploadAttachment: (att: ParsedAttachment) => Promise<string>;
  fetchRawByGmailId: (id: string) => Promise<Buffer>;
  sendAlert: (subject: string, body: string) => Promise<void>;
  maxRetries: number;
  onNewCompany?: (company: { id: string; name: string }) => void;
}

export async function retryFailedIngestions(options: RetryOptions): Promise<{ retried: number; stillFailed: number }> {
  const { db, maxRetries, sendAlert } = options;

  // IngestionLog holds exactly one row per mail, upserted in place, so a
  // message that failed once and later succeeded no longer leaves a stale
  // FAILED row behind — the current state is simply the row's status. This
  // used to require loading the entire table and de-duplicating client-side.
  const failed = await db.ingestionLog.findMany({
    where: { status: "FAILED" },
    orderBy: { createdAt: "asc" },
  });

  let retried = 0;
  let stillFailed = 0;

  for (const entry of failed) {
    if (entry.retryCount >= maxRetries) {
      await sendAlert(
        `Placement Tracker: ingestion permanently failed for ${entry.gmailMessageId}`,
        `Mail ${entry.gmailMessageId} has failed ${entry.retryCount} times. Last error: ${entry.errorDetail}. Manual retry available from the admin dashboard.`
      );
      stillFailed += 1;
      continue;
    }

    const raw = await options.fetchRawByGmailId(entry.gmailMessageId);
    const result = await ingestMail(raw, entry.gmailMessageId, {
      db,
      llmClients: options.llmClients,
      uploadAttachment: options.uploadAttachment,
      onNewCompany: options.onNewCompany,
    });

    if (result.status === "SUCCESS") {
      retried += 1;
    } else {
      await db.ingestionLog.update({
        where: { gmailMessageId: entry.gmailMessageId },
        data: { retryCount: { increment: 1 } },
      });
      stillFailed += 1;
    }
  }

  return { retried, stillFailed };
}
