import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMail } from "./parseMail";
import { extractNeoIdsFromBody } from "./inlineNeoIdExtractor";

describe("extractNeoIdsFromBody", () => {
  it("extracts every inline Neo ID from the real Fischer Jordan shortlist body", async () => {
    const raw = readFileSync(path.join(process.cwd(), "sample-emails", "Short list mail - 1.eml"));
    const mail = await parseMail(raw);
    const entries = extractNeoIdsFromBody(mail.bodyText);

    expect(entries.length).toBeGreaterThanOrEqual(14);
    expect(entries.map((e) => e.neoId)).toContain("O3D8V4U8");
  });

  it("finds nothing in a mail body with no Neo ID list", () => {
    const entries = extractNeoIdsFromBody("Just a regular announcement with no codes in it.");
    expect(entries).toHaveLength(0);
  });

  it("de-duplicates repeated IDs", () => {
    const entries = extractNeoIdsFromBody("A1B2C3D4\nA1B2C3D4\n");
    expect(entries).toHaveLength(1);
  });
});
