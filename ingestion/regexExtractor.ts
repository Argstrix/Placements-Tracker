import type { ParsedMail } from "./parseMail";
import { classifyProgram, type Program } from "./classifyProgram";

export interface FastPathResult {
  matched: boolean;
  companyName?: string;
  program?: Program | null;
  /** ISO yyyy-mm-dd, or undefined when the mail states no visit date. */
  visitDate?: string;
  category?: string;
  ctc?: string;
  stipend?: string;
  eligibilityCriteria?: string;
  eligibleBranches?: string[];
  website?: string;
}

/**
 * "Date of Visit: *27-07-2026 - online mode*" and friends.
 *
 * Written as its own matcher because the value sits on the same line as the
 * label, unlike the block fields extractLabeledField handles, and because the
 * fast path previously dropped this field entirely — leaving companies with a
 * null visitDate, which the /companies date filter silently excludes.
 *
 * Day-first: CDC mails use Indian DD-MM-YYYY throughout. Reading 07-08-2026 as
 * 7 August rather than 8 July matters — a misread here shows students the
 * wrong drive date.
 */
function extractVisitDate(body: string): string | undefined {
  const match = body.match(/Date\s+of\s+Visit\s*:?\s*\**\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/i);
  if (!match) return undefined;

  const [, day, month, year] = match;
  const d = Number(day);
  const m = Number(month);
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;

  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractLabeledField(body: string, label: string): string | undefined {
  const pattern = new RegExp(`${label}\\s*\\n+\\s*\\*{0,2}([^\\n*]+?)\\*{0,2}\\s*\\n`, "i");
  const match = body.match(pattern);
  return match?.[1]?.trim();
}

export function tryRegexExtract(mail: ParsedMail): FastPathResult {
  const body = mail.bodyText;
  const companyName = extractLabeledField(body, "Name of the Company");
  const category = extractLabeledField(body, "Category");
  const ctc = extractLabeledField(body, "CTC");
  const stipend = extractLabeledField(body, "Stipend");
  const website = extractLabeledField(body, "Website");

  // Bulleted branch lists (marked with "Ø") can have blank lines between
  // each bullet, so a "stop at first blank line" match would only capture
  // the first item — instead, scan every "Ø ..." line up to the next
  // section heading.
  const branchesSection = body.match(/Eligible Branches\s*\n+([\s\S]*?)(?:Eligibility Criteria|\n\s*\n\s*\n)/i);
  const eligibleBranches = branchesSection
    ? [...branchesSection[1].matchAll(/Ø\s*([^\n]+)/g)]
        .map((m) => m[1].replace(/[.\s]+$/, "").trim())
        .filter(Boolean)
    : undefined;

  const eligibilityMatch = body.match(/Eligibility Criteria\s*\n+([\s\S]*?)\n\s*\n\s*\n/i);
  const eligibilityCriteria = eligibilityMatch?.[1]?.trim();

  // Programme is read from the subject as well as the body — plenty of mails
  // put "B.Tech" only in the subject line — and from the eligibility text,
  // which is where branch-level programme markers live.
  const program = classifyProgram(`${mail.subject}\n${body}`);

  // Require the two most load-bearing fields before trusting the fast path;
  // anything less structured should fall through to the LLM.
  const matched = Boolean(companyName && (ctc || eligibilityCriteria));

  return {
    matched,
    companyName,
    program,
    visitDate: extractVisitDate(body),
    category,
    ctc,
    stipend,
    eligibilityCriteria,
    eligibleBranches,
    website,
  };
}
