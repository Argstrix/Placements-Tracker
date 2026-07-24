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
}

export async function retryFailedIngestions(options: RetryOptions): Promise<{ retried: number; stillFailed: number }> {
  const { db, maxRetries, sendAlert } = options;

  // A gmailMessageId can have failed once and later succeeded on manual
  // retry — that old FAILED row must not trigger another retry/alert.
  // Distinct on the *latest* log per message first, then filter to the
  // ones whose current state is actually FAILED.
  const latestPerMessage = await db.ingestionLog.findMany({
    distinct: ["gmailMessageId"],
    orderBy: { createdAt: "desc" },
  });
  const failed = latestPerMessage.filter((entry) => entry.status === "FAILED");

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
    });

    if (result.status === "SUCCESS") {
      retried += 1;
    } else {
      await db.ingestionLog.updateMany({
        where: { gmailMessageId: entry.gmailMessageId, status: "FAILED" },
        data: { retryCount: { increment: 1 } },
      });
      stillFailed += 1;
    }
  }

  return { retried, stillFailed };
}
