// Neo IDs observed in real shortlist mails are 8-character alphanumeric
// codes mixing letters and digits (e.g. O3D8V4U8), same format as the
// XLSX-embedded ones — some mails (e.g. Fischer Jordan-style shortlists)
// paste the list directly into the mail body instead of attaching a sheet.
const NEO_ID_PATTERN = /^[A-Z0-9]{6,10}$/;

export interface ExtractedShortlistEntry {
  neoId: string;
  round?: string;
}

export function extractNeoIdsFromBody(bodyText: string): ExtractedShortlistEntry[] {
  const candidates = bodyText.split(/\r?\n/).map((line) => line.trim().toUpperCase());
  const seen = new Set<string>();
  const entries: ExtractedShortlistEntry[] = [];

  for (const candidate of candidates) {
    if (NEO_ID_PATTERN.test(candidate) && /[0-9]/.test(candidate) && /[A-Z]/.test(candidate)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      entries.push({ neoId: candidate });
    }
  }

  return entries;
}
