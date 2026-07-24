import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMail } from "./parseMail";

const fixturesDir = path.join(process.cwd(), "sample-emails");

describe("parseMail", () => {
  it("extracts subject, sender, date, body text, and attachments from the registration sample", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Placement Registration - Sample.eml"));
    const result = await parseMail(raw);
    expect(result.subject).toContain("IDFC FIRST Bank");
    expect(result.from).toContain("vitianscdc2027@vitstudent.ac.in");
    expect(result.bodyText).toContain("Name of the Company");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toContain("JD");
    expect(result.attachments[0].mimeType).toBe("application/pdf");
  });

  it("extracts inline Neo IDs from the Fischer Jordan shortlist body", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Short list mail - 1.eml"));
    const result = await parseMail(raw);
    expect(result.bodyText).toContain("O3D8V4U8");
    expect(result.attachments).toHaveLength(0);
  });

  it("extracts the xlsx attachment from the Infosys shortlist mail", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Short list mail - 2.eml"));
    const result = await parseMail(raw);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });
});
