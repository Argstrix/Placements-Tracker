import { distance } from "fastest-levenshtein";

export interface CompanyCandidate {
  id: string;
  normalizedName: string;
}

export interface MatchResult {
  companyId: string | null;
  confidence: "HIGH" | "LOW" | null;
}

const SUFFIXES = /\b(pvt\.?|private|ltd\.?|limited|inc\.?|llp)\b/gi;

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(SUFFIXES, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A normalized-name edit distance of up to 20% of the shorter string's
// length is treated as "the same company, imprecisely written" rather than
// a different company entirely.
export function matchCompany(rawName: string, existing: CompanyCandidate[]): MatchResult {
  const normalized = normalizeCompanyName(rawName);

  const exact = existing.find((c) => c.normalizedName === normalized);
  if (exact) return { companyId: exact.id, confidence: "HIGH" };

  let best: { candidate: CompanyCandidate; dist: number } | null = null;
  for (const candidate of existing) {
    const dist = distance(normalized, candidate.normalizedName);
    if (!best || dist < best.dist) best = { candidate, dist };
  }

  if (best) {
    const threshold = Math.floor(Math.min(normalized.length, best.candidate.normalizedName.length) * 0.2);
    if (best.dist <= threshold && best.dist > 0) {
      return { companyId: best.candidate.id, confidence: "LOW" };
    }
  }

  return { companyId: null, confidence: null };
}
