export type Program = "BTECH" | "MTECH" | "BOTH";

/**
 * B.Tech markers. `BE`/`B.E.` are included because CDC mails use them
 * interchangeably with B.Tech. Word boundaries matter: without them "BE" would
 * fire on "BENGALURU" and "MS" on "MSC OPERATIONS".
 */
const BTECH_PATTERNS = [
  /\bb\.?\s?tech\b/i,
  /\bbtech\b/i,
  /\bb\.?\s?e\.?\b/i,
  /\bbachelor(?:'?s)?\s+of\s+(?:technology|engineering)\b/i,
  /\bunder\s?graduate\b/i,
  /\bug\b/i,
];

/**
 * M.Tech markers. Integrated M.Tech is treated as M.Tech: those students sit
 * in the PG placement pool even though the programme starts at undergraduate
 * level, so grouping them with B.Tech would show them the wrong eligibility.
 */
const MTECH_PATTERNS = [
  /\bm\.?\s?tech\b/i,
  /\bmtech\b/i,
  /\bm\.?\s?e\.?\b/i,
  /\bmaster(?:'?s)?\s+of\s+(?:technology|engineering)\b/i,
  /\bintegrated\s+m\.?\s?tech\b/i,
  /\bpost\s?graduate\b/i,
  /\bpg\b/i,
];

function matches(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Which programme a mail is addressed to, from its subject and body.
 *
 * Returns null rather than guessing when the mail says nothing — a follow-up
 * shortlist mail usually just names the company, and inventing a programme
 * there would silently file it against the wrong drive. Resolving that case is
 * matchCompany's job, which has the existing rows to disambiguate against.
 */
export function classifyProgram(text: string): Program | null {
  const isBtech = matches(text, BTECH_PATTERNS);
  const isMtech = matches(text, MTECH_PATTERNS);

  if (isBtech && isMtech) return "BOTH";
  if (isBtech) return "BTECH";
  if (isMtech) return "MTECH";
  return null;
}
