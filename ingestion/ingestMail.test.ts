import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createTestPrismaClient } from "@/db/testClient";
import { ingestMail } from "./ingestMail";
import { hashNeoId } from "./hashNeoId";
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

  it("extracts inline Neo IDs from the real Fischer Jordan body-text shortlist (no attachment)", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Short list mail - 1.eml"));
    const validJson = JSON.stringify({
      eventType: "SHORTLIST_ROUND",
      companyName: "Fischer Jordan",
      category: null,
      campuses: ["Vellore"],
      visitDate: "2026-07-24",
      eligibleBranches: [],
      eligibilityCriteria: null,
      ctc: null,
      stipend: null,
      venue: "PRP - 717",
      instructions: null,
      website: null,
      fieldConfidence: {},
    });
    const result = await ingestMail(raw, "msg-fj", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [validJson] }),
        fallback: new FakeListChatModel({ responses: [validJson] }),
      },
      uploadAttachment: async () => "https://blob.example/unused",
    });

    expect(result.status).toBe("SUCCESS");
    const entries = await db.shortlistHash.findMany();
    expect(entries.length).toBeGreaterThanOrEqual(14);
    // Stored as a one-way hash — never the plaintext Neo ID.
    expect(entries.map((e) => e.idHash)).toContain(hashNeoId("O3D8V4U8"));
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
    const entries = await db.shortlistHash.findMany();
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

  it("updates the existing company's fields when a follow-up mail revises them (e.g. a CTC update)", async () => {
    const existing = await db.company.create({
      data: {
        name: "Wakefit",
        normalizedName: "wakefit",
        ctc: "10 LPA",
        eligibleBranches: ["B.Tech CSE"],
        eligibilityCriteria: "60% throughout",
      },
    });

    const raw = readFileSync(path.join(fixturesDir, "Shortlist mail 3.eml"));
    const updateJson = JSON.stringify({
      eventType: "UPDATE",
      companyName: "Wakefit",
      category: null,
      campuses: [],
      visitDate: null,
      eligibleBranches: [],
      eligibilityCriteria: null,
      ctc: "12 LPA (revised)",
      stipend: null,
      venue: null,
      instructions: "CTC has been revised, please re-check your eligibility.",
      website: null,
      fieldConfidence: { ctc: "HIGH" },
    });

    const result = await ingestMail(raw, "msg-update-1", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [updateJson] }),
        fallback: new FakeListChatModel({ responses: [updateJson] }),
      },
      uploadAttachment: async () => "https://blob.example/fake.xlsx",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.newCompanyId).toBeUndefined(); // matched, not created

    const updated = await db.company.findUniqueOrThrow({ where: { id: existing.id } });
    expect(updated.ctc).toBe("12 LPA (revised)"); // the field the update mail actually mentioned
    expect(updated.eligibleBranches).toEqual(["B.Tech CSE"]); // untouched — the update mail didn't mention it
    expect(updated.eligibilityCriteria).toBe("60% throughout"); // untouched
    expect((updated.fieldConfidence as Record<string, string>).ctc).toBe("HIGH");

    // The update mail itself is still visible as its own timeline entry.
    const events = await db.mailEvent.findMany({ where: { companyId: existing.id } });
    expect(events.map((e) => e.type)).toContain("UPDATE");

    const companies = await db.company.findMany();
    expect(companies).toHaveLength(1); // no duplicate company created
  });

  it("fires onNewCompany only when a brand-new company is created, not on a match", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Placement Registration - Sample.eml"));
    const newCompanyCalls: { id: string; name: string }[] = [];
    const result = await ingestMail(raw, "msg-5", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [] }),
        fallback: new FakeListChatModel({ responses: [] }),
      },
      uploadAttachment: async () => "https://blob.example/fake-jd.pdf",
      onNewCompany: (company) => newCompanyCalls.push(company),
    });

    expect(result.newCompanyId).toBeTruthy();
    expect(newCompanyCalls).toHaveLength(1);
    expect(newCompanyCalls[0].name).toBe("IDFC FIRST Bank");

    // A second mail about the same company should match, not re-fire the hook.
    await ingestMail(raw, "msg-6", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [] }),
        fallback: new FakeListChatModel({ responses: [] }),
      },
      uploadAttachment: async () => "https://blob.example/fake-jd-2.pdf",
      onNewCompany: (company) => newCompanyCalls.push(company),
    });
    expect(newCompanyCalls).toHaveLength(1);
  });
});
