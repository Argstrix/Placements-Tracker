import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createTestPrismaClient } from "@/db/testClient";
import { ingestMail } from "./ingestMail";
import type { PrismaClient } from "@prisma/client";

const fixturesDir = path.join(process.cwd(), "sample-emails");

describe("ingestMail", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("publishes a full Company + MailEvent on the structured registration sample via the regex fast path", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Placement Registration - Sample.eml"));
    const result = await ingestMail(raw, "msg-1", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [] }),
        fallback: new FakeListChatModel({ responses: [] }),
      },
      uploadAttachment: async () => "https://blob.example/fake-jd.pdf",
    });

    expect(result.status).toBe("SUCCESS");
    const company = await db.company.findUnique({ where: { normalizedName: "idfc first bank" } });
    expect(company).not.toBeNull();
    expect(company?.eligibleBranches).toEqual(expect.arrayContaining(["B.Tech IT", "B.Tech CSE"]));

    const log = await db.ingestionLog.findFirst({ where: { gmailMessageId: "msg-1" } });
    expect(log?.status).toBe("SUCCESS");
  });

  it("extracts Neo IDs into ShortlistEntry rows from an xlsx-attached shortlist mail", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Shortlist mail 3.eml"));
    const validJson = JSON.stringify({
      eventType: "SHORTLIST_ROUND",
      companyName: "Wakefit",
      category: null,
      campuses: ["Vellore"],
      visitDate: "2026-07-23",
      eligibleBranches: [],
      eligibilityCriteria: null,
      ctc: null,
      stipend: null,
      venue: "Sarojini Naidu gallery",
      instructions: null,
      website: null,
      fieldConfidence: {},
    });
    const result = await ingestMail(raw, "msg-2", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [validJson] }),
        fallback: new FakeListChatModel({ responses: [validJson] }),
      },
      uploadAttachment: async () => "https://blob.example/fake-shortlist.xlsx",
    });

    expect(result.status).toBe("SUCCESS");
    const entries = await db.shortlistEntry.findMany();
    expect(entries.length).toBeGreaterThan(0);
  });

  it("writes nothing when extraction fails on both providers — no half-baked records", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Short list mail - 1.eml"));
    const result = await ingestMail(raw, "msg-3", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: ["not json"] }),
        fallback: new FakeListChatModel({ responses: ["also not json"] }),
      },
      uploadAttachment: async () => "https://blob.example/unused",
    });

    expect(result.status).toBe("FAILED");
    const companies = await db.company.findMany();
    expect(companies).toHaveLength(0);
    const log = await db.ingestionLog.findFirst({ where: { gmailMessageId: "msg-3" } });
    expect(log?.status).toBe("FAILED");
    expect(log?.errorDetail).toBeTruthy();
  });

  it("links a shortlist mail to an existing company's timeline instead of creating a duplicate", async () => {
    await db.company.create({ data: { name: "Wakefit", normalizedName: "wakefit" } });
    const raw = readFileSync(path.join(fixturesDir, "Shortlist mail 3.eml"));
    const validJson = JSON.stringify({
      eventType: "SHORTLIST_ROUND",
      companyName: "Wakefit",
      category: null,
      campuses: [],
      visitDate: "2026-07-23",
      eligibleBranches: [],
      eligibilityCriteria: null,
      ctc: null,
      stipend: null,
      venue: null,
      instructions: null,
      website: null,
      fieldConfidence: {},
    });
    await ingestMail(raw, "msg-4", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [validJson] }),
        fallback: new FakeListChatModel({ responses: [validJson] }),
      },
      uploadAttachment: async () => "https://blob.example/fake.xlsx",
    });

    const companies = await db.company.findMany();
    expect(companies).toHaveLength(1);
  });
});
