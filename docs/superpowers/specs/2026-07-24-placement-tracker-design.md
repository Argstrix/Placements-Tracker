# Placement Tracker — Design Spec

Date: 2026-07-24

## Problem

The user (a VIT Chennai student, 2027 batch) receives frequent placement-cell mails (registrations, shortlists, results, general notices) from multiple campus mailing lists (Vellore, Chennai, AP, Bhopal) and is losing track of which company has which date, criteria, and shortlist status. Mail formats vary significantly between the placement cell's own senders. The goal is a centralized, always-current web app that ingests these mails automatically, extracts structured info, and gives ~12k VIT students a single place to check company visit dates, eligibility, and shortlist status — self-serve, with the original mail always available as a reference for verification.

## Non-goals

- No manual review/approval gate before publishing — the source mail is already broadcast to the full student mailing list, so there is no confidentiality benefit to withholding it further. The admin (site owner) only monitors pipeline health, not content.
- No support for other colleges/universities — VIT-specific (multi-campus, multi-batch within VIT).
- No student self-registration/signup flow beyond Google OAuth — no manual account creation.

## Constraints

- **Must be $0/month**, both server-side and personal cost, at full scale (~12k students).
- Deploys to Vercel.
- Handles significant format variance in source mail (see Appendix: Sample Mail Findings).

## Architecture

