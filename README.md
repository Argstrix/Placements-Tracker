# Placement Tracker

> **This is an unofficial, student-built tool.** It is not affiliated with, endorsed by, or operated by VIT CDC (Career Development Centre). It exists to make placement-cell mails easier to track — always cross-check dates, eligibility, and instructions against the original mail shown on each page.

A centralized tracker for VIT placement-cell mails: company visit dates, eligibility, shortlist status, and instructions — extracted automatically from Gmail and kept in one searchable place instead of scattered across your inbox.

## What it does

- Watches a Gmail label for placement-cell mail and ingests it automatically (near-real-time via Gmail push notifications, with a daily fallback poll as a safety net).
- Extracts structured info (company, dates, branches, eligibility, CTC/stipend, venue, instructions) using a regex fast-path for well-structured mails and an LLM (Gemini, with Groq as a fallback provider) for everything else.
- Publishes immediately — there's no manual approval step, since the source mail was already broadcast to the full student list. Only genuinely failed extractions are held back (and auto-retried); low-confidence-but-present fields are shown flagged, alongside the original mail, so anyone can self-verify.
- Extracts shortlist Neo IDs deterministically from both Excel attachments and inline mail-body lists, and offers partial-match search.
- Shows every company's full mail history as a timeline (registration → shortlist rounds → results/updates), with in-app viewers for PDF, DOCX, and XLSX attachments — no downloads required.
- Gates access to `@vitstudent.ac.in` accounts (or an admin allowlist that isn't domain-restricted, since the site owner's own login is a personal Gmail address).
- Gives the admin a lightweight dashboard (ingestion log, retry, reported issues, manage-admins) rather than a content-approval queue.

Full design rationale lives in [`docs/superpowers/specs/2026-07-24-placement-tracker-design.md`](docs/superpowers/specs/2026-07-24-placement-tracker-design.md).

## Architecture

