import * as XLSX from "xlsx";
import type { ParsedAttachment } from "./parseMail";

export interface ExtractedShortlistEntry {
  neoId: string;
  round?: string;
}

// Neo IDs observed in real shortlist mails are 8-character alphanumeric
// codes mixing letters and digits (e.g. A6A5R5C3, I9I4T9K1).
const NEO_ID_PATTERN = /^[A-Z0-9]{6,10}$/;

export function extractNeoIdsFromXlsx(attachment: ParsedAttachment): ExtractedShortlistEntry[] {
  const workbook = XLSX.read(attachment.content, { type: "buffer" });
  const entries: ExtractedShortlistEntry[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (const row of rows) {
      for (const cell of row) {
        const value = String(cell ?? "").trim().toUpperCase();
        if (NEO_ID_PATTERN.test(value) && /[0-9]/.test(value) && /[A-Z]/.test(value)) {
          entries.push({ neoId: value, round: sheetName });
        }
      }
    }
  }

  // De-duplicate — the same Neo ID can legitimately appear on more than one
  // sheet (e.g. shortlist + slot-assignment sheets in the same workbook), or
  // more than once on the same sheet if it spans multiple columns.
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.neoId}:${e.round}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
