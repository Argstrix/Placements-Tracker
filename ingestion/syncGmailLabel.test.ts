import { describe, it, expect, beforeEach } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createTestPrismaClient } from "@/db/testClient";
import { syncNewMailFromLabel } from "./syncGmailLabel";
import type { PrismaClient } from "@prisma/client";

const generalNoticeEml = Buffer.from(
  "From: vitianscdc2027@vitstudent.ac.in\nSubject: Portal downtime notice\nDate: Wed, 22 Jul 2026 10:00:00 +0530\n\nThe Neo PAT portal will be down for maintenance tonight."
);

describe("syncNewMailFromLabel", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("ingests every labeled message that hasn't already succeeded", async () => {
    const result = await syncNewMailFromLabel({
      db,
      llmClients: {
        primary: new FakeListChatModel({
          responses: [
            JSON.stringify({
              eventType: "GENERAL_NOTICE",
              program: null,
              companyName: null,
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
            }),
          ],
        }),
        fallback: new FakeListChatModel({ responses: [] }),
      },
      uploadAttachment: async () => "https://blob.example/unused",
      listLabeledMessageIds: async () => ["msg-a"],
      fetchRawByGmailId: async () => generalNoticeEml,
    });

    expect(result.processed).toBe(1);
    const events = await db.mailEvent.findMany();
    expect(events).toHaveLength(1);
  });

  it("skips messages that already have a SUCCESS log entry", async () => {
    await db.ingestionLog.create({ data: { gmailMessageId: "msg-already-done", status: "SUCCESS" } });

    let fetchCount = 0;
    const result = await syncNewMailFromLabel({
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [] }),
        fallback: new FakeListChatModel({ responses: [] }),
      },
      uploadAttachment: async () => "https://blob.example/unused",
      listLabeledMessageIds: async () => ["msg-already-done"],
      fetchRawByGmailId: async () => {
        fetchCount += 1;
        return generalNoticeEml;
      },
    });

    expect(result.processed).toBe(0);
    expect(fetchCount).toBe(0);
  });

  it("does nothing when the label is empty", async () => {
    const result = await syncNewMailFromLabel({
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [] }),
        fallback: new FakeListChatModel({ responses: [] }),
      },
      uploadAttachment: async () => "https://blob.example/unused",
      listLabeledMessageIds: async () => [],
      fetchRawByGmailId: async () => generalNoticeEml,
    });
    expect(result.processed).toBe(0);
  });
});
