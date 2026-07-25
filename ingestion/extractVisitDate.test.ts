import { describe, it, expect } from "vitest";
import { tryRegexExtract } from "./regexExtractor";
import type { ParsedMail } from "./parseMail";

function mail(bodyText: string, subject = "Placement Registration"): ParsedMail {
  return {
    subject,
    from: "vitianscdc2027@vitstudent.ac.in",
    receivedAt: new Date("2026-07-17T10:00:00Z"),
    bodyText,
    attachments: [],
  };
}

// Shaped after a real CDC drive mail. The fast path triggers on
// "Name of the Company" + CTC, and previously dropped the visit date entirely,
// leaving the company invisible on /companies.
const DRIVE_BODY = `
Name of the Company
*Eternal (Zomato)*
Category
*Super Dream Internship/ Placement*
Date of Visit: *27-07-2026 - online mode *
Eligible Branches - All B.Tech branches
CTC
59 LPA
`;

describe("regex fast path — visit date", () => {
  it("extracts a day-first visit date stated on the label line", () => {
    const result = tryRegexExtract(mail(DRIVE_BODY));
    expect(result.matched).toBe(true);
    // 27-07-2026 is 27 July, not 7 something — CDC mails are DD-MM-YYYY.
    expect(result.visitDate).toBe("2026-07-27");
  });

  it("reads an ambiguous date day-first rather than month-first", () => {
    const result = tryRegexExtract(mail(DRIVE_BODY.replace("27-07-2026", "07-08-2026")));
    expect(result.visitDate).toBe("2026-08-07");
  });

  it("accepts slash and dot separators", () => {
    expect(tryRegexExtract(mail(DRIVE_BODY.replace("27-07-2026", "27/07/2026"))).visitDate).toBe("2026-07-27");
    expect(tryRegexExtract(mail(DRIVE_BODY.replace("27-07-2026", "27.07.2026"))).visitDate).toBe("2026-07-27");
  });

  it("returns undefined when the mail states no visit date", () => {
    expect(tryRegexExtract(mail(DRIVE_BODY.replace(/Date of Visit.*\n/, ""))).visitDate).toBeUndefined();
  });

  it("rejects an impossible month rather than inventing a date", () => {
    expect(tryRegexExtract(mail(DRIVE_BODY.replace("27-07-2026", "27-13-2026"))).visitDate).toBeUndefined();
  });

  it("classifies the drive as B.Tech from its eligible branches", () => {
    expect(tryRegexExtract(mail(DRIVE_BODY)).program).toBe("BTECH");
  });
});
