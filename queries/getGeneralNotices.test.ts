import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getGeneralNotices } from "./getGeneralNotices";
import type { PrismaClient } from "@prisma/client";

describe("getGeneralNotices", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    await db.mailEvent.create({
      data: { type: "GENERAL_NOTICE", subject: "Portal downtime", sender: "x", receivedAt: new Date(), gmailMessageId: "1", bodyText: "b" },
    });
    await db.mailEvent.create({
      data: { type: "REGISTRATION", subject: "Reg", sender: "x", receivedAt: new Date(), gmailMessageId: "2", bodyText: "b" },
    });
  });

  it("returns only GENERAL_NOTICE events, newest first", async () => {
    const result = await getGeneralNotices(db);
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe("Portal downtime");
  });
});
