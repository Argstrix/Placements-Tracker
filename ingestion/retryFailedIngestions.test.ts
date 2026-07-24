import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { retryFailedIngestions } from "./retryFailedIngestions";
import type { PrismaClient } from "@prisma/client";

const generalNoticeEml = Buffer.from(
  "From: vitianscdc2027@vitstudent.ac.in\nSubject: retry test\nDate: Wed, 22 Jul 2026 10:00:00 +0530\n\nbody"
);

const validJson = JSON.stringify({
  eventType: "GENERAL_NOTICE",
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
});

describe("retryFailedIngestions", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("retries a FAILED log entry and succeeds if the underlying issue is now resolved", async () => {
    await db.ingestionLog.create({ data: { gmailMessageId: "retry-1", status: "FAILED", errorDetail: "boom", retryCount: 0 } });
    const sendAlert = vi.fn();

    const result = await retryFailedIngestions({
      db,
      llmClients: { primary: new FakeListChatModel({ responses: [validJson] }), fallback: new FakeListChatModel({ responses: [validJson] }) },
      uploadAttachment: async () => "https://blob.example/x",
      fetchRawByGmailId: async () => generalNoticeEml,
      sendAlert,
      maxRetries: 3,
    });

    expect(result.retried).toBe(1);
    const log = await db.ingestionLog.findFirst({ where: { gmailMessageId: "retry-1" }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("SUCCESS");
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("sends an admin alert once maxRetries is exceeded, and does not retry further", async () => {
    await db.ingestionLog.create({ data: { gmailMessageId: "retry-2", status: "FAILED", errorDetail: "boom", retryCount: 3 } });
    const sendAlert = vi.fn();

    const result = await retryFailedIngestions({
      db,
      llmClients: { primary: new FakeListChatModel({ responses: ["bad"] }), fallback: new FakeListChatModel({ responses: ["bad"] }) },
      uploadAttachment: async () => "https://blob.example/x",
      fetchRawByGmailId: async () => generalNoticeEml,
      sendAlert,
      maxRetries: 3,
    });

    expect(result.retried).toBe(0);
    expect(sendAlert).toHaveBeenCalledOnce();
    expect(sendAlert.mock.calls[0][0]).toContain("retry-2");
  });

  it("does not re-retry a message whose latest log entry already succeeded", async () => {
    await db.ingestionLog.create({
      data: { gmailMessageId: "retry-3", status: "FAILED", errorDetail: "boom", retryCount: 1, createdAt: new Date("2026-01-01T00:00:00Z") },
    });
    await db.ingestionLog.create({
      data: { gmailMessageId: "retry-3", status: "SUCCESS", createdAt: new Date("2026-01-01T00:01:00Z") },
    });
    const sendAlert = vi.fn();
    let fetchCount = 0;

    const result = await retryFailedIngestions({
      db,
      llmClients: { primary: new FakeListChatModel({ responses: [] }), fallback: new FakeListChatModel({ responses: [] }) },
      uploadAttachment: async () => "https://blob.example/x",
      fetchRawByGmailId: async () => {
        fetchCount += 1;
        return generalNoticeEml;
      },
      sendAlert,
      maxRetries: 3,
    });

    expect(result.retried).toBe(0);
    expect(result.stillFailed).toBe(0);
    expect(fetchCount).toBe(0);
    expect(sendAlert).not.toHaveBeenCalled();
  });
});
