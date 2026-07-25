import type { MailEventType } from "@prisma/client";

export interface RetentionThresholds {
  /** Days of silence after a RESULT mail before a drive counts as finished. */
  afterResultDays: number;
  /** Days of total silence before a drive with no RESULT mail is written off. */
  idleDays: number;
}

export const DEFAULT_THRESHOLDS: RetentionThresholds = {
  afterResultDays: 30,
  idleDays: 120,
};

export interface RetirementCandidate {
  retiredAt: Date | null;
  mailEvents: { type: MailEventType; receivedAt: Date }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a company's drive is over and its attachments can be reclaimed.
 *
 * Two separate signals, because not every drive announces a result. A company
 * that sent a RESULT mail and then went quiet is finished, and 30 days is
 * enough to be confident no follow-up is coming. A company that never sent one
 * may simply have gone dark mid-process, so it gets a much longer rope before
 * we assume the same.
 *
 * Pure, so the thresholds can be exercised directly without a database.
 */
export function isRetirable(company: RetirementCandidate, now: Date, thresholds: RetentionThresholds): boolean {
  if (company.retiredAt) return false;
  // A company with no mail at all has no evidence either way — it may have just
  // been created by an in-flight ingestion. Never retire on absence of data.
  if (company.mailEvents.length === 0) return false;

  const lastReceivedAt = Math.max(...company.mailEvents.map((e) => e.receivedAt.getTime()));
  const quietDays = (now.getTime() - lastReceivedAt) / DAY_MS;

  const hasResult = company.mailEvents.some((e) => e.type === "RESULT");
  const threshold = hasResult ? thresholds.afterResultDays : thresholds.idleDays;

  return quietDays > threshold;
}
