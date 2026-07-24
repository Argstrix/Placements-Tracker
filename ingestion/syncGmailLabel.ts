import type { PrismaClient } from "@prisma/client";
import { ingestMail } from "./ingestMail";
import type { LlmClients } from "./llmExtractor";
import type { ParsedAttachment } from "./parseMail";

export interface SyncOptions {
  db: PrismaClient;
  llmClients: LlmClients;
  uploadAttachment: (att: ParsedAttachment) => Promise<string>;
  listLabeledMessageIds: () => Promise<string[]>;
  fetchRawByGmailId: (id: string) => Promise<Buffer>;
  onNewCompany?: (company: { id: string; name: string }) => void;
}

/** Ingests any message under the watched label that hasn't already
 * succeeded, idempotent — safe to call from both the near-real-time
 * webhook and the daily fallback poll without double-processing mail. */
export async function syncNewMailFromLabel(options: SyncOptions): Promise<{ processed: number }> {
  const { db, listLabeledMessageIds, fetchRawByGmailId } = options;

  const labeledIds = await listLabeledMessageIds();
  if (labeledIds.length === 0) return { processed: 0 };

  const alreadySucceeded = await db.ingestionLog.findMany({
    where: { gmailMessageId: { in: labeledIds }, status: "SUCCESS" },
    select: { gmailMessageId: true },
  });
  const succeededIds = new Set(alreadySucceeded.map((l) => l.gmailMessageId));
  const newIds = labeledIds.filter((id) => !succeededIds.has(id));

  let processed = 0;
  for (const id of newIds) {
    const raw = await fetchRawByGmailId(id);
    const result = await ingestMail(raw, id, {
      db,
      llmClients: options.llmClients,
      uploadAttachment: options.uploadAttachment,
      onNewCompany: options.onNewCompany,
    });
    if (result.status === "SUCCESS") processed += 1;
  }

  return { processed };
}
