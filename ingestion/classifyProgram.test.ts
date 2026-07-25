import { describe, it, expect } from "vitest";
import { classifyProgram } from "./classifyProgram";

describe("classifyProgram", () => {
  it("recognises B.Tech in its usual spellings", () => {
    for (const s of ["B.Tech CSE", "BTech students", "B Tech 2027 batch", "B.E. Mechanical"]) {
      expect(classifyProgram(s)).toBe("BTECH");
    }
  });

  it("recognises M.Tech in its usual spellings", () => {
    for (const s of ["M.Tech CSE", "MTech students", "M Tech Integrated", "M.E. Structural"]) {
      expect(classifyProgram(s)).toBe("MTECH");
    }
  });

  it("treats Integrated M.Tech as M.Tech", () => {
    // Those students sit in the PG placement pool despite entering at UG level.
    expect(classifyProgram("Integrated M.Tech Software Engineering")).toBe("MTECH");
  });

  it("returns BOTH when a single mail addresses each programme", () => {
    expect(classifyProgram("Drive open to B.Tech and M.Tech candidates")).toBe("BOTH");
    expect(classifyProgram("Eligibility: UG and PG students")).toBe("BOTH");
  });

  it("returns null when the mail says nothing about programme", () => {
    // Shortlist and result mails usually just name the company. Guessing here
    // would file the mail against the wrong drive.
    expect(classifyProgram("Shortlist for Infosys - Round 2")).toBeNull();
    expect(classifyProgram("Please find attached the final list.")).toBeNull();
  });

  it("does not fire on substrings inside unrelated words", () => {
    // "BE" inside BENGALURU and "ME" inside MECHANICAL/NAME are the obvious traps.
    expect(classifyProgram("Venue: BENGALURU campus")).toBeNull();
    expect(classifyProgram("Name of the Company: Wakefit")).toBeNull();
    expect(classifyProgram("MECHANISM of selection")).toBeNull();
  });

  it("ignores UG/PG in the document checklist every CDC mail ends with", () => {
    // Real regression: this line classified a Zomato PPT mail as BOTH, which
    // put a "B.Tech + M.Tech" badge on a drive whose programme was unstated.
    const boilerplate =
      "Carry your updated Resumes, photos, College photo ID and all other relevant certificates... " +
      "(Photo Copy of Mark Sheets - PG, UG, Higher Secondary 10th)";
    expect(classifyProgram(boilerplate)).toBeNull();
  });

  it("still reads UG/PG when they qualify a group of students", () => {
    expect(classifyProgram("Open to UG students only")).toBe("BTECH");
    expect(classifyProgram("PG candidates may apply")).toBe("MTECH");
  });

  it("is case insensitive", () => {
    expect(classifyProgram("b.tech")).toBe("BTECH");
    expect(classifyProgram("M.TECH")).toBe("MTECH");
  });
});
