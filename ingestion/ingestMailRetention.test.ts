import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { ingestMail } from "./ingestMail";
import type { PrismaClient } from "@prisma/client";

// Built inline rather than read from sample-emails/, which holds real student
// data and is deliberately not committed.
function eml(subject: string, body = "body"): Buffer {
  return Buffer.from(
    `From: vitianscdc2027@vitstudent.ac.in\nSubject: ${subject}\nDate: Wed, 22 Jul 2026 10:00:00 +0530\n\n${body}`
  );
}

function extraction(companyName: string | null, eventType = "UPDATE") {
  return JSON.stringify({
    eventType,
    companyName,
    category: null,
    campuses: [],
    visitDate: null,
    eligibleBranches: [],
    eligibilityCriteria: null,
    ctc: null,
    stipend: null,
    venue: null,
    instructions: null,
    website: null,
    fieldConfidence: {},
  });
}

function clients(response: string) {
  return {
    primary: new FakeListChatModel({ responses: [response] }),
    fallback: new FakeListChatModel({ responses: [response] }),
  };
}

describe("ingestMail — retention interactions", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("returns a retired company to the live pool when late mail arrives", async () => {
    const company = await db.company.create({
      data: {
        name: "Wakefit",
        normalizedName: "wakefit",
        retiredAt: new Date("2026-06-01T00:00:00Z"),
        purgedAt: new Date("2026-06-02T00:00:00Z"),
      },
    });

    const result = await ingestMail(eml("Wakefit joining instructions"), "late-1", {
      db,
      llmClients: clients(extraction("Wakefit")),
      uploadAttachment: async () => "https://blob.example/x",
    });

    expect(result.status).toBe("SUCCESS");
    const after = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    // A delayed offer letter means the drive wasn't over — stop purging it.
    expect(after.retiredAt).toBeNull();
    expect(after.purgedAt).toBeNull();
  });

  it("leaves already-purged attachments tombstoned when a company is revived", async () => {
    const company = await db.company.create({
      data: { name: "Wakefit", normalizedName: "wakefit", retiredAt: new Date(), purgedAt: new Date() },
    });
    const oldMail = await db.mailEvent.create({
      data: {
        type: "REGISTRATION",
        subject: "old",
        sender: "cdc@vitstudent.ac.in",
        receivedAt: new Date("2026-01-01T00:00:00Z"),
        gmailMessageId: "old-1",
        bodyText: "old body",
        companyId: company.id,
      },
    });
    await db.attachment.create({
      data: { mailEventId: oldMail.id, filename: "jd.pdf", mimeType: "application/pdf", blobUrl: null, purgedAt: new Date() },
    });

    await ingestMail(eml("Wakefit update"), "late-2", {
      db,
      llmClients: clients(extraction("Wakefit")),
      uploadAttachment: async () => "https://blob.example/x",
    });

    const attachment = await db.attachment.findFirstOrThrow();
    // Reviving the company cannot bring a deleted file back.
    expect(attachment.blobUrl).toBeNull();
    expect(attachment.filename).toBe("jd.pdf");
  });

  it("keeps one ingestion log row per mail across a failure then a success", async () => {
    // First attempt fails: both providers return unparseable output.
    const failed = await ingestMail(eml("Some drive"), "same-id", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: ["not json"] }),
        fallback: new FakeListChatModel({ responses: ["also not json"] }),
      },
      uploadAttachment: async () => "https://blob.example/x",
    });
    expect(failed.status).toBe("FAILED");
    expect(await db.ingestionLog.count()).toBe(1);

    const succeeded = await ingestMail(eml("Some drive"), "same-id", {
      db,
      llmClients: clients(extraction(null, "GENERAL_NOTICE")),
      uploadAttachment: async () => "https://blob.example/x",
    });
    expect(succeeded.status).toBe("SUCCESS");

    // Updated in place rather than appended, so the log stays bounded and the
    // stale failure can't trigger a pointless retry.
    const logs = await db.ingestionLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("SUCCESS");
    expect(logs[0].errorDetail).toBeNull();
  });

  it("does not resurrect a company that was never retired", async () => {
    const company = await db.company.create({
      data: { name: "Infosys", normalizedName: "infosys" },
    });
    await ingestMail(eml("Infosys update"), "live-1", {
      db,
      llmClients: clients(extraction("Infosys")),
      uploadAttachment: async () => "https://blob.example/x",
    });
    const after = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after.retiredAt).toBeNull();
  });

  it("uses a fire-and-forget callback only for genuinely new companies", async () => {
    await db.company.create({ data: { name: "Wakefit", normalizedName: "wakefit", retiredAt: new Date() } });
    const onNewCompany = vi.fn();

    await ingestMail(eml("Wakefit update"), "late-3", {
      db,
      llmClients: clients(extraction("Wakefit")),
      uploadAttachment: async () => "https://blob.example/x",
      onNewCompany,
    });

    // Reviving a retired company is a match, not a creation — no re-enrichment.
    expect(onNewCompany).not.toHaveBeenCalled();
  });
});