- **Framework**: Next.js (App Router), deployed on Vercel (Hobby/free tier).
- **Database**: Postgres via Neon (free tier), accessed through Prisma ORM.
- **File storage**: Vercel Blob (free tier) for attachments (PDFs, Word docs, Excel sheets), served only through an authenticated proxy route — never linked as raw public Blob URLs, to keep the login gate meaningful.
- **Scheduled jobs**: Vercel Cron (Hobby tier: daily granularity only) — used for (a) renewing the Gmail `watch()` subscription (needs renewal every 7 days, so daily cadence is more than sufficient) and (b) a daily fallback poll as a safety net in case a push notification is ever missed. Real-time delivery is handled by push, not cron.
- **Mail ingestion trigger**: Gmail API `watch()`, scoped to a single Gmail label, pushing near-instant events via Google Cloud Pub/Sub (free tier — usage here is far below the free quota) to a Vercel webhook endpoint.
- **Extraction LLM**: Google Gemini free tier (structured JSON output) as primary; Groq free tier (open models) as a fallback provider if Gemini's free tier is ever unavailable. A cheap regex/heuristic first pass is attempted for well-structured, labeled-field mails (e.g. registration mails) before falling back to the LLM, both for cost headroom and reliability. Extraction sits behind a provider interface, so a self-hosted/local LLM (e.g. Ollama) could be swapped in later as a one-file change — but local is explicitly out of scope for launch, since Vercel's stateless serverless functions cannot hold a model in memory, self-hosting one requires an always-on server (breaking the $0/zero-maintenance goal), and a cheap-enough local model would extract *worse* on this messy-format task than the hosted free-tier models.
- **Extraction orchestration**: LangChain, for three concrete reasons rather than as a default choice — (1) `.withStructuredOutput()` binds a Zod schema to the model call and automatically re-prompts the model if its output fails schema validation, instead of accepting malformed JSON; (2) `.withFallbacks()` implements the Gemini→Groq fallback natively, retrying the full extraction on the fallback model if the primary errors or exhausts its validation retries; (3) it's the same provider-agnostic interface referenced above for a future local-LLM swap.
- **Auth**: Auth.js (NextAuth) with Google OAuth. A single login flow; server-side access check after sign-in is: verified email ends in `@vitstudent.ac.in` (student access to the public site) **OR** verified email is in the `AdminUser` allowlist (admin access). Admin accounts are not required to be on the college domain — the owner's own login is a personal Gmail address — and admin access includes full access to the public/client-facing site plus the admin dashboard, not the dashboard alone. OAuth consent screen must be set to "In Production" in Google Cloud Console to lift the 100-user testing cap (self-serve for non-sensitive scopes, no manual Google review required).
  - **Admin allowlist is database-backed, not hardcoded**: the first admin (owner's personal email) is seeded once from an environment variable at initial setup; further admins are added/removed self-service from within the admin dashboard itself — no redeploy or code change needed to grant someone else admin access later.
- **Site-wide**: `noindex` (keep out of search engines entirely), footer disclaimer stating the site is unofficial, student-built, and not affiliated with VIT CDC.

## Data Model (high level)

- **Company** — one per hiring drive. Fields: name (+ normalized name for matching), category, campus(es), CTC, stipend, eligibility criteria, eligible branches, current visit date, status (upcoming/completed, derived from date vs. today), confidence flags per field. Optional enrichment fields (see Company Enrichment below): short description, industry, website, source URLs — populated best-effort, absent if the one-time enrichment job never ran or failed.
- **MailEvent** — one per ingested mail. Fields: type (`REGISTRATION` | `SHORTLIST_ROUND` | `RESULT` | `UPDATE` | `GENERAL_NOTICE`), subject, sender, received timestamp, Gmail message ID, rendered body (sanitized), linked `companyId` (nullable — null for `GENERAL_NOTICE`), extraction confidence metadata.
  - A Company's page renders its full ordered timeline of MailEvents (registration → shortlist round(s) → result/updates), each with its own attachments and original-mail reference.
  - `GENERAL_NOTICE` events (no company link) surface on a separate Announcements feed instead of any company timeline or the calendar.
- **Attachment** — Blob storage pointer + mime type, linked to a MailEvent.
- **ShortlistEntry** — Neo ID + round, linked to the source MailEvent. Parsed deterministically from XLSX attachments (not LLM-extracted, since exact-match correctness matters), or from inline body text lists (e.g. Fischer Jordan sample) via the regex/heuristic pass.
- **User** — a `vitstudent.ac.in`-verified student, optional self-entered Neo ID for personal shortlist auto-matching.
- **AdminUser** — email allowlist for admin access (any email, not domain-restricted), plus who added them and when. Seeded once from an env var for the first admin; managed thereafter from the admin dashboard.
- **Interest** — per-user, per-company personal tracking status (interested/registered/attended/etc.).
- **ReportedIssue** — student-submitted "this looks wrong" reports (free text + optional company reference), visible only to the admin. Substitutes for a review queue.
- **IngestionLog** — one per processed mail: status (`SUCCESS` | `FAILED`, no `PARTIAL` state — see Ingestion Pipeline), timestamp, error detail if any, retry count. Feeds the admin dashboard.

**Company matching**: when a mail's extracted company name doesn't exactly match an existing Company, the app fuzzy-matches (normalized, case-insensitive) against existing records to decide whether to extend an existing timeline or create a new Company. Ambiguous/low-confidence matches still publish (linked to the best guess) but are flagged for the admin dashboard.

## Ingestion Pipeline

1. **One-time manual setup**: a Gmail filter labels mail from known placement-cell senders (`vitianscdc2027@vitstudent.ac.in`, `vitcc2027ug@vitstudent.ac.in`, and other campus variants) into a dedicated label (e.g. `Placement-Tracker`). Adding a new sender later is just a filter edit, no redeploy.
2. Gmail `watch()` is scoped to that label; new mail triggers a near-instant Pub/Sub push to a Vercel webhook.
3. Webhook fetches the full mail via Gmail API and classifies it:
   - **Body text** → regex/heuristic pass first (works for labeled-field mails). Falls back to Gemini (JSON schema output covering company, event type, category, dates, campus, branches, eligibility, CTC/stipend, deadlines, venue, instructions) for less structured mails (shortlist announcements, subject-embedded dates/venues, forwarded threads).
   - **XLSX attachments** → parsed deterministically in code (all sheets) to extract Neo ID lists — never LLM-extracted, since exact string correctness is required for search to work.
   - **PDF/DOCX attachments** → stored in Blob; text passed to the LLM alongside the body when needed for fields only present in the attachment (e.g. a JD with eligibility details not restated in the mail body).
   - Legacy `.doc` (binary) attachments are stored and offered as download-only — no lightweight in-browser rendering path exists without server-side conversion tooling that doesn't fit the free-tier constraint.
4. Every extracted field carries a confidence flag. **Uncertain is not the same as broken**: a field the model extracted but isn't fully sure of (e.g. an ambiguous date format) publishes immediately, visually marked "unverified," with the original mail (subject, date/time, rendered body) shown alongside so students can self-verify against the source. There is no approval gate for this case.
5. **Atomic, all-or-nothing per mail**: extraction (LangChain schema validation, with automatic re-prompt on validation failure and Gemini→Groq fallback on provider error), XLSX/attachment parsing, Blob upload, and all DB writes for a mail happen inside a single transaction. If any step ultimately fails — schema validation exhausted its retries, both LLM providers errored, required fields (company name, at minimum) never resolved, attachment parsing threw — **nothing is committed and nothing publishes**. No half-written Company/MailEvent/ShortlistEntry rows ever reach the public site.
6. The IngestionLog always gets a `SUCCESS` or `FAILED` entry. A `FAILED` mail is retried automatically — a few immediate attempts within the same run (covers transient blips like a momentary rate limit), then once a day by the fallback poll for a few more days — and can also be retried manually from the admin dashboard. It stays invisible to students until a retry succeeds.
7. **The admin is not expected to babysit a dashboard.** If a mail is still `FAILED` after automatic retries are exhausted, the app emails the admin directly (via the `gmail.send` scope on the same OAuth grant already used to read mail — no third-party email service, stays free) so a human is only pulled in when a mail genuinely needs one, not as routine monitoring.

## Company Enrichment (one-time, best-effort)

The first time a new Company record is created (never on subsequent mails about the same company — this is strictly a one-time job per company), a background job:

1. Runs a web search for the company name via Google's Programmable Search Engine API (free tier: 100 queries/day, comfortably enough at this volume).
2. Feeds the top results to the same LangChain/Gemini setup used for extraction, asking for a short "about this company" summary (industry, what they do) and their real website if the mail didn't already include one.
3. Stores the result **and the source URLs the summary was drawn from** on the Company record. The UI shows the blurb with those source links directly beneath it, clearly labeled as an auto-generated, unofficial overview — same "show the source" principle used for mail references elsewhere in the app, so students can click through and verify rather than just trusting the summary.

This job is fire-and-forget: it never blocks or gates publishing of the mail-derived record, and if the search or summarization fails, the company page simply renders without a blurb. No retry pressure, since it's a cosmetic enrichment, not functional data — unlike the atomic ingestion pipeline above.

## Public UI

- **Calendar** — visit dates by company, filterable by month or a custom date range.
- **Company timeline pages** — full extracted info (category, branches, eligibility, CTC/stipend, dates, venue, instructions), rendered chronologically through all linked MailEvents (registration → shortlist rounds → result/updates), each with its original mail reference (exact subject/date/time) and attachments. If present, the one-time web-enriched "about this company" blurb is shown clearly labeled as auto-generated/unofficial, visually distinct from the mail-sourced fields.
- **Attachment viewing (in-app, not download-only)**:
  - PDF → inline viewer (`react-pdf`/pdf.js).
  - DOCX → converted to HTML (`mammoth.js`) and rendered inline.
  - XLSX → rendered as a searchable/sortable table (multi-sheet mails get tabbed views), reusing the same parsed data used for Neo ID search.
  - Legacy `.doc` → download-only fallback.
  - All served through the authenticated attachment proxy, never raw public Blob URLs.
- **Neo ID search** — partial-match search across all shortlists (some lists are long; exact-match-only search was explicitly ruled out).
- **Announcements feed** — general notices not tied to any company, separate from the calendar/company pages.
- **Personal tracker** — a student's own interest/application status per company; automatic "you're shortlisted" flags wherever their self-entered Neo ID matches a ShortlistEntry.
- **Report an issue** — lightweight form for flagging incorrect/missing data, routed to the admin (this is the substitute for a review queue).
- Site-wide `noindex` + unofficial-tool disclaimer footer.

## Admin Dashboard (owner-only)

- Ingestion log (mail processed, `SUCCESS`/`FAILED` status, timestamp, error detail, manual retry action for failures).
- Low-confidence-field and low-confidence-company-match flags on already-published records, for spot-checking at leisure (not blocking — these are published-but-uncertain, distinct from the failed/unpublished mails above).
- Reported issues list (from the public report form).
- **Manage Admins** — add/remove entries in the `AdminUser` allowlist, self-service, no redeploy needed.
- No content approve/reject step — purely operational monitoring, since content already publishes automatically once a mail successfully passes ingestion.
- Admins are not confined to this dashboard — the same login gives full access to the public/client site as well, navigable from the same session.

## Security

- Gmail OAuth refresh token (the single most sensitive secret — scopes cover `gmail.readonly` for the entire mailbox plus `gmail.send`, restricted in practice to sending failure-alert mail to the admin's own address only, never to students) lives only in Vercel encrypted environment variables, server-side only, never logged or sent to the client. Revocable instantly via Google Account security settings if ever suspected compromised.
- Domain gate (`@vitstudent.ac.in`) enforced server-side on every data-serving route, not just hidden in the UI.
- Attachments served exclusively through an authenticated proxy route — raw public Blob URLs are never exposed, so the login gate can't be bypassed by sharing a direct link.
- No raw HTML rendering of extracted or mail-sourced content (React's default escaping is relied on; `dangerouslySetInnerHTML` avoided) — mail content is external, semi-untrusted input.
- Admin routes gated to membership in the `AdminUser` allowlist, checked server-side on every admin route — not the general student domain check. Only existing admins can add new admins (the Manage Admins action is itself an admin-only route), so the allowlist can't be self-escalated by a student account.
- Basic rate limiting on public write/search endpoints (Neo ID search, report-issue form) — cheap abuse insurance and keeps usage inside free-tier quotas.
- All secrets (Gmail OAuth client secret + refresh token, Gemini/Groq API keys, DB connection string, NextAuth secret) live in Vercel environment variables; `.env` is gitignored and nothing is committed.

## Cost

Target: $0/month at full scale (~12k students).

| Component | Free tier used | Notes |
|---|---|---|
| Vercel (hosting, functions, cron) | Hobby | Cron limited to daily granularity; real-time delivery relies on Pub/Sub push, not cron frequency |
| Neon Postgres | Free tier | Data volume (companies, mail events, Neo ID rows) stays small even at full scale |
| Vercel Blob | Free tier | Attachment volume is a handful of small files/day |
| Gmail API | Free | No cost regardless of student count — ingestion volume is mail-count-driven, not reader-count-driven |
| Cloud Pub/Sub | Free tier (10GB/mo) | Message volume here is negligible against the quota |
| Gemini API | Free tier | Extraction volume is a handful of calls/day |
| Groq API | Free tier | Fallback only, same low volume |
| Google OAuth | Free | Standard SSO, no cost at any user count |
| Google Programmable Search Engine | Free tier (100 queries/day) | One-time-per-company enrichment job; company volume stays well under quota |

## Appendix: Sample Mail Findings

From the four `.eml` files provided (all VIT CDC-sourced, 2027 batch):

- **Registration mail** (IDFC FIRST Bank): well-structured, labeled table-like fields (Name of the Company, Category, Date of Visit, Eligible Branches, Eligibility Criteria, CTC, Stipend, Last date for Registration, Website, Location, Job Designation, Service Agreement). PDF JD attachment.
- **Shortlist mail 1** (Fischer Jordan): date/time embedded in the subject line, not the body. Neo IDs pasted as a plain-text list directly in the email body.
- **Shortlist mail 2** (Infosys): a forwarded thread (mail-within-a-mail). Date in both subject and body. Shortlist in a multi-sheet XLSX attachment (shortlist / slots / venue on separate sheets).
- **Shortlist mail 3** (Wakefit): date/time/venue all embedded in the subject line. Shortlist in a single-sheet XLSX attachment.

This variance (date location, Neo ID location, single vs. forwarded thread, single vs. multi-sheet attachments) is the core reason extraction is LLM-based with a regex fast path, rather than fixed per-sender templates.
