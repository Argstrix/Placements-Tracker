import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { searchNeoId } from "./searchNeoId";
import type { PrismaClient } from "@prisma/client";

describe("searchNeoId", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    const company = await db.company.create({ data: { name: "Wakefit", normalizedName: "wakefit" } });
    const mailEvent = await db.mailEvent.create({
      data: { type: "SHORTLIST_ROUND", subject: "s", sender: "x", receivedAt: new Date(), gmailMessageId: "1", bodyText: "b", companyId: company.id },
    });
    await db.shortlistEntry.create({ data: { neoId: "O3D8V4U8", mailEventId: mailEvent.id } });
  });

  it("matches on a partial, case-insensitive substring", async () => {
    const result = await searchNeoId(db, "3d8v");
    expect(result).toHaveLength(1);
    expect(result[0].neoId).toBe("O3D8V4U8");
  });

  it("returns nothing for a non-matching query", async () => {
    const result = await searchNeoId(db, "zzzz");
    expect(result).toHaveLength(0);
  });

  it("returns nothing for a too-short query, to avoid scanning on every keystroke", async () => {
    const result = await searchNeoId(db, "3d");
    expect(result).toHaveLength(0);
  });
});
