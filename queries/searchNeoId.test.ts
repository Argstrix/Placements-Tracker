import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { searchNeoId } from "./searchNeoId";
import { hashNeoId } from "@/ingestion/hashNeoId";
import type { PrismaClient } from "@prisma/client";

describe("searchNeoId", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    const company = await db.company.create({ data: { name: "Wakefit", normalizedName: "wakefit" } });
    const mailEvent = await db.mailEvent.create({
      data: { type: "SHORTLIST_ROUND", subject: "s", sender: "x", receivedAt: new Date(), gmailMessageId: "1", bodyText: "b", companyId: company.id },
    });
    // Stored as a hash — never the plaintext Neo ID.
    await db.shortlistHash.create({ data: { idHash: hashNeoId("O3D8V4U8"), mailEventId: mailEvent.id } });
  });

  it("matches an exact Neo ID via its hash and returns the company (case-insensitive)", async () => {
    const result = await searchNeoId(db, "o3d8v4u8");
    expect(result).toHaveLength(1);
    expect(result[0].mailEvent.company?.name).toBe("Wakefit");
  });

  it("returns nothing for a Neo ID that isn't shortlisted", async () => {
    expect(await searchNeoId(db, "ZZZZZZZZ")).toHaveLength(0);
  });

  it("returns nothing for a too-short input (no meaningful partial match on hashes)", async () => {
    expect(await searchNeoId(db, "o3d")).toHaveLength(0);
  });
});
