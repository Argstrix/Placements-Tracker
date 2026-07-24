import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getCompanyTimeline } from "./getCompanyTimeline";
import type { PrismaClient } from "@prisma/client";

describe("getCompanyTimeline", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("returns mail events ordered oldest to newest, with attachments", async () => {
    const company = await db.company.create({ data: { name: "Acme", normalizedName: "acme" } });
    await db.mailEvent.create({
      data: { type: "REGISTRATION", subject: "reg", sender: "x", receivedAt: new Date("2026-07-01"), gmailMessageId: "1", bodyText: "b", companyId: company.id },
    });
    await db.mailEvent.create({
      data: { type: "SHORTLIST_ROUND", subject: "sl", sender: "x", receivedAt: new Date("2026-07-10"), gmailMessageId: "2", bodyText: "b", companyId: company.id },
    });

    const result = await getCompanyTimeline(db, company.id);
    expect(result?.mailEvents.map((e) => e.type)).toEqual(["REGISTRATION", "SHORTLIST_ROUND"]);
  });

  it("returns null for a non-existent company", async () => {
    const result = await getCompanyTimeline(db, "does-not-exist");
    expect(result).toBeNull();
  });
});
