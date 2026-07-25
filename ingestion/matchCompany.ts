import { distance } from "fastest-levenshtein";
import type { Program } from "./classifyProgram";

export interface CompanyCandidate {
  id: string;
  /** Raw name as the mail wrote it, e.g. "Eternal (Zomato)" — aliases derive from it. */
  name: string;
  normalizedName: string;
  program: Program;
  /** Most recent mail on this drive, used only to break program ambiguity. */
  lastMailAt: Date | null;
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

/**
 * Every name a company might be written under.
 *
 * CDC mails name rebranded companies as "NewName (FormerName)" — the drive
 * announcement said "Eternal (Zomato)" while every follow-up said just
 * "Zomato". Treated as separate companies, the follow-ups formed a second,
 * empty drive and the real one stopped receiving its own timeline.
 *
 * So "Eternal (Zomato)" yields "eternal (zomato)", "eternal" and "zomato",
 * and a later mail under any of those reaches the same drive.
 */
export function companyAliases(rawName: string): string[] {
  const aliases = new Set<string>([normalizeCompanyName(rawName)]);

  for (const parenthesised of rawName.match(/\(([^)]+)\)/g) ?? []) {
    aliases.add(normalizeCompanyName(parenthesised.slice(1, -1)));
  }
  aliases.add(normalizeCompanyName(rawName.replace(/\([^)]*\)/g, "")));

  // Single characters and empties are too weak to identify a company.
  return [...aliases].filter((a) => a.length > 1);
}

function sharesAlias(a: string[], b: string[]): boolean {
  return a.some((x) => b.includes(x));
}

function mostRecent(candidates: CompanyCandidate[]): CompanyCandidate {
  return candidates.reduce((newest, c) =>
    (c.lastMailAt?.getTime() ?? 0) > (newest.lastMailAt?.getTime() ?? 0) ? c : newest
  );
}

/**
 * Picks the drive a mail belongs to, among rows sharing a company name.
 *
 * A stated programme selects its own drive, falling back to a combined BOTH
 * drive. An unstated programme is the common case — shortlist and result mails
 * rarely restate it — so it resolves by name alone when that is unambiguous,
 * and otherwise attaches to the drive with the most recent activity and drops
 * confidence to LOW, which renders the mail flagged rather than letting a
 * wrong guess pass silently.
 */
function selectByProgram(sameName: CompanyCandidate[], program: Program | null): MatchResult {
  if (sameName.length === 0) return { companyId: null, confidence: null };

  if (program) {
    const exact = sameName.find((c) => c.program === program);
    if (exact) return { companyId: exact.id, confidence: "HIGH" };

    // A B.Tech-only mail for a drive recorded as open to both still belongs
    // to that drive.
    const both = sameName.find((c) => c.program === "BOTH");
    if (both) return { companyId: both.id, confidence: "HIGH" };

    // The name exists but only under a different programme — a genuinely new
    // drive, so report no match and let the caller create one.
    return { companyId: null, confidence: null };
  }

  if (sameName.length === 1) return { companyId: sameName[0].id, confidence: "HIGH" };
  return { companyId: mostRecent(sameName).id, confidence: "LOW" };
}

// A normalized-name edit distance of up to 20% of the shorter string's
// length is treated as "the same company, imprecisely written" rather than
// a different company entirely.
export function matchCompany(
  rawName: string,
  existing: CompanyCandidate[],
  program: Program | null = null
): MatchResult {
  const normalized = normalizeCompanyName(rawName);

  const exactName = existing.filter((c) => c.normalizedName === normalized);
  if (exactName.length > 0) return selectByProgram(exactName, program);

  // Before falling back to fuzzy distance, try the rebrand aliases. An exact
  // alias hit is a strong signal, but reported LOW rather than HIGH so a
  // "Zomato" mail landing on the "Eternal (Zomato)" drive is visible for
  // review instead of silently merged.
  const incomingAliases = companyAliases(rawName);
  const aliasMatches = existing.filter((c) => sharesAlias(incomingAliases, companyAliases(c.name)));
  if (aliasMatches.length > 0) {
    const selected = selectByProgram(aliasMatches, program);
    return selected.companyId ? { companyId: selected.companyId, confidence: "LOW" } : selected;
  }

  let bestName: string | null = null;
  let bestDist = Infinity;
  for (const candidate of existing) {
    const dist = distance(normalized, candidate.normalizedName);
    if (dist < bestDist) {
      bestDist = dist;
      bestName = candidate.normalizedName;
    }
  }

  if (bestName !== null) {
    const threshold = Math.floor(Math.min(normalized.length, bestName.length) * 0.2);
    if (bestDist <= threshold && bestDist > 0) {
      // A fuzzy name match is already uncertain, so never report HIGH here
      // even when the programme lines up exactly.
      const fuzzy = selectByProgram(
        existing.filter((c) => c.normalizedName === bestName),
        program
      );
      return fuzzy.companyId ? { companyId: fuzzy.companyId, confidence: "LOW" } : fuzzy;
    }
  }

  return { companyId: null, confidence: null };
}
