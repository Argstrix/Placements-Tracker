import type { ParsedMail } from "./parseMail";

export interface FastPathResult {
  matched: boolean;
  companyName?: string;
  category?: string;
  ctc?: string;
  stipend?: string;
  eligibilityCriteria?: string;
  eligibleBranches?: string[];
  website?: string;
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

  // Require the two most load-bearing fields before trusting the fast path;
  // anything less structured should fall through to the LLM.
  const matched = Boolean(companyName && (ctc || eligibilityCriteria));

  return {
    matched,
    companyName,
    category,
    ctc,
    stipend,
    eligibilityCriteria,
    eligibleBranches,
    website,
  };
}