- **Framework**: Next.js 16 (App Router, TypeScript), deployed on Vercel.
- **Database**: PostgreSQL via [Neon](https://neon.tech) in production, accessed through Prisma's driver-adapter API (`@prisma/adapter-neon`). Local dev/tests use [PGlite](https://pglite.dev) (an embedded, real Postgres compiled to WASM) via `pglite-prisma-adapter` — same schema, same semantics, no daemon or Docker required.
- **Auth**: NextAuth v4 with Google OAuth. Access is granted to `@vitstudent.ac.in` emails or anyone in the `AdminUser` allowlist (database-backed, self-service after the first admin is seeded).
- **Extraction**: LangChain's structured-output API (Zod schema, automatic re-prompt on invalid output) with `.withFallbacks()` chaining Gemini (primary) to Groq (fallback). A regex pass runs first for labeled-field mails, skipping the LLM call entirely when it matches confidently.
- **Ingestion**: Gmail `watch()` pushes to a webhook via Cloud Pub/Sub; a daily Vercel Cron job re-syncs the label (catches anything a missed push didn't deliver) and retries previously failed mail, alerting the admin by email only if a mail is still failing after retries are exhausted.
- **Attachments**: Vercel Blob storage, served only through an authenticated proxy route — never linked as raw public URLs.
- **Company enrichment**: a one-time, best-effort web search + LLM summary per new company, via [Tavily](https://tavily.com) (chosen over Google's Custom Search API, which is closed to new signups and shuts down 2027-01-01), with sources always shown alongside the summary.

Every external service used has a free tier that comfortably covers this project's volume — see the Cost table in the design spec.

## Dependency overrides

`package.json` pins a few transitive dependencies. They are not cosmetic — removing them reintroduces known advisories, so `npm audit` should stay at zero:

| Override | Why |
|---|---|
| `gaxios@^7.3.0` | `googleapis-common` pins `gaxios@7.1.3`, which drags in `rimraf → glob → minimatch → brace-expansion` and the GHSA-mh99-v99m-4gvg DoS. 7.3.0 dropped `rimraf` entirely, removing the chain rather than patching its leaf. |
| `minimatch@^10.2.5` | The `eslint-plugin-*` packages bundled inside `eslint-config-next` pin `minimatch@3`, which can only use the vulnerable `brace-expansion@1.x`. |
| `brace-expansion@^5.0.8` | `5.0.8` is the only patched release — there is no `1.1.17`/`2.1.3` backport, so every earlier version across all majors is affected. |

Note that `brace-expansion@5` cannot be forced on its own: `minimatch@3` does `require('brace-expansion')` expecting a bare function, and v5's CommonJS build exports a namespace, giving `TypeError: expand is not a function`. The `minimatch` override is what makes the `brace-expansion` one safe, so the two must move together.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in placeholder values — see below; nothing needs to be real to run tests or build
npm run dev
```

Run the test suite (uses the embedded PGlite database — no setup required):

```bash
npx vitest run
```

Type-check and build:

```bash
npx tsc --noEmit
npm run build
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values before connecting to live services. The app builds and tests pass with placeholder values — nothing here is required until you actually want live Gmail ingestion, real extraction, or a deployed instance.

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | [Neon](https://neon.tech) — create a project, copy the pooled connection string. |
| `NEXTAUTH_URL` | Your deployed URL (or `http://localhost:3000` for local dev). |
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application). Used for both student sign-in and the admin's Gmail access. |
| `INITIAL_ADMIN_EMAIL` | Your own email (personal Gmail is fine) — seeded as the first admin on first run. |
| `GMAIL_REFRESH_TOKEN` | OAuth refresh token for the Gmail account being watched, scoped to `gmail.readonly` and `gmail.send`. Generate via the [OAuth Playground](https://developers.google.com/oauthplayground) or a one-off script using the same client ID/secret above. |
| `GMAIL_LABEL_ID` | The Gmail label ID your placement-mail filter applies (see setup below). Find it via the Gmail API `users.labels.list`, or in the label's settings URL. |
| `GMAIL_PUBSUB_TOPIC` | A Cloud Pub/Sub topic in the same Google Cloud project, e.g. `projects/your-project/topics/placement-tracker`. |
| `GMAIL_PUBSUB_VERIFICATION_TOKEN` | Any random string — `openssl rand -hex 16` works. Set as a query param on the Pub/Sub push subscription's endpoint URL. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) — free tier. |
| `GROQ_API_KEY` | [Groq Console](https://console.groq.com/keys) — free tier, used as the extraction fallback. |
| `TAVILY_API_KEY` | [Tavily](https://app.tavily.com) — free tier, no card required. Used only for the one-time company enrichment blurb. |
| `BLOB_READ_WRITE_TOKEN` | Vercel dashboard → Storage → Blob → create a store → copy the token. |
| `CRON_SECRET` | Any random string — `openssl rand -base64 32`. Vercel sends this automatically as a Bearer token for jobs defined in `vercel.json`; it's what stops the cron endpoints from being triggerable by anyone on the internet. |

## One-time Gmail setup

1. In Gmail, create a filter matching your placement-cell senders (e.g. `from:(vitianscdc2027@vitstudent.ac.in OR vitcc2027ug@vitstudent.ac.in)`) and have it apply a label — e.g. `Placement-Tracker`. Adding a new sender later is just editing this filter, no code change.
2. In Google Cloud Console, enable the Gmail API and Cloud Pub/Sub API, and create a Pub/Sub topic (`GMAIL_PUBSUB_TOPIC`).
3. Grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role on that topic (required for Gmail to publish to it).
4. Create a push subscription on that topic pointing to `https://<your-deployment>/api/ingest/gmail-webhook?token=<GMAIL_PUBSUB_VERIFICATION_TOKEN>`.
5. Once deployed, the daily cron job (`/api/cron/renew-watch`) keeps the `watch()` subscription alive — it expires every 7 days if not renewed.

## Deploying to Vercel

1. Push this repo to GitHub and import it into Vercel.
2. Add every environment variable from the table above in the Vercel project settings.
3. In Google Cloud Console, set the OAuth consent screen to **"In Production"** (self-serve for the non-sensitive scopes used for student sign-in) — otherwise Google caps sign-in at 100 test users.
4. Deploy. `vercel.json` already defines the two daily cron jobs (`renew-watch`, `retry-failed`) — no extra configuration needed.
5. Sign in once with the account matching `INITIAL_ADMIN_EMAIL` to confirm admin access, then use **Manage Admins** in the dashboard to add anyone else.

Everything in this stack — Vercel Hobby, Neon free tier, Vercel Blob free tier, Gmail API, Cloud Pub/Sub free tier, Gemini free tier, Groq free tier, Tavily free tier, Google OAuth — stays at $0/month at the scale this project targets (~12k students). See the Cost table in the design spec for the reasoning.
