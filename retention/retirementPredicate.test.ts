import { describe, it, expect } from "vitest";
import { isRetirable, DEFAULT_THRESHOLDS } from "./retirementPredicate";
import type { MailEventType } from "@prisma/client";

const NOW = new Date("2026-07-25T00:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function company(events: { type: MailEventType; daysAgo: number }[], retiredAt: Date | null = null) {
  return {
    retiredAt,
    mailEvents: events.map((e) => ({ type: e.type, receivedAt: daysAgo(e.daysAgo) })),
  };
}

describe("isRetirable", () => {
  it("retires a drive that announced a result and then went quiet past the threshold", () => {
    const c = company([
      { type: "REGISTRATION", daysAgo: 60 },
      { type: "RESULT", daysAgo: 31 },
    ]);
    expect(isRetirable(c, NOW, DEFAULT_THRESHOLDS)).toBe(true);
  });

  it("holds a drive whose result mail is still inside the threshold", () => {
    const c = company([
      { type: "REGISTRATION", daysAgo: 60 },
      { type: "RESULT", daysAgo: 29 },
    ]);
    expect(isRetirable(c, NOW, DEFAULT_THRESHOLDS)).toBe(false);
  });

  it("uses the latest mail, not the result mail, when a follow-up arrived after the result", () => {
    // An update mail two days ago means the drive is still live even though the
    // result was announced months back.
    const c = company([
      { type: "RESULT", daysAgo: 90 },
      { type: "UPDATE", daysAgo: 2 },
    ]);
    expect(isRetirable(c, NOW, DEFAULT_THRESHOLDS)).toBe(false);
  });

  it("writes off a drive that never announced a result once it is fully idle", () => {
    const c = company([{ type: "REGISTRATION", daysAgo: 121 }]);
    expect(isRetirable(c, NOW, DEFAULT_THRESHOLDS)).toBe(true);
  });

  it("keeps a resultless drive that is quiet but not yet idle", () => {
    // 60 days of silence is past the RESULT threshold but well inside the idle
    // one — a drive that never announced anything gets a much longer rope.
    const c = company([{ type: "REGISTRATION", daysAgo: 60 }]);
    expect(isRetirable(c, NOW, DEFAULT_THRESHOLDS)).toBe(false);
  });

  it("never retires a company that is already retired", () => {
    const c = company([{ type: "RESULT", daysAgo: 300 }], new Date("2026-01-01T00:00:00Z"));
    expect(isRetirable(c, NOW, DEFAULT_THRESHOLDS)).toBe(false);
  });

  it("never retires a company with no mail at all", () => {
    // Absence of mail is not evidence a drive finished — it may be mid-ingestion.
    expect(isRetirable(company([]), NOW, DEFAULT_THRESHOLDS)).toBe(false);
  });

  it("honours custom thresholds", () => {
    const c = company([{ type: "RESULT", daysAgo: 10 }]);
    expect(isRetirable(c, NOW, { afterResultDays: 5, idleDays: 120 })).toBe(true);
    expect(isRetirable(c, NOW, { afterResultDays: 15, idleDays: 120 })).toBe(false);
  });
});
