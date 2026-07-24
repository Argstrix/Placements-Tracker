import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMail } from "./parseMail";
import { extractNeoIdsFromXlsx } from "./xlsxExtractor";

describe("extractNeoIdsFromXlsx", () => {
  it("extracts Neo IDs from the single-sheet Wakefit shortlist", async () => {
    const raw = readFileSync(path.join(process.cwd(), "sample-emails", "Shortlist mail 3.eml"));
    const mail = await parseMail(raw);
    const entries = extractNeoIdsFromXlsx(mail.attachments[0]);
    expect(entries.length).toBeGreaterThan(300);
    expect(entries[0].neoId).toBe("A6A5R5C3");
  });

  it("extracts Neo IDs alongside other columns from the Infosys shortlist", async () => {
    const raw = readFileSync(path.join(process.cwd(), "sample-emails", "Short list mail - 2.eml"));
    const mail = await parseMail(raw);
    const entries = extractNeoIdsFromXlsx(mail.attachments[0]);
    expect(entries.length).toBeGreaterThan(1000);
    expect(entries.map((e) => e.neoId)).toContain("I9I4T9K1");
  });
});
