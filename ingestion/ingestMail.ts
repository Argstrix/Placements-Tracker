import type { PrismaClient } from "@prisma/client";
import { parseMail, type ParsedAttachment } from "./parseMail";
import { tryRegexExtract } from "./regexExtractor";
import { extractWithLlm, type LlmClients } from "./llmExtractor";
import { extractNeoIdsFromXlsx, type ExtractedShortlistEntry } from "./xlsxExtractor";
import { extractNeoIdsFromBody, redactNeoIds } from "./inlineNeoIdExtractor";
import { hashNeoId } from "./hashNeoId";
import { matchCompany, normalizeCompanyName } from "./matchCompany";

export interface IngestOptions {
  db: PrismaClient;
  llmClients: LlmClients;
  uploadAttachment: (att: ParsedAttachment) => Promise<string>;
  /** Fired (not awaited) after a brand-new Company row is created — never
   * called when a mail links to an existing company's timeline. Intended
   * for the one-time enrichment job; deliberately fire-and-forget so a
   * slow or failing enrichment can never delay or fail ingestion itself. */
  onNewCompany?: (company: { id: string; name: string }) => void;
}

export interface IngestResult {
  status: "SUCCESS" | "FAILED";
  mailEventId?: string;
  newCompanyId?: string;
  error?: string;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function ingestMail(raw: Buffer, gmailMessageId: string, options: IngestOptions): Promise<IngestResult> {
  const { db, llmClients, uploadAttachment } = options;

  try {
    const mail = await parseMail(raw);
    const fastPath = tryRegexExtract(mail);

    const extraction = fastPath.matched
      ? {
          eventType: "REGISTRATION" as const,
          companyName: fastPath.companyName ?? null,
          program: fastPath.program ?? null,
          category: fastPath.category ?? null,
          campuses: [] as string[],
          visitDate: null as string | null,
          eligibleBranches: fastPath.eligibleBranches ?? [],
          eligibilityCriteria: fastPath.eligibilityCriteria ?? null,
          ctc: fastPath.ctc ?? null,
          stipend: fastPath.stipend ?? null,
          venue: null as string | null,
          instructions: null as string | null,
          website: fastPath.website ?? null,
          fieldConfidence: {} as Record<string, "HIGH" | "LOW">,
        }
      : await extractWithLlm(mail, llmClients);

    if (!extraction.companyName && extraction.eventType !== "GENERAL_NOTICE") {
      throw new Error("Extraction produced no company name for a company-linked event type");
    }

    // Shortlist sheets ARE Neo ID lists, so they are never stored: we detect
    // them, keep only a one-way hash of each ID, and drop the file itself.
    // Every other attachment (JDs, etc.) is stored as normal.
    const shortlistEntries: ExtractedShortlistEntry[] = [];
    const attachmentsToStore: ParsedAttachment[] = [];
    for (const att of mail.attachments) {
      if (att.mimeType === XLSX_MIME) {
        const ids = extractNeoIdsFromXlsx(att);
        if (ids.length > 0) {
          shortlistEntries.push(...ids);
          continue; // drop the sheet — it's a Neo ID list, never persisted
        }
      }
      attachmentsToStore.push(att);
    }

    // Some shortlist mails (e.g. the Fischer Jordan format) paste Neo IDs
    // directly into the body instead of attaching a sheet — scan the body only
    // when no sheet already supplied the list, to avoid double-counting.
    if (shortlistEntries.length === 0) {
      shortlistEntries.push(...extractNeoIdsFromBody(mail.bodyText));
    }

    const uploadedAttachments = await Promise.all(
      attachmentsToStore.map(async (att) => ({ ...att, blobUrl: await uploadAttachment(att) }))
    );

    const { mailEventId, newCompany } = await db.$transaction(async (tx) => {
      let companyId: string | null = null;
      let companyMatchConfidence: "HIGH" | "LOW" | null = null;
      let createdCompany: { id: string; name: string } | null = null;

      if (extraction.companyName) {
        // lastMailAt only breaks ties when a mail doesn't state its programme
        // and the company runs both a B.Tech and an M.Tech drive.
        const existing = (
          await tx.company.findMany({
            select: {
              id: true,
              normalizedName: true,
              program: true,
              mailEvents: { select: { receivedAt: true }, orderBy: { receivedAt: "desc" }, take: 1 },
            },
          })
        ).map((c) => ({
          id: c.id,
          normalizedName: c.normalizedName,
          program: c.program,
          lastMailAt: c.mailEvents[0]?.receivedAt ?? null,
        }));
        const match = matchCompany(extraction.companyName, existing, extraction.program);
        companyMatchConfidence = match.confidence;

        if (match.companyId) {
          companyId = match.companyId;

          // A follow-up mail (e.g. a revised CTC, updated eligibility, a
          // rescheduled date) links to this same company's timeline, but
          // until now its top-level fields were never refreshed — the
          // company page would keep showing stale data from the original
          // registration mail even after an update mail arrived. Merge in
          // whatever new non-empty values this mail provides; anything it
          // doesn't mention (null / empty array) leaves the prior value
          // alone rather than wiping it out.
          const existingCompany = await tx.company.findUniqueOrThrow({ where: { id: match.companyId } });
          const existingFieldConfidence = (existingCompany.fieldConfidence ?? {}) as Record<string, "HIGH" | "LOW">;
          await tx.company.update({
            where: { id: match.companyId },
            data: {
              // Mail for a retired company means the drive wasn't over after
              // all — a delayed offer letter, joining instructions. Put it
              // back in the live pool; it can retire again once it goes quiet
              // for a full threshold. Attachments already purged stay purged,
              // but this mail's own attachments are stored normally.
              retiredAt: null,
              purgedAt: null,
              category: extraction.category ?? existingCompany.category,
              campuses: extraction.campuses.length > 0 ? extraction.campuses : existingCompany.campuses,
              ctc: extraction.ctc ?? existingCompany.ctc,
              stipend: extraction.stipend ?? existingCompany.stipend,
              eligibilityCriteria: extraction.eligibilityCriteria ?? existingCompany.eligibilityCriteria,
              eligibleBranches:
                extraction.eligibleBranches.length > 0 ? extraction.eligibleBranches : existingCompany.eligibleBranches,
              visitDate: extraction.visitDate ? new Date(extraction.visitDate) : existingCompany.visitDate,
              website: extraction.website ?? existingCompany.website,
              fieldConfidence: { ...existingFieldConfidence, ...extraction.fieldConfidence },
            },
          });
        } else {
          const created = await tx.company.create({
            data: {
              name: extraction.companyName,
              normalizedName: normalizeCompanyName(extraction.companyName),
              // An unstated programme on a brand-new company means we genuinely
              // don't know — BOTH keeps the drive visible to everyone rather
              // than hiding it from half the batch on a guess.
              program: extraction.program ?? "BOTH",
              category: extraction.category,
              campuses: extraction.campuses,
              ctc: extraction.ctc,
              stipend: extraction.stipend,
              eligibilityCriteria: extraction.eligibilityCriteria,
              eligibleBranches: extraction.eligibleBranches,
              visitDate: extraction.visitDate ? new Date(extraction.visitDate) : null,
              website: extraction.website,
              fieldConfidence: extraction.fieldConfidence,
            },
          });
          companyId = created.id;
          createdCompany = { id: created.id, name: created.name };
        }
      }

      const mailEvent = await tx.mailEvent.create({
        data: {
          type: extraction.eventType,
          subject: mail.subject,
          sender: mail.from,
          receivedAt: mail.receivedAt,
          gmailMessageId,
          // Redacted so the stored body never contains Neo IDs.
          bodyText: redactNeoIds(mail.bodyText),
          companyId,
          companyMatchConfidence,
        },
      });

      // Bulk-inserted rather than one create() per row. A shortlist mail can
      // carry several hundred Neo IDs, and a round-trip each over a serverless
      // connection overran the 5s interactive-transaction budget before the
      // transaction could commit. One statement per table instead of N.
      if (uploadedAttachments.length > 0) {
        await tx.attachment.createMany({
          data: uploadedAttachments.map((att) => ({
            mailEventId: mailEvent.id,
            filename: att.filename,
            mimeType: att.mimeType,
            blobUrl: att.blobUrl,
          })),
        });
      }

      // Store only irreversible hashes — never the Neo IDs themselves.
      if (shortlistEntries.length > 0) {
        await tx.shortlistHash.createMany({
          data: shortlistEntries.map((entry) => ({
            idHash: hashNeoId(entry.neoId),
            round: entry.round,
            mailEventId: mailEvent.id,
          })),
        });
      }

      // One row per mail, ever — see the note on IngestionLog in the schema.
      await tx.ingestionLog.upsert({
        where: { gmailMessageId },
        create: { gmailMessageId, status: "SUCCESS" },
        update: { status: "SUCCESS", errorDetail: null },
      });

      return { mailEventId: mailEvent.id, newCompany: createdCompany };
    },
    {
      // Prisma's 5s interactive default is tuned for small unit-of-work
      // transactions. A shortlist mail writes one mail event plus a few
      // hundred hashes over a serverless connection, so the ceiling is raised
      // to leave headroom above the bulk inserts while staying well inside the
      // function's own time limit.
      timeout: 20_000,
      maxWait: 10_000,
    });

    if (newCompany && options.onNewCompany) {
      options.onNewCompany(newCompany);
    }

    return { status: "SUCCESS", mailEventId, newCompanyId: newCompany?.id };
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    await db.ingestionLog.upsert({
      where: { gmailMessageId },
      create: { gmailMessageId, status: "FAILED", errorDetail },
      update: { status: "FAILED", errorDetail },
    });
    return { status: "FAILED", error: error instanceof Error ? error.message : String(error) };
  }
}
