import { describe, it, expect } from "vitest";
import { matchCompany, normalizeCompanyName } from "./matchCompany";

describe("normalizeCompanyName", () => {
  it("lowercases and strips common suffixes/whitespace", () => {
    expect(normalizeCompanyName("Fischer Jordan Pvt. Ltd.")).toBe("fischer jordan");
    expect(normalizeCompanyName("  IDFC FIRST Bank  ")).toBe("idfc first bank");
  });
});

describe("matchCompany", () => {
  const existing = [
    { id: "1", normalizedName: "fischer jordan" },
    { id: "2", normalizedName: "idfc first bank" },
  ];

  it("matches an exact normalized name with HIGH confidence", () => {
    const result = matchCompany("Fischer Jordan", existing);
    expect(result).toEqual({ companyId: "1", confidence: "HIGH" });
  });

  it("normalizes away common company suffixes as an exact match", () => {
    const result = matchCompany("Fischer Jordan Pvt Ltd", existing);
    expect(result).toEqual({ companyId: "1", confidence: "HIGH" });
  });

  it("matches a misspelled variant with LOW confidence", () => {
    const result = matchCompany("Fischer Jordann", existing);
    expect(result.companyId).toBe("1");
    expect(result.confidence).toBe("LOW");
  });

  it("returns no match for a genuinely new company", () => {
    const result = matchCompany("Wakefit", existing);
    expect(result).toEqual({ companyId: null, confidence: null });
  });
});
