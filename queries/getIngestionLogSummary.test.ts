import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getIngestionLogSummary } from "./getIngestionLogSummary";
import type { PrismaClient } from "@prisma/client";

describe("getIngestionLogSummary", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("shows the current status of a mail that failed and later succeeded", async () => {
    // The log holds one row per mail, updated in place, so a later success
    // replaces the earlier failure rather than sitting alongside it.
    await db.ingestionLog.upsert({
      where: { gmailMessageId: "1" },
      create: { gmailMessageId: "1", status: "FAILED", errorDetail: "e1" },
      update: {},
    });
    await db.ingestionLog.upsert({
      where: { gmailMessageId: "1" },
      create: { gmailMessageId: "1", status: "SUCCESS" },
      update: { status: "SUCCESS", errorDetail: null },
    });

    const result = await getIngestionLogSummary(db);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("SUCCESS");
    expect(result[0].errorDetail).toBeNull();
  });

  it("orders most recently touched first", async () => {
    await db.ingestionLog.create({ data: { gmailMessageId: "old", status: "SUCCESS" } });
    await db.ingestionLog.create({ data: { gmailMessageId: "new", status: "FAILED", errorDetail: "boom" } });

    const result = await getIngestionLogSummary(db);
    expect(result.map((r) => r.gmailMessageId)).toEqual(["new", "old"]);
  });
});
