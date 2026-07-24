import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMail } from "./parseMail";
import { tryRegexExtract } from "./regexExtractor";

describe("tryRegexExtract", () => {
  it("extracts labeled fields from the IDFC registration mail", async () => {
    const raw = readFileSync(
      path.join(process.cwd(), "sample-emails", "Placement Registration - Sample.eml")
    );
    const mail = await parseMail(raw);
    const result = tryRegexExtract(mail);
    expect(result.matched).toBe(true);
    expect(result.companyName).toBe("IDFC FIRST Bank");
    expect(result.eligibleBranches).toEqual(expect.arrayContaining(["B.Tech IT", "B.Tech CSE"]));
    expect(result.ctc).toContain("14 LPA");
  });

  it("declines to match an unstructured shortlist mail", async () => {
    const raw = readFileSync(path.join(process.cwd(), "sample-emails", "Short list mail - 1.eml"));
    const mail = await parseMail(raw);
    const result = tryRegexExtract(mail);
    expect(result.matched).toBe(false);
  });
});
