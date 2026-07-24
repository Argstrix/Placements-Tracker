import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getIngestionLogSummary } from "./getIngestionLogSummary";
import type { PrismaClient } from "@prisma/client";

describe("getIngestionLogSummary", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    await db.ingestionLog.create({
      data: { gmailMessageId: "1", status: "FAILED", errorDetail: "e1", createdAt: new Date("2026-01-01T00:00:00Z") },
    });
    await db.ingestionLog.create({
      data: { gmailMessageId: "1", status: "SUCCESS", createdAt: new Date("2026-01-01T00:01:00Z") },
    });
  });

  it("shows only the latest status per gmailMessageId", async () => {
    const result = await getIngestionLogSummary(db);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("SUCCESS");
  });
});
