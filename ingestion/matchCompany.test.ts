import { describe, it, expect } from "vitest";
import { companyAliases, matchCompany, normalizeCompanyName, type CompanyCandidate } from "./matchCompany";

describe("normalizeCompanyName", () => {
  it("lowercases and strips common suffixes/whitespace", () => {
    expect(normalizeCompanyName("Fischer Jordan Pvt. Ltd.")).toBe("fischer jordan");
    expect(normalizeCompanyName("  IDFC FIRST Bank  ")).toBe("idfc first bank");
  });
});

function candidate(over: Partial<CompanyCandidate> & { id: string; normalizedName: string }): CompanyCandidate {
  return { program: "BOTH", lastMailAt: null, name: over.normalizedName, ...over };
}

describe("matchCompany", () => {
  const existing: CompanyCandidate[] = [
    candidate({ id: "1", normalizedName: "fischer jordan" }),
    candidate({ id: "2", normalizedName: "idfc first bank" }),
  ];

  it("matches an exact normalized name with HIGH confidence", () => {
    expect(matchCompany("Fischer Jordan", existing)).toEqual({ companyId: "1", confidence: "HIGH" });
  });

  it("normalizes away common company suffixes as an exact match", () => {
    expect(matchCompany("Fischer Jordan Pvt Ltd", existing)).toEqual({ companyId: "1", confidence: "HIGH" });
  });

  it("matches a misspelled variant with LOW confidence", () => {
    const result = matchCompany("Fischer Jordann", existing);
    expect(result.companyId).toBe("1");
    expect(result.confidence).toBe("LOW");
  });

  it("returns no match for a genuinely new company", () => {
    expect(matchCompany("Wakefit", existing)).toEqual({ companyId: null, confidence: null });
  });
});

describe("companyAliases", () => {
  it("yields the full name, the parenthesised name, and the name without it", () => {
    expect(companyAliases("Eternal (Zomato)").sort()).toEqual(["eternal", "eternal (zomato)", "zomato"]);
  });

  it("still normalizes suffixes inside aliases", () => {
    expect(companyAliases("Eternal Pvt Ltd (Zomato)")).toContain("zomato");
  });

  it("is a single alias when there is no parenthetical", () => {
    expect(companyAliases("Wakefit")).toEqual(["wakefit"]);
  });

  it("drops one-character fragments as too weak to identify a company", () => {
    expect(companyAliases("Infosys (A)")).not.toContain("a");
  });
});

describe("matchCompany — rebranded names", () => {
  // The real case: the drive mail said "Eternal (Zomato)" and every follow-up
  // said just "Zomato", which created a second, empty drive.
  const eternal = candidate({ id: "e", normalizedName: "eternal (zomato)", name: "Eternal (Zomato)" });

  it("links a follow-up naming only the former brand", () => {
    const result = matchCompany("Zomato", [eternal]);
    expect(result.companyId).toBe("e");
    // LOW so the merge is visible for review rather than silent.
    expect(result.confidence).toBe("LOW");
  });

  it("links a follow-up naming only the new brand", () => {
    expect(matchCompany("Eternal", [eternal]).companyId).toBe("e");
  });

  it("still prefers an exact full-name match at HIGH confidence", () => {
    expect(matchCompany("Eternal (Zomato)", [eternal])).toEqual({ companyId: "e", confidence: "HIGH" });
  });

  it("does not link an unrelated company", () => {
    expect(matchCompany("Wakefit", [eternal])).toEqual({ companyId: null, confidence: null });
  });
});

describe("matchCompany — programme separation", () => {
  const btech = candidate({ id: "b", normalizedName: "infosys", program: "BTECH", lastMailAt: new Date("2026-06-01") });
  const mtech = candidate({ id: "m", normalizedName: "infosys", program: "MTECH", lastMailAt: new Date("2026-06-10") });

  it("routes a stated programme to its own drive", () => {
    expect(matchCompany("Infosys", [btech, mtech], "BTECH")).toEqual({ companyId: "b", confidence: "HIGH" });
    expect(matchCompany("Infosys", [btech, mtech], "MTECH")).toEqual({ companyId: "m", confidence: "HIGH" });
  });

  it("treats a company known only under the other programme as a new drive", () => {
    // Creating a second row is right here — an M.Tech drive is genuinely not
    // the B.Tech one, and merging them would corrupt both packages.
    expect(matchCompany("Infosys", [btech], "MTECH")).toEqual({ companyId: null, confidence: null });
  });

  it("attaches a programme-specific mail to a combined drive", () => {
    const both = candidate({ id: "x", normalizedName: "infosys", program: "BOTH" });
    expect(matchCompany("Infosys", [both], "BTECH")).toEqual({ companyId: "x", confidence: "HIGH" });
  });

  it("links an unstated programme by name when that is unambiguous", () => {
    expect(matchCompany("Infosys", [btech], null)).toEqual({ companyId: "b", confidence: "HIGH" });
  });

  it("falls back to the most recently active drive, flagged LOW, when ambiguous", () => {
    // The realistic case: "Infosys — Shortlist Round 2" with no programme named
    // and both drives running. A wrong guess must be visible, not silent.
    expect(matchCompany("Infosys", [btech, mtech], null)).toEqual({ companyId: "m", confidence: "LOW" });
  });

  it("never reports HIGH on a fuzzy name match even when the programme lines up", () => {
    const result = matchCompany("Infosyss", [btech, mtech], "BTECH");
    expect(result.companyId).toBe("b");
    expect(result.confidence).toBe("LOW");
  });

  it("keeps unrelated companies out of the ambiguity tie-break", () => {
    const other = candidate({ id: "z", normalizedName: "wakefit", program: "MTECH", lastMailAt: new Date("2026-07-01") });
    expect(matchCompany("Infosys", [btech, other], null)).toEqual({ companyId: "b", confidence: "HIGH" });
  });
});
