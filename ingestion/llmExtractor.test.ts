import { describe, it, expect } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { extractWithLlm } from "./llmExtractor";
import type { ParsedMail } from "./parseMail";

const sampleMail: ParsedMail = {
  subject: "Wakefit Group Discussion & Interview process is scheduled on (23-07-2026) 09:00 AM",
  from: "vitianscdc2027@vitstudent.ac.in",
  receivedAt: new Date("2026-07-22"),
  bodyText:
    "Wakefit Group Discussion & Interview process is scheduled on (23-07-2026) 09:00 AM @Sarojini Naidu gallery, SJT 6th Floor - VIT Vellore.",
  attachments: [],
};

const validJsonResponse = JSON.stringify({
  eventType: "SHORTLIST_ROUND",
  companyName: "Wakefit",
  category: null,
  campuses: ["Vellore"],
  visitDate: "2026-07-23",
  eligibleBranches: [],
  eligibilityCriteria: null,
  ctc: null,
  stipend: null,
  venue: "Sarojini Naidu gallery, SJT 6th Floor - VIT Vellore",
  instructions: null,
  website: null,
  fieldConfidence: { visitDate: "HIGH", venue: "HIGH" },
});

describe("extractWithLlm", () => {
  it("returns a schema-valid result from the primary model", async () => {
    const primary = new FakeListChatModel({ responses: [validJsonResponse] });
    const fallback = new FakeListChatModel({ responses: [validJsonResponse] });
    const result = await extractWithLlm(sampleMail, { primary, fallback });
    expect(result.companyName).toBe("Wakefit");
    expect(result.visitDate).toBe("2026-07-23");
  });

  it("falls back to the secondary model when the primary produces nothing usable", async () => {
    const primary = new FakeListChatModel({ responses: [] });
    const fallback = new FakeListChatModel({ responses: [validJsonResponse] });
    const result = await extractWithLlm(sampleMail, { primary, fallback });
    expect(result.companyName).toBe("Wakefit");
  });

  it("throws after both models fail, rather than returning malformed data", async () => {
    const primary = new FakeListChatModel({ responses: ["not json"] });
    const fallback = new FakeListChatModel({ responses: ["also not json"] });
    await expect(extractWithLlm(sampleMail, { primary, fallback })).rejects.toThrow();
  });
});
