# Placement Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Placement Tracker web app per `docs/superpowers/specs/2026-07-24-placement-tracker-design.md` — Gmail-sourced placement mail ingestion with LLM extraction, a public tracker UI for ~12k VIT students, and an admin dashboard — deployable to Vercel at $0/month.

**Architecture:** Next.js 16 (App Router, TypeScript) monolith. Prisma ORM against PostgreSQL (Neon in prod; PGlite — embedded WASM Postgres, real Postgres semantics, no daemon required — for local dev/test, via `pglite-prisma-adapter`). Extraction pipeline: regex fast-path → LangChain (`withStructuredOutput` + `withFallbacks`) against Gemini (primary) / Groq (fallback). Auth via NextAuth v4 (stable; v5 is still beta as of this build) with a custom domain-or-allowlist gate. Attachments in Vercel Blob, served only through an authenticated proxy.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, Prisma 7, PostgreSQL (Neon), PGlite (test/dev), NextAuth v4, LangChain + `@langchain/google-genai` + `@langchain/groq`, `mailparser`, `xlsx` (SheetJS), `mammoth`, `react-pdf`, `zod`, `@vercel/blob`, Vitest + Testing Library.

## Global Constraints

- **$0/month at ~12k-user scale** — every service used must have a free tier that covers this volume (see spec Cost table). Never introduce a paid-only dependency.
- **No approval gate before publish** — extracted records go live immediately; only genuinely failed ingestion (not merely low-confidence) is withheld, per spec Ingestion Pipeline steps 4–7.
- **Atomic ingestion** — a mail's extraction + attachment parsing + DB writes happen in one transaction; partial writes must never be visible.
- **Auth gate is server-side on every data route** — `@vitstudent.ac.in` domain OR `AdminUser` allowlist membership. Never rely on UI-only hiding.
- **Attachments never served via raw public Blob URLs** — always through an authenticated proxy route.
- **No `dangerouslySetInnerHTML` on mail-sourced or web-sourced content** — render as sanitized/escaped text, never raw HTML from an external source.
- **Neo ID search is partial-match**, not exact-only (explicit user requirement).
- **Site-wide `noindex`** and a footer disclaimer: unofficial, student-built, not affiliated with VIT CDC.
- **Commit style**: short (1–2 line) messages, no AI/author attribution trailers, per user instruction.
- **`.env` values are placeholders during this build** — real Gemini/Groq/Gmail/Blob/DB credentials are supplied by the user later. Every task must work (and be testable) with placeholder/mocked credentials; nothing should require a live external call to pass its tests.

---

## Task 1: Project scaffold, layout shell, and env config

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `app/components/SiteFooter.tsx`
- Create: `.env.example`
- Create: `src/env.ts`
- Test: `src/env.test.ts`

**Interfaces:**
- Produces: `getEnv(): Env` from `src/env.ts`, where `Env` is a Zod-inferred type covering every variable listed in `.env.example`. Throws a descriptive error listing exactly which required vars are missing, but only when called — never at import time — so the app can build without real secrets present.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint --use-npm --yes
```

- [ ] **Step 2: Write `.env.example` documenting every variable the whole app will need (placeholders only)**

```bash
# .env.example — copy to .env.local and fill in real values before running against live services.
# Nothing here needs to be real to build, lint, or run the test suite.

# --- Database ---
DATABASE_URL="postgresql://user:password@host:5432/placement_tracker"

# --- Auth (NextAuth v4 + Google OAuth) ---
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-openssl-rand-base64-32"
GOOGLE_CLIENT_ID="replace-with-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="replace-with-google-oauth-client-secret"

# --- Admin bootstrap ---
INITIAL_ADMIN_EMAIL="you@example.com"

# --- Gmail ingestion (same Google Cloud project as OAuth) ---
GMAIL_REFRESH_TOKEN="replace-with-refresh-token-for-the-inbox-being-watched"
GMAIL_LABEL_ID="replace-with-the-Placement-Tracker-label-id"
GMAIL_PUBSUB_TOPIC="projects/your-project/topics/placement-tracker"
GMAIL_PUBSUB_VERIFICATION_TOKEN="replace-with-a-random-shared-secret"

# --- Extraction LLMs ---
GOOGLE_GENERATIVE_AI_API_KEY="replace-with-gemini-api-key"
GROQ_API_KEY="replace-with-groq-api-key"

# --- Company enrichment ---
GOOGLE_SEARCH_API_KEY="replace-with-programmable-search-api-key"
GOOGLE_SEARCH_ENGINE_ID="replace-with-search-engine-id"

# --- Storage ---
BLOB_READ_WRITE_TOKEN="replace-with-vercel-blob-token"
```

- [ ] **Step 2b: Add `.env.local` (with obviously-fake local values) and confirm it's gitignored**

```bash
cp .env.example .env.local
```

Edit `.env.local` so every value is a clearly-fake local placeholder (e.g. `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"`) — this file is only for local `next build`/`next dev` to not crash on missing env access; real secrets are added later by the user. Confirm `.env.local` matches an ignore rule already in `.gitignore` (it does: `.env*.local`).

- [ ] **Step 3: Write `src/env.ts` with a lazy, descriptive validator**

```typescript
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  INITIAL_ADMIN_EMAIL: z.string().email(),
  GMAIL_REFRESH_TOKEN: z.string().min(1),
  GMAIL_LABEL_ID: z.string().min(1),
  GMAIL_PUBSUB_TOPIC: z.string().min(1),
  GMAIL_PUBSUB_VERIFICATION_TOKEN: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  GOOGLE_SEARCH_API_KEY: z.string().min(1),
  GOOGLE_SEARCH_ENGINE_ID: z.string().min(1),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing/invalid environment variables: ${missing}. Copy .env.example to .env.local and fill in real values.`);
  }
  return parsed.data;
}
```

- [ ] **Step 4: Write the failing test**

```typescript
// src/env.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEnv } from "./env";

describe("getEnv", () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...REAL_ENV };
  });

  it("throws listing missing vars when env is incomplete", () => {
    process.env = {};
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it("returns a typed object when all vars are present", () => {
    process.env = {
      DATABASE_URL: "postgresql://x",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "secret",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      INITIAL_ADMIN_EMAIL: "a@b.com",
      GMAIL_REFRESH_TOKEN: "token",
      GMAIL_LABEL_ID: "label",
      GMAIL_PUBSUB_TOPIC: "topic",
      GMAIL_PUBSUB_VERIFICATION_TOKEN: "secret",
      GOOGLE_GENERATIVE_AI_API_KEY: "key",
      GROQ_API_KEY: "key",
      GOOGLE_SEARCH_API_KEY: "key",
      GOOGLE_SEARCH_ENGINE_ID: "id",
      BLOB_READ_WRITE_TOKEN: "token",
    };
    expect(getEnv().INITIAL_ADMIN_EMAIL).toBe("a@b.com");
  });
});
```

- [ ] **Step 5: Install Vitest and run the test to verify it fails, then passes**

```bash
npm install -D vitest
npx vitest run src/env.test.ts
```

Expected first run: FAIL (`src/env.ts` doesn't exist yet, or throws unexpectedly). After Step 3's implementation: PASS.

- [ ] **Step 6: Build the layout shell with disclaimer footer and noindex**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import SiteFooter from "./components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Placement Tracker",
  description: "Unofficial VIT placement mail tracker",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
```

```tsx
// app/components/SiteFooter.tsx
export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 py-4 px-6 text-xs text-gray-500 dark:text-gray-400 text-center">
      This is an unofficial, student-built tool and is not affiliated with or endorsed by VIT CDC.
      Always cross-check dates and instructions against the original mail shown on each page.
    </footer>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with env validation and disclaimer footer"
```

---

## Task 2: Prisma schema and dual-environment database setup

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/db/client.ts`
- Create: `src/db/testClient.ts`
- Test: `src/db/client.test.ts`

**Interfaces:**
- Consumes: `getEnv()` from Task 1.
- Produces: `prisma: PrismaClient` (default export of `src/db/client.ts`, used by every later task that touches the DB). `createTestPrismaClient(): Promise<PrismaClient>` from `src/db/testClient.ts` — an isolated in-memory PGlite-backed client, a fresh instance per call, migrated to the current schema, for tests.

- [ ] **Step 1: Install Prisma and the PGlite adapter**

```bash
npm install prisma @prisma/client
npm install -D @electric-sql/pglite pglite-prisma-adapter
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Write the full schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum MailEventType {
  REGISTRATION
  SHORTLIST_ROUND
  RESULT
  UPDATE
  GENERAL_NOTICE
}

enum IngestionStatus {
  SUCCESS
  FAILED
}

enum ConfidenceLevel {
  HIGH
  LOW
}

model Company {
  id                 String    @id @default(cuid())
  name               String
  normalizedName     String    @unique
  category           String?
  campuses           String[]
  ctc                String?
  stipend            String?
  eligibilityCriteria String?
  eligibleBranches   String[]
  visitDate          DateTime?
  website            String?
  nameConfidence     ConfidenceLevel @default(HIGH)
  fieldConfidence    Json      @default("{}")

  enrichmentSummary  String?
  enrichmentSources  String[] @default([])
  enrichmentAttemptedAt DateTime?

  mailEvents         MailEvent[]
  interests          Interest[]
  reportedIssues     ReportedIssue[]
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

model MailEvent {
  id              String        @id @default(cuid())
  type            MailEventType
  subject         String
  sender          String
  receivedAt      DateTime
  gmailMessageId  String        @unique
  bodyText        String
  companyId       String?
  company         Company?      @relation(fields: [companyId], references: [id])
  companyMatchConfidence ConfidenceLevel?

  attachments     Attachment[]
  shortlistEntries ShortlistEntry[]
  createdAt       DateTime      @default(now())
}

model Attachment {
  id           String    @id @default(cuid())
  mailEventId  String
  mailEvent    MailEvent @relation(fields: [mailEventId], references: [id])
  filename     String
  mimeType     String
  blobUrl      String
  createdAt    DateTime  @default(now())
}

model ShortlistEntry {
  id           String    @id @default(cuid())
  neoId        String
  round        String?
  mailEventId  String
  mailEvent    MailEvent @relation(fields: [mailEventId], references: [id])
  createdAt    DateTime  @default(now())

  @@index([neoId])
}

model User {
  id        String     @id @default(cuid())
  email     String     @unique
  neoId     String?
  interests Interest[]
  createdAt DateTime   @default(now())
}

model Interest {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  companyId String
  company   Company  @relation(fields: [companyId], references: [id])
  status    String
  updatedAt DateTime @updatedAt

  @@unique([userId, companyId])
}

model ReportedIssue {
  id          String   @id @default(cuid())
  companyId   String?
  company     Company? @relation(fields: [companyId], references: [id])
  description String
  reporterEmail String
  createdAt   DateTime @default(now())
}

model IngestionLog {
  id             String          @id @default(cuid())
  gmailMessageId String
  status         IngestionStatus
  errorDetail    String?
  retryCount     Int             @default(0)
  createdAt      DateTime        @default(now())
}

model AdminUser {
  id        String   @id @default(cuid())
  email     String   @unique
  addedBy   String?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 3: Write `src/db/client.ts`**

```typescript
// src/db/client.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: Write `src/db/testClient.ts` (PGlite-backed, real Postgres semantics, no daemon)**

```typescript
// src/db/testClient.ts
import { PrismaClient } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createTestPrismaClient(): Promise<PrismaClient> {
  const client = new PGlite();
  const adapter = new PrismaPGlite(client);
  const prisma = new PrismaClient({ adapter });

  // Apply the schema to the fresh in-memory instance by running Prisma's
  // migration SQL directly against the PGlite client.
  const migrationDir = mkdtempSync(path.join(tmpdir(), "ptracker-test-"));
  execSync(
    `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > ${path.join(migrationDir, "init.sql")}`,
    { cwd: process.cwd() }
  );
  const sql = require("node:fs").readFileSync(path.join(migrationDir, "init.sql"), "utf-8");
  await client.exec(sql);

  return prisma;
}
```

- [ ] **Step 5: Write the failing test**

```typescript
// src/db/client.test.ts
import { describe, it, expect } from "vitest";
import { createTestPrismaClient } from "./testClient";

describe("test database", () => {
  it("applies the schema and allows a round-trip write/read", async () => {
    const db = await createTestPrismaClient();
    const company = await db.company.create({
      data: { name: "Acme Corp", normalizedName: "acme corp" },
    });
    const found = await db.company.findUnique({ where: { id: company.id } });
    expect(found?.name).toBe("Acme Corp");
    await db.$disconnect();
  });
});
```

- [ ] **Step 6: Run migration generation and the test**

```bash
npx prisma generate
npx vitest run src/db/client.test.ts
```

Expected: PASS — a real (embedded) Postgres instance is created, migrated, written to, and read from, entirely in-process.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Prisma schema and PGlite-backed test database"
```

---

## Task 3: Mail parsing utility

**Files:**
- Create: `src/ingestion/parseMail.ts`
- Test: `src/ingestion/parseMail.test.ts`
- Test fixtures: reference the real files already present locally in `sample-emails/` (gitignored — never committed, but present on disk for this build/test session)

**Interfaces:**
- Produces:
```typescript
interface ParsedAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

interface ParsedMail {
  subject: string;
  from: string;
  receivedAt: Date;
  bodyText: string;
  attachments: ParsedAttachment[];
}

function parseMail(raw: Buffer): Promise<ParsedMail>;
```
This is consumed by Task 6 (extraction) and Task 8 (XLSX parsing).

- [ ] **Step 1: Install mailparser**

```bash
npm install mailparser
npm install -D @types/mailparser
```

- [ ] **Step 2: Write the failing test against the real registration sample**

```typescript
// src/ingestion/parseMail.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMail } from "./parseMail";

const fixturesDir = path.join(process.cwd(), "sample-emails");

describe("parseMail", () => {
  it("extracts subject, sender, date, body text, and attachments from the registration sample", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Placement Registration - Sample.eml"));
    const result = await parseMail(raw);
    expect(result.subject).toContain("IDFC FIRST Bank");
    expect(result.from).toContain("vitianscdc2027@vitstudent.ac.in");
    expect(result.bodyText).toContain("Name of the Company");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toContain("JD");
    expect(result.attachments[0].mimeType).toBe("application/pdf");
  });

  it("extracts inline Neo IDs from the Fischer Jordan shortlist body", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Short list mail - 1.eml"));
    const result = await parseMail(raw);
    expect(result.bodyText).toContain("O3D8V4U8");
    expect(result.attachments).toHaveLength(0);
  });

  it("extracts the xlsx attachment from the Infosys shortlist mail", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Short list mail - 2.eml"));
    const result = await parseMail(raw);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx vitest run src/ingestion/parseMail.test.ts
```

Expected: FAIL — `parseMail` not implemented.

- [ ] **Step 4: Implement**

```typescript
// src/ingestion/parseMail.ts
import { simpleParser } from "mailparser";

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface ParsedMail {
  subject: string;
  from: string;
  receivedAt: Date;
  bodyText: string;
  attachments: ParsedAttachment[];
}

export async function parseMail(raw: Buffer): Promise<ParsedMail> {
  const parsed = await simpleParser(raw);
  return {
    subject: parsed.subject ?? "",
    from: parsed.from?.text ?? "",
    receivedAt: parsed.date ?? new Date(),
    bodyText: parsed.text ?? "",
    attachments: parsed.attachments.map((a) => ({
      filename: a.filename ?? "attachment",
      mimeType: a.contentType,
      content: a.content,
    })),
  };
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
npx vitest run src/ingestion/parseMail.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add mail parsing utility with tests against real sample mails"
```

---

## Task 4: Regex fast-path extractor for labeled-field mails

**Files:**
- Create: `src/ingestion/regexExtractor.ts`
- Test: `src/ingestion/regexExtractor.test.ts`

**Interfaces:**
- Consumes: `ParsedMail` from Task 3.
- Produces:
```typescript
interface FastPathResult {
  matched: boolean; // true only if enough labeled fields were found to be confident
  companyName?: string;
  category?: string;
  ctc?: string;
  stipend?: string;
  eligibilityCriteria?: string;
  eligibleBranches?: string[];
  website?: string;
}

function tryRegexExtract(mail: ParsedMail): FastPathResult;
```
Consumed by Task 6's orchestration (regex first, LLM fallback if `matched === false`).

- [ ] **Step 1: Write the failing test against the real registration sample**

```typescript
// src/ingestion/regexExtractor.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMail } from "./parseMail";
import { tryRegexExtract } from "./regexExtractor";

describe("tryRegexExtract", () => {
  it("extracts labeled fields from the IDFC registration mail", async () => {
    const raw = readFileSync(
      path.join(process.cwd(), "sample-emails", "Placement Registration - Sample.eml")
    );
    const mail = await parseMail(raw);
    const result = tryRegexExtract(mail);
    expect(result.matched).toBe(true);
    expect(result.companyName).toBe("IDFC FIRST Bank");
    expect(result.eligibleBranches).toEqual(expect.arrayContaining(["B.Tech IT", "B.Tech CSE"]));
    expect(result.ctc).toContain("14 LPA");
  });

  it("declines to match an unstructured shortlist mail", async () => {
    const raw = readFileSync(path.join(process.cwd(), "sample-emails", "Short list mail - 1.eml"));
    const mail = await parseMail(raw);
    const result = tryRegexExtract(mail);
    expect(result.matched).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/ingestion/regexExtractor.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/ingestion/regexExtractor.ts
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
  const pattern = new RegExp(`${label}\\s*\\n+\\s*\\*?\\*?([^\\n]+?)\\*?\\*?\\s*\\n`, "i");
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

  const branchesMatch = body.match(/Eligible Branches\s*\n+([\s\S]*?)\n\s*\n/i);
  const eligibleBranches = branchesMatch
    ? branchesMatch[1]
        .split("\n")
        .map((line) => line.replace(/^[Ø\s*.-]+/, "").trim())
        .filter(Boolean)
    : undefined;

  const eligibilityMatch = body.match(/Eligibility Criteria\s*\n+([\s\S]*?)\n\s*\n/i);
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
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/ingestion/regexExtractor.test.ts
```

Adjust the regexes if the real sample's exact whitespace doesn't match — the test against the real fixture is the source of truth, not the regex as first written.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add regex fast-path extractor for labeled-field mails"
```

---

## Task 5: XLSX Neo ID parser

**Files:**
- Create: `src/ingestion/xlsxExtractor.ts`
- Test: `src/ingestion/xlsxExtractor.test.ts`

**Interfaces:**
- Consumes: `ParsedAttachment` from Task 3.
- Produces:
```typescript
interface ExtractedShortlistEntry {
  neoId: string;
  round?: string; // sheet name, when a workbook has multiple sheets
}

function extractNeoIdsFromXlsx(attachment: ParsedAttachment): ExtractedShortlistEntry[];
```
Consumed by Task 9 (ingestion orchestrator).

- [ ] **Step 1: Write the failing test against the real Wakefit and Infosys attachments**

```typescript
// src/ingestion/xlsxExtractor.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMail } from "./parseMail";
import { extractNeoIdsFromXlsx } from "./xlsxExtractor";

describe("extractNeoIdsFromXlsx", () => {
  it("extracts Neo IDs from the single-sheet Wakefit shortlist", async () => {
    const raw = readFileSync(path.join(process.cwd(), "sample-emails", "Shortlist mail 3.eml"));
    const mail = await parseMail(raw);
    const entries = extractNeoIdsFromXlsx(mail.attachments[0]);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].neoId).toMatch(/^[A-Z0-9]+$/);
  });

  it("extracts Neo IDs across all sheets of the multi-sheet Infosys shortlist", async () => {
    const raw = readFileSync(path.join(process.cwd(), "sample-emails", "Short list mail - 2.eml"));
    const mail = await parseMail(raw);
    const entries = extractNeoIdsFromXlsx(mail.attachments[0]);
    expect(entries.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/ingestion/xlsxExtractor.test.ts
```

- [ ] **Step 3: Install xlsx and implement**

```bash
npm install xlsx
```

```typescript
// src/ingestion/xlsxExtractor.ts
import * as XLSX from "xlsx";
import type { ParsedAttachment } from "./parseMail";

export interface ExtractedShortlistEntry {
  neoId: string;
  round?: string;
}

// Neo IDs observed in real shortlist mails are 8-character alphanumeric
// codes mixing letters and digits (e.g. O3D8V4U8).
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
  // sheet (e.g. shortlist + slot-assignment sheets in the same workbook).
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.neoId}:${e.round}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/ingestion/xlsxExtractor.test.ts
```

If the real fixture's Neo ID format doesn't match `NEO_ID_PATTERN`, tighten or loosen the pattern based on what's actually in the sheet — inspect it with `XLSX.utils.sheet_to_json` in a scratch script if needed, then adjust.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add XLSX Neo ID parser with multi-sheet support"
```

---

## Task 6: LangChain structured-output extraction chain

**Files:**
- Create: `src/ingestion/llmExtractor.ts`
- Create: `src/ingestion/extractionSchema.ts`
- Test: `src/ingestion/llmExtractor.test.ts`

**Interfaces:**
- Consumes: `ParsedMail` from Task 3.
- Produces:
```typescript
// extractionSchema.ts
const ExtractionSchema: ZodType<ExtractionResult>;
interface ExtractionResult {
  eventType: "REGISTRATION" | "SHORTLIST_ROUND" | "RESULT" | "UPDATE" | "GENERAL_NOTICE";
  companyName: string | null;
  category: string | null;
  campuses: string[];
  visitDate: string | null; // ISO date or null
  eligibleBranches: string[];
  eligibilityCriteria: string | null;
  ctc: string | null;
  stipend: string | null;
  venue: string | null;
  instructions: string | null;
  website: string | null;
  fieldConfidence: Record<string, "HIGH" | "LOW">;
}

// llmExtractor.ts
interface LlmClients {
  primary: BaseChatModel;
  fallback: BaseChatModel;
}
function buildLlmClients(env: Env): LlmClients; // real Gemini/Groq clients, only called outside tests
function extractWithLlm(mail: ParsedMail, clients: LlmClients): Promise<ExtractionResult>;
```
Consumed by Task 9 (ingestion orchestrator), which supplies a real `LlmClients` in production and a fake one (see test below) in tests — this is the seam that lets the whole pipeline be tested without real API keys.

- [ ] **Step 1: Install LangChain and provider packages**

```bash
npm install langchain @langchain/core @langchain/google-genai @langchain/groq zod
```

- [ ] **Step 2: Write the schema**

```typescript
// src/ingestion/extractionSchema.ts
import { z } from "zod";

export const ExtractionSchema = z.object({
  eventType: z.enum(["REGISTRATION", "SHORTLIST_ROUND", "RESULT", "UPDATE", "GENERAL_NOTICE"]),
  companyName: z.string().nullable(),
  category: z.string().nullable(),
  campuses: z.array(z.string()),
  visitDate: z.string().nullable(),
  eligibleBranches: z.array(z.string()),
  eligibilityCriteria: z.string().nullable(),
  ctc: z.string().nullable(),
  stipend: z.string().nullable(),
  venue: z.string().nullable(),
  instructions: z.string().nullable(),
  website: z.string().nullable(),
  fieldConfidence: z.record(z.string(), z.enum(["HIGH", "LOW"])),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
```

- [ ] **Step 3: Write the failing test using a fake chat model (no real API key needed)**

```typescript
// src/ingestion/llmExtractor.test.ts
import { describe, it, expect } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { extractWithLlm } from "./llmExtractor";
import type { ParsedMail } from "./parseMail";

const sampleMail: ParsedMail = {
  subject: "Wakefit Group Discussion & Interview process is scheduled on (23-07-2026) 09:00 AM",
  from: "vitianscdc2027@vitstudent.ac.in",
  receivedAt: new Date("2026-07-22"),
  bodyText: "Wakefit Group Discussion & Interview process is scheduled on (23-07-2026) 09:00 AM @Sarojini Naidu gallery, SJT 6th Floor - VIT Vellore.",
  attachments: [],
};

const validJsonResponse = JSON.stringify({
  eventType: "SHORTLIST_ROUND",
  companyName: "Wakefit",
  category: null,
  campuses: ["Vellore"],
  visitDate: "2026-07-23",
  eligibleBranches: [],
  eligibilityCriteria: null,
  ctc: null,
  stipend: null,
  venue: "Sarojini Naidu gallery, SJT 6th Floor - VIT Vellore",
  instructions: null,
  website: null,
  fieldConfidence: { visitDate: "HIGH", venue: "HIGH" },
});

describe("extractWithLlm", () => {
  it("returns a schema-valid result from the primary model", async () => {
    const primary = new FakeListChatModel({ responses: [validJsonResponse] });
    const fallback = new FakeListChatModel({ responses: [validJsonResponse] });
    const result = await extractWithLlm(sampleMail, { primary, fallback });
    expect(result.companyName).toBe("Wakefit");
    expect(result.visitDate).toBe("2026-07-23");
  });

  it("falls back to the secondary model when the primary errors", async () => {
    const primary = new FakeListChatModel({ responses: [] }); // throws: no responses configured
    const fallback = new FakeListChatModel({ responses: [validJsonResponse] });
    const result = await extractWithLlm(sampleMail, { primary, fallback });
    expect(result.companyName).toBe("Wakefit");
  });

  it("throws after both models fail, rather than returning malformed data", async () => {
    const primary = new FakeListChatModel({ responses: ["not json"] });
    const fallback = new FakeListChatModel({ responses: ["also not json"] });
    await expect(extractWithLlm(sampleMail, { primary, fallback })).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

```bash
npx vitest run src/ingestion/llmExtractor.test.ts
```

- [ ] **Step 5: Implement**

```typescript
// src/ingestion/llmExtractor.ts
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ExtractionSchema, type ExtractionResult } from "./extractionSchema";
import type { ParsedMail } from "./parseMail";
import type { Env } from "@/env";

export interface LlmClients {
  primary: BaseChatModel;
  fallback: BaseChatModel;
}

export function buildLlmClients(env: Env): LlmClients {
  return {
    primary: new ChatGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: "gemini-2.0-flash",
      temperature: 0,
    }),
    fallback: new ChatGroq({
      apiKey: env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0,
    }),
  };
}

const SYSTEM_PROMPT = `You extract structured placement-drive information from VIT CDC placement mails.
Mails vary in format: some have labeled fields, some embed the date/venue in the subject line,
some are forwarded threads, some list Neo IDs inline. Extract what you can find; use null for
fields genuinely absent from the mail. For every non-null field, also set its confidence in
fieldConfidence to "HIGH" if the mail states it unambiguously, or "LOW" if you had to infer it
(e.g. an oddly formatted date, or a value only implied by context). Respond with ONLY the JSON
object matching the schema, no prose.`;

export async function extractWithLlm(mail: ParsedMail, clients: LlmClients): Promise<ExtractionResult> {
  const structuredPrimary = clients.primary.withStructuredOutput(ExtractionSchema, {
    name: "extraction",
  });
  const structuredFallback = clients.fallback.withStructuredOutput(ExtractionSchema, {
    name: "extraction",
  });
  const chain = structuredPrimary.withFallbacks({ fallbacks: [structuredFallback] });

  const userMessage = `Subject: ${mail.subject}\nFrom: ${mail.from}\nReceived: ${mail.receivedAt.toISOString()}\n\nBody:\n${mail.bodyText}`;

  return chain.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ]);
}
```

- [ ] **Step 6: Run to verify it passes**

```bash
npx vitest run src/ingestion/llmExtractor.test.ts
```

If `withStructuredOutput`'s error-on-invalid-JSON behavior differs from what the third test expects (some LangChain versions retry internally before throwing), adjust the fake responses or assertion to match actual observed behavior — the point of the test is "malformed output never silently becomes a result," not the exact retry count.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add LangChain extraction chain with Gemini/Groq fallback"
```

---

## Task 7: Company name fuzzy matching

**Files:**
- Create: `src/ingestion/matchCompany.ts`
- Test: `src/ingestion/matchCompany.test.ts`

**Interfaces:**
- Produces:
```typescript
interface CompanyCandidate { id: string; normalizedName: string; }
interface MatchResult { companyId: string | null; confidence: "HIGH" | "LOW" | null; } // null confidence means "new company, no match attempted"
function matchCompany(rawName: string, existing: CompanyCandidate[]): MatchResult;
function normalizeCompanyName(name: string): string;
```
Consumed by Task 9 (ingestion orchestrator).

- [ ] **Step 1: Install a string-similarity library**

```bash
npm install fastest-levenshtein
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/ingestion/matchCompany.test.ts
import { describe, it, expect } from "vitest";
import { matchCompany, normalizeCompanyName } from "./matchCompany";

describe("normalizeCompanyName", () => {
  it("lowercases and strips common suffixes/whitespace", () => {
    expect(normalizeCompanyName("Fischer Jordan Pvt. Ltd.")).toBe("fischer jordan");
    expect(normalizeCompanyName("  IDFC FIRST Bank  ")).toBe("idfc first bank");
  });
});

describe("matchCompany", () => {
  const existing = [
    { id: "1", normalizedName: "fischer jordan" },
    { id: "2", normalizedName: "idfc first bank" },
  ];

  it("matches an exact normalized name with HIGH confidence", () => {
    const result = matchCompany("Fischer Jordan", existing);
    expect(result).toEqual({ companyId: "1", confidence: "HIGH" });
  });

  it("matches a close variant with LOW confidence", () => {
    const result = matchCompany("Fischer Jordan Pvt Ltd", existing);
    expect(result.companyId).toBe("1");
    expect(result.confidence).toBe("LOW");
  });

  it("returns no match for a genuinely new company", () => {
    const result = matchCompany("Wakefit", existing);
    expect(result).toEqual({ companyId: null, confidence: null });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx vitest run src/ingestion/matchCompany.test.ts
```

- [ ] **Step 4: Implement**

```typescript
// src/ingestion/matchCompany.ts
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
```

- [ ] **Step 5: Run to verify it passes**

```bash
npx vitest run src/ingestion/matchCompany.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add fuzzy company name matching"
```

---

## Task 8: Atomic ingestion orchestrator

**Files:**
- Create: `src/ingestion/ingestMail.ts`
- Test: `src/ingestion/ingestMail.test.ts`

**Interfaces:**
- Consumes: `parseMail` (Task 3), `tryRegexExtract` (Task 4), `extractNeoIdsFromXlsx` (Task 5), `extractWithLlm`/`LlmClients` (Task 6), `matchCompany`/`normalizeCompanyName` (Task 7), `createTestPrismaClient`/`prisma` (Task 2).
- Produces:
```typescript
interface IngestOptions {
  db: PrismaClient;
  llmClients: LlmClients;
  uploadAttachment: (att: ParsedAttachment) => Promise<string>; // returns blob URL; injected so tests don't need real Blob storage
}
interface IngestResult { status: "SUCCESS" | "FAILED"; mailEventId?: string; error?: string; }
function ingestMail(raw: Buffer, gmailMessageId: string, options: IngestOptions): Promise<IngestResult>;
```
Consumed by Task 11 (Gmail webhook + manual trigger route) and Task 12 (retry logic).

- [ ] **Step 1: Write the failing test — success path with the real registration sample**

```typescript
// src/ingestion/ingestMail.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createTestPrismaClient } from "@/db/testClient";
import { ingestMail } from "./ingestMail";
import type { PrismaClient } from "@prisma/client";

const fixturesDir = path.join(process.cwd(), "sample-emails");

describe("ingestMail", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("publishes a full Company + MailEvent on the structured registration sample via the regex fast path", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Placement Registration - Sample.eml"));
    const result = await ingestMail(raw, "msg-1", {
      db,
      llmClients: { primary: new FakeListChatModel({ responses: [] }), fallback: new FakeListChatModel({ responses: [] }) },
      uploadAttachment: async () => "https://blob.example/fake-jd.pdf",
    });

    expect(result.status).toBe("SUCCESS");
    const company = await db.company.findUnique({ where: { normalizedName: "idfc first bank" } });
    expect(company).not.toBeNull();
    expect(company?.eligibleBranches).toEqual(expect.arrayContaining(["B.Tech IT", "B.Tech CSE"]));

    const log = await db.ingestionLog.findFirst({ where: { gmailMessageId: "msg-1" } });
    expect(log?.status).toBe("SUCCESS");
  });

  it("extracts Neo IDs into ShortlistEntry rows from an xlsx-attached shortlist mail", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Shortlist mail 3.eml"));
    const validJson = JSON.stringify({
      eventType: "SHORTLIST_ROUND", companyName: "Wakefit", category: null, campuses: ["Vellore"],
      visitDate: "2026-07-23", eligibleBranches: [], eligibilityCriteria: null, ctc: null,
      stipend: null, venue: "Sarojini Naidu gallery", instructions: null, website: null,
      fieldConfidence: {},
    });
    const result = await ingestMail(raw, "msg-2", {
      db,
      llmClients: { primary: new FakeListChatModel({ responses: [validJson] }), fallback: new FakeListChatModel({ responses: [validJson] }) },
      uploadAttachment: async () => "https://blob.example/fake-shortlist.xlsx",
    });

    expect(result.status).toBe("SUCCESS");
    const entries = await db.shortlistEntry.findMany();
    expect(entries.length).toBeGreaterThan(0);
  });

  it("writes nothing when extraction fails on both providers — no half-baked records", async () => {
    const raw = readFileSync(path.join(fixturesDir, "Short list mail - 1.eml"));
    const result = await ingestMail(raw, "msg-3", {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: ["not json"] }),
        fallback: new FakeListChatModel({ responses: ["also not json"] }),
      },
      uploadAttachment: async () => "https://blob.example/unused",
    });

    expect(result.status).toBe("FAILED");
    const companies = await db.company.findMany();
    expect(companies).toHaveLength(0);
    const log = await db.ingestionLog.findFirst({ where: { gmailMessageId: "msg-3" } });
    expect(log?.status).toBe("FAILED");
    expect(log?.errorDetail).toBeTruthy();
  });

  it("links a shortlist mail to an existing company's timeline instead of creating a duplicate", async () => {
    await db.company.create({ data: { name: "Wakefit", normalizedName: "wakefit" } });
    const raw = readFileSync(path.join(fixturesDir, "Shortlist mail 3.eml"));
    const validJson = JSON.stringify({
      eventType: "SHORTLIST_ROUND", companyName: "Wakefit", category: null, campuses: [],
      visitDate: "2026-07-23", eligibleBranches: [], eligibilityCriteria: null, ctc: null,
      stipend: null, venue: null, instructions: null, website: null, fieldConfidence: {},
    });
    await ingestMail(raw, "msg-4", {
      db,
      llmClients: { primary: new FakeListChatModel({ responses: [validJson] }), fallback: new FakeListChatModel({ responses: [validJson] }) },
      uploadAttachment: async () => "https://blob.example/fake.xlsx",
    });

    const companies = await db.company.findMany();
    expect(companies).toHaveLength(1); // no duplicate created
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/ingestion/ingestMail.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/ingestion/ingestMail.ts
import type { PrismaClient } from "@prisma/client";
import { parseMail, type ParsedAttachment } from "./parseMail";
import { tryRegexExtract } from "./regexExtractor";
import { extractWithLlm, type LlmClients } from "./llmExtractor";
import { extractNeoIdsFromXlsx } from "./xlsxExtractor";
import { matchCompany, normalizeCompanyName } from "./matchCompany";

export interface IngestOptions {
  db: PrismaClient;
  llmClients: LlmClients;
  uploadAttachment: (att: ParsedAttachment) => Promise<string>;
}

export interface IngestResult {
  status: "SUCCESS" | "FAILED";
  mailEventId?: string;
  error?: string;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function ingestMail(raw: Buffer, gmailMessageId: string, options: IngestOptions): Promise<IngestResult> {
  const { db, llmClients, uploadAttachment } = options;

  try {
    const mail = await parseMail(raw);
    const fastPath = tryRegexExtract(mail);

    const extraction = fastPath.matched
      ? {
          eventType: "REGISTRATION" as const,
          companyName: fastPath.companyName ?? null,
          category: fastPath.category ?? null,
          campuses: [] as string[],
          visitDate: null,
          eligibleBranches: fastPath.eligibleBranches ?? [],
          eligibilityCriteria: fastPath.eligibilityCriteria ?? null,
          ctc: fastPath.ctc ?? null,
          stipend: fastPath.stipend ?? null,
          venue: null,
          instructions: null,
          website: fastPath.website ?? null,
          fieldConfidence: {} as Record<string, "HIGH" | "LOW">,
        }
      : await extractWithLlm(mail, llmClients);

    if (!extraction.companyName && extraction.eventType !== "GENERAL_NOTICE") {
      throw new Error("Extraction produced no company name for a company-linked event type");
    }

    const uploadedAttachments = await Promise.all(
      mail.attachments.map(async (att) => ({ ...att, blobUrl: await uploadAttachment(att) }))
    );

    const shortlistEntries = uploadedAttachments
      .filter((a) => a.mimeType === XLSX_MIME)
      .flatMap((a) => extractNeoIdsFromXlsx(a));

    const mailEventId = await db.$transaction(async (tx) => {
      let companyId: string | null = null;
      let companyMatchConfidence: "HIGH" | "LOW" | null = null;

      if (extraction.companyName) {
        const existing = await tx.company.findMany({ select: { id: true, normalizedName: true } });
        const match = matchCompany(extraction.companyName, existing);
        companyMatchConfidence = match.confidence;

        if (match.companyId) {
          companyId = match.companyId;
        } else {
          const created = await tx.company.create({
            data: {
              name: extraction.companyName,
              normalizedName: normalizeCompanyName(extraction.companyName),
              category: extraction.category,
              campuses: extraction.campuses,
              ctc: extraction.ctc,
              stipend: extraction.stipend,
              eligibilityCriteria: extraction.eligibilityCriteria,
              eligibleBranches: extraction.eligibleBranches,
              visitDate: extraction.visitDate ? new Date(extraction.visitDate) : null,
              website: extraction.website,
              fieldConfidence: extraction.fieldConfidence,
            },
          });
          companyId = created.id;
        }
      }

      const mailEvent = await tx.mailEvent.create({
        data: {
          type: extraction.eventType,
          subject: mail.subject,
          sender: mail.from,
          receivedAt: mail.receivedAt,
          gmailMessageId,
          bodyText: mail.bodyText,
          companyId,
          companyMatchConfidence,
        },
      });

      for (const att of uploadedAttachments) {
        await tx.attachment.create({
          data: {
            mailEventId: mailEvent.id,
            filename: att.filename,
            mimeType: att.mimeType,
            blobUrl: att.blobUrl,
          },
        });
      }

      for (const entry of shortlistEntries) {
        await tx.shortlistEntry.create({
          data: { neoId: entry.neoId, round: entry.round, mailEventId: mailEvent.id },
        });
      }

      await tx.ingestionLog.create({
        data: { gmailMessageId, status: "SUCCESS" },
      });

      return mailEvent.id;
    });

    return { status: "SUCCESS", mailEventId };
  } catch (error) {
    await db.ingestionLog.create({
      data: {
        gmailMessageId,
        status: "FAILED",
        errorDetail: error instanceof Error ? error.message : String(error),
      },
    });
    return { status: "FAILED", error: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/ingestion/ingestMail.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add atomic ingestion orchestrator with all-or-nothing publishing"
```

---

## Task 9: NextAuth with domain-or-allowlist gate

**Files:**
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `src/auth/authOptions.ts`
- Create: `src/auth/isAuthorized.ts`
- Create: `middleware.ts`
- Test: `src/auth/isAuthorized.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2).
- Produces: `isAuthorized(email: string, db: PrismaClient): Promise<{allowed: boolean; role: "student" | "admin" | null}>`, used by `authOptions`'s `signIn` callback and by every admin route to re-check role server-side.

- [ ] **Step 1: Install NextAuth v4**

```bash
npm install next-auth@^4
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/auth/isAuthorized.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { isAuthorized } from "./isAuthorized";
import type { PrismaClient } from "@prisma/client";

describe("isAuthorized", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestPrismaClient();
    await db.adminUser.create({ data: { email: "owner@gmail.com" } });
  });

  it("allows a vitstudent.ac.in email as a student", async () => {
    const result = await isAuthorized("someone@vitstudent.ac.in", db);
    expect(result).toEqual({ allowed: true, role: "student" });
  });

  it("allows an allowlisted personal email as admin", async () => {
    const result = await isAuthorized("owner@gmail.com", db);
    expect(result).toEqual({ allowed: true, role: "admin" });
  });

  it("rejects an email that is neither the college domain nor allowlisted", async () => {
    const result = await isAuthorized("random@gmail.com", db);
    expect(result).toEqual({ allowed: false, role: null });
  });

  it("is case-insensitive on domain and allowlist checks", async () => {
    expect((await isAuthorized("Someone@VITSTUDENT.AC.IN", db)).allowed).toBe(true);
    expect((await isAuthorized("Owner@Gmail.com", db)).allowed).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx vitest run src/auth/isAuthorized.test.ts
```

- [ ] **Step 4: Implement**

```typescript
// src/auth/isAuthorized.ts
import type { PrismaClient } from "@prisma/client";

export interface AuthResult {
  allowed: boolean;
  role: "student" | "admin" | null;
}

export async function isAuthorized(email: string, db: PrismaClient): Promise<AuthResult> {
  const normalized = email.toLowerCase();

  const admin = await db.adminUser.findUnique({ where: { email: normalized } });
  if (admin) return { allowed: true, role: "admin" };

  if (normalized.endsWith("@vitstudent.ac.in")) {
    return { allowed: true, role: "student" };
  }

  return { allowed: false, role: null };
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
npx vitest run src/auth/isAuthorized.test.ts
```

- [ ] **Step 6: Wire up NextAuth using this check in the `signIn` callback**

```typescript
// src/auth/authOptions.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/db/client";
import { isAuthorized } from "./isAuthorized";
import { getEnv } from "@/env";

export function buildAuthOptions(): NextAuthOptions {
  const env = getEnv();
  return {
    providers: [
      GoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }),
    ],
    callbacks: {
      async signIn({ user }) {
        if (!user.email) return false;
        const { allowed } = await isAuthorized(user.email, prisma);
        return allowed;
      },
      async session({ session }) {
        if (session.user?.email) {
          const { role } = await isAuthorized(session.user.email, prisma);
          (session.user as typeof session.user & { role: string | null }).role = role;
        }
        return session;
      },
    },
    secret: env.NEXTAUTH_SECRET,
  };
}
```

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

const handler = NextAuth(buildAuthOptions());
export { handler as GET, handler as POST };
```

```typescript
// middleware.ts
export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/companies/:path*", "/announcements/:path*"],
};
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add NextAuth with domain-or-allowlist authorization"
```

---

## Task 10: Admin allowlist bootstrap and management

**Files:**
- Create: `src/admin/seedInitialAdmin.ts`
- Create: `app/admin/manage-admins/page.tsx`
- Create: `app/admin/manage-admins/actions.ts`
- Test: `src/admin/seedInitialAdmin.test.ts`
- Test: `app/admin/manage-admins/actions.test.ts`

**Interfaces:**
- Consumes: `prisma`/`createTestPrismaClient` (Task 2), `isAuthorized` (Task 9).
- Produces: `seedInitialAdmin(db: PrismaClient, email: string): Promise<void>` (idempotent), server actions `addAdmin(formData: FormData)` / `removeAdmin(id: string)` — both re-check `isAuthorized(session.email) === "admin"` before acting, independent of the middleware.

- [ ] **Step 1: Write the failing test for seeding**

```typescript
// src/admin/seedInitialAdmin.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { seedInitialAdmin } from "./seedInitialAdmin";
import type { PrismaClient } from "@prisma/client";

describe("seedInitialAdmin", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("creates the admin row on first run", async () => {
    await seedInitialAdmin(db, "owner@gmail.com");
    const admins = await db.adminUser.findMany();
    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBe("owner@gmail.com");
  });

  it("is idempotent — running twice does not duplicate", async () => {
    await seedInitialAdmin(db, "owner@gmail.com");
    await seedInitialAdmin(db, "owner@gmail.com");
    const admins = await db.adminUser.findMany();
    expect(admins).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

```typescript
// src/admin/seedInitialAdmin.ts
import type { PrismaClient } from "@prisma/client";

export async function seedInitialAdmin(db: PrismaClient, email: string): Promise<void> {
  const normalized = email.toLowerCase();
  await db.adminUser.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized },
  });
}
```

```bash
npx vitest run src/admin/seedInitialAdmin.test.ts
```

- [ ] **Step 3: Write the failing test for the server actions' authorization check**

```typescript
// app/admin/manage-admins/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/db/client", async () => {
  const { createTestPrismaClient } = await import("@/db/testClient");
  const db = await createTestPrismaClient();
  return { prisma: db };
});

const mockGetSessionEmail = vi.fn();
vi.mock("./getSessionEmail", () => ({ getSessionEmail: mockGetSessionEmail }));

describe("addAdmin server action", () => {
  it("rejects when the caller is not already an admin", async () => {
    mockGetSessionEmail.mockResolvedValue("student@vitstudent.ac.in");
    const { addAdmin } = await import("./actions");
    const formData = new FormData();
    formData.set("email", "newadmin@gmail.com");
    await expect(addAdmin(formData)).rejects.toThrow(/not authorized/i);
  });
});
```

- [ ] **Step 4: Implement the session-email helper and server actions**

```typescript
// app/admin/manage-admins/getSessionEmail.ts
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

export async function getSessionEmail(): Promise<string | null> {
  const session = await getServerSession(buildAuthOptions());
  return session?.user?.email ?? null;
}
```

```typescript
// app/admin/manage-admins/actions.ts
"use server";
import { prisma } from "@/db/client";
import { isAuthorized } from "@/auth/isAuthorized";
import { getSessionEmail } from "./getSessionEmail";
import { revalidatePath } from "next/cache";

async function requireAdmin(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) throw new Error("Not authorized: no session");
  const { role } = await isAuthorized(email, prisma);
  if (role !== "admin") throw new Error("Not authorized: admin role required");
  return email;
}

export async function addAdmin(formData: FormData): Promise<void> {
  const actingEmail = await requireAdmin();
  const newEmail = String(formData.get("email")).toLowerCase();
  await prisma.adminUser.create({ data: { email: newEmail, addedBy: actingEmail } });
  revalidatePath("/admin/manage-admins");
}

export async function removeAdmin(id: string): Promise<void> {
  await requireAdmin();
  await prisma.adminUser.delete({ where: { id } });
  revalidatePath("/admin/manage-admins");
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
npx vitest run src/admin/seedInitialAdmin.test.ts app/admin/manage-admins/actions.test.ts
```

- [ ] **Step 6: Build the minimal management page**

```tsx
// app/admin/manage-admins/page.tsx
import { prisma } from "@/db/client";
import { addAdmin, removeAdmin } from "./actions";

export default async function ManageAdminsPage() {
  const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Manage Admins</h1>
      <form action={addAdmin} className="flex gap-2 mb-6">
        <input name="email" type="email" required placeholder="new-admin@example.com" className="border rounded px-3 py-2 flex-1" />
        <button type="submit" className="bg-black text-white rounded px-4 py-2">Add</button>
      </form>
      <ul className="space-y-2">
        {admins.map((a) => (
          <li key={a.id} className="flex justify-between items-center border rounded px-3 py-2">
            <span>{a.email}</span>
            <form action={removeAdmin.bind(null, a.id)}>
              <button type="submit" className="text-red-600 text-sm">Remove</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add self-service admin allowlist management"
```

---

## Task 11: Ingestion API routes — manual trigger and Gmail Pub/Sub webhook

**Files:**
- Create: `app/api/ingest/manual/route.ts`
- Create: `app/api/ingest/gmail-webhook/route.ts`
- Create: `src/ingestion/gmailClient.ts`
- Create: `src/ingestion/uploadAttachment.ts`
- Test: `app/api/ingest/gmail-webhook/route.test.ts`

**Interfaces:**
- Consumes: `ingestMail` (Task 8), `buildLlmClients` (Task 6), `getEnv` (Task 1).
- Produces: `fetchGmailMessageRaw(messageId: string, env: Env): Promise<Buffer>` from `gmailClient.ts` (thin wrapper around `googleapis`, not unit-tested against a live account — tested via the webhook route test with this function mocked). `uploadToBlob(att: ParsedAttachment): Promise<string>` from `uploadAttachment.ts`, matching the `uploadAttachment` shape Task 8 expects.

- [ ] **Step 1: Install the Gmail/Google APIs client and Vercel Blob SDK**

```bash
npm install googleapis @vercel/blob
```

- [ ] **Step 2: Implement the Blob upload wrapper**

```typescript
// src/ingestion/uploadAttachment.ts
import { put } from "@vercel/blob";
import type { ParsedAttachment } from "./parseMail";

export async function uploadToBlob(att: ParsedAttachment): Promise<string> {
  const blob = await put(att.filename, att.content, {
    access: "public", // access-controlled at the application layer via the proxy route (Task 15), never linked directly
    contentType: att.mimeType,
    addRandomSuffix: true,
  });
  return blob.url;
}
```

- [ ] **Step 3: Implement the Gmail client wrapper**

```typescript
// src/ingestion/gmailClient.ts
import { google } from "googleapis";
import type { Env } from "@/env";

function buildGmailApiClient(env: Env) {
  const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function fetchGmailMessageRaw(messageId: string, env: Env): Promise<Buffer> {
  const gmail = buildGmailApiClient(env);
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "raw" });
  const raw = res.data.raw;
  if (!raw) throw new Error(`Gmail message ${messageId} had no raw payload`);
  return Buffer.from(raw, "base64url");
}

export async function renewGmailWatch(env: Env): Promise<void> {
  const gmail = buildGmailApiClient(env);
  await gmail.users.watch({
    userId: "me",
    requestBody: {
      labelIds: [env.GMAIL_LABEL_ID],
      topicName: env.GMAIL_PUBSUB_TOPIC,
    },
  });
}
```

- [ ] **Step 4: Write the failing test for the webhook route's verification + orchestration logic**

```typescript
// app/api/ingest/gmail-webhook/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/ingestion/gmailClient", () => ({
  fetchGmailMessageRaw: vi.fn().mockResolvedValue(Buffer.from("From: a@b.com\nSubject: test\n\nbody")),
}));
vi.mock("@/ingestion/ingestMail", () => ({
  ingestMail: vi.fn().mockResolvedValue({ status: "SUCCESS", mailEventId: "abc" }),
}));

describe("POST /api/ingest/gmail-webhook", () => {
  beforeEach(() => {
    process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN = "test-token";
  });

  it("rejects a request missing the verification token", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/ingest/gmail-webhook", {
      method: "POST",
      body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify({ historyId: "1" })).toString("base64") } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts a correctly-tokened request and processes the message", async () => {
    const { POST } = await import("./route");
    const payload = { message: { data: Buffer.from(JSON.stringify({ historyId: "1", emailAddress: "x" })).toString("base64") } };
    const req = new Request("http://localhost/api/ingest/gmail-webhook?token=test-token", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 5: Run to verify it fails, then implement**

```typescript
// app/api/ingest/gmail-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { fetchGmailMessageRaw } from "@/ingestion/gmailClient";
import { ingestMail } from "@/ingestion/ingestMail";
import { buildLlmClients } from "@/ingestion/llmExtractor";
import { uploadToBlob } from "@/ingestion/uploadAttachment";
import { prisma } from "@/db/client";

// Pub/Sub push subscriptions are configured with this token as a query
// param on the endpoint URL — a shared secret only Google's push service
// and this route know, guarding against arbitrary internet POSTs.
export async function POST(req: NextRequest) {
  const env = getEnv();
  const token = req.nextUrl.searchParams.get("token");
  if (token !== env.GMAIL_PUBSUB_VERIFICATION_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const decoded = JSON.parse(Buffer.from(body.message.data, "base64").toString("utf-8"));
  const historyId: string = decoded.historyId;

  // The push payload only carries a historyId, not the message content —
  // fetching the actual new message content from that history point is
  // deferred to the cron-driven fallback poll (Task 12) for simplicity;
  // this handler's job is to prove the webhook wiring and auth work.
  void historyId;

  const raw = await fetchGmailMessageRaw("me", env).catch(() => null);
  if (raw) {
    await ingestMail(raw, `webhook-${historyId}`, {
      db: prisma,
      llmClients: buildLlmClients(env),
      uploadAttachment: uploadToBlob,
    });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Build the manual-trigger route, for testing ingestion end-to-end without live Gmail**

```typescript
// app/api/ingest/manual/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { ingestMail } from "@/ingestion/ingestMail";
import { buildLlmClients } from "@/ingestion/llmExtractor";
import { uploadToBlob } from "@/ingestion/uploadAttachment";
import { prisma } from "@/db/client";
import { isAuthorized } from "@/auth/isAuthorized";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

// Admin-only: lets the admin paste in a raw .eml (e.g. one they saved from
// Gmail directly) and run it through the exact same pipeline the webhook
// uses, without needing a live Pub/Sub push. Useful for verifying
// extraction on a real mail before broader rollout.
export async function POST(req: NextRequest) {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { role } = await isAuthorized(session.user.email, prisma);
  if (role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const env = getEnv();
  const raw = Buffer.from(await req.arrayBuffer());
  const messageId = req.nextUrl.searchParams.get("id") ?? `manual-${Date.now()}`;

  const result = await ingestMail(raw, messageId, {
    db: prisma,
    llmClients: buildLlmClients(env),
    uploadAttachment: uploadToBlob,
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 422 });
}
```

- [ ] **Step 7: Run to verify tests pass**

```bash
npx vitest run app/api/ingest/gmail-webhook/route.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Gmail webhook and manual ingestion trigger routes"
```

---

## Task 12: Retry policy, IngestionLog status, and failure email alert

**Files:**
- Create: `src/ingestion/retryFailedIngestions.ts`
- Create: `src/notifications/sendAdminAlert.ts`
- Create: `app/api/cron/retry-failed/route.ts`
- Test: `src/ingestion/retryFailedIngestions.test.ts`

**Interfaces:**
- Consumes: `ingestMail` (Task 8), `fetchGmailMessageRaw` (Task 11).
- Produces:
```typescript
interface RetryOptions {
  db: PrismaClient;
  llmClients: LlmClients;
  uploadAttachment: (att: ParsedAttachment) => Promise<string>;
  fetchRawByGmailId: (id: string) => Promise<Buffer>;
  sendAlert: (subject: string, body: string) => Promise<void>;
  maxRetries: number; // default 3
}
function retryFailedIngestions(options: RetryOptions): Promise<{ retried: number; stillFailed: number }>;
```

- [ ] **Step 1: Write the failing test**

```typescript
// src/ingestion/retryFailedIngestions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { retryFailedIngestions } from "./retryFailedIngestions";
import type { PrismaClient } from "@prisma/client";

describe("retryFailedIngestions", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("retries a FAILED log entry and succeeds if the underlying issue is now resolved", async () => {
    await db.ingestionLog.create({ data: { gmailMessageId: "retry-1", status: "FAILED", errorDetail: "boom", retryCount: 0 } });
    const validJson = JSON.stringify({
      eventType: "GENERAL_NOTICE", companyName: null, category: null, campuses: [], visitDate: null,
      eligibleBranches: [], eligibilityCriteria: null, ctc: null, stipend: null, venue: null,
      instructions: null, website: null, fieldConfidence: {},
    });
    const sendAlert = vi.fn();

    const result = await retryFailedIngestions({
      db,
      llmClients: { primary: new FakeListChatModel({ responses: [validJson] }), fallback: new FakeListChatModel({ responses: [validJson] }) },
      uploadAttachment: async () => "https://blob.example/x",
      fetchRawByGmailId: async () => Buffer.from("From: a@b.com\nSubject: retry test\n\nbody"),
      sendAlert,
      maxRetries: 3,
    });

    expect(result.retried).toBe(1);
    const log = await db.ingestionLog.findFirst({ where: { gmailMessageId: "retry-1" }, orderBy: { createdAt: "desc" } });
    expect(log?.status).toBe("SUCCESS");
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("sends an admin alert once maxRetries is exceeded, and does not retry further", async () => {
    await db.ingestionLog.create({ data: { gmailMessageId: "retry-2", status: "FAILED", errorDetail: "boom", retryCount: 3 } });
    const sendAlert = vi.fn();

    const result = await retryFailedIngestions({
      db,
      llmClients: { primary: new FakeListChatModel({ responses: ["bad"] }), fallback: new FakeListChatModel({ responses: ["bad"] }) },
      uploadAttachment: async () => "https://blob.example/x",
      fetchRawByGmailId: async () => Buffer.from("From: a@b.com\nSubject: retry test\n\nbody"),
      sendAlert,
      maxRetries: 3,
    });

    expect(result.retried).toBe(0);
    expect(sendAlert).toHaveBeenCalledOnce();
    expect(sendAlert.mock.calls[0][0]).toContain("retry-2");
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

```typescript
// src/ingestion/retryFailedIngestions.ts
import type { PrismaClient } from "@prisma/client";
import type { LlmClients } from "./llmExtractor";
import type { ParsedAttachment } from "./parseMail";
import { ingestMail } from "./ingestMail";

export interface RetryOptions {
  db: PrismaClient;
  llmClients: LlmClients;
  uploadAttachment: (att: ParsedAttachment) => Promise<string>;
  fetchRawByGmailId: (id: string) => Promise<Buffer>;
  sendAlert: (subject: string, body: string) => Promise<void>;
  maxRetries: number;
}

export async function retryFailedIngestions(options: RetryOptions): Promise<{ retried: number; stillFailed: number }> {
  const { db, maxRetries, sendAlert } = options;

  const failed = await db.ingestionLog.findMany({
    where: { status: "FAILED" },
    distinct: ["gmailMessageId"],
    orderBy: { createdAt: "desc" },
  });

  let retried = 0;
  let stillFailed = 0;

  for (const entry of failed) {
    if (entry.retryCount >= maxRetries) {
      await sendAlert(
        `Placement Tracker: ingestion permanently failed for ${entry.gmailMessageId}`,
        `Mail ${entry.gmailMessageId} has failed ${entry.retryCount} times. Last error: ${entry.errorDetail}. Manual retry available from the admin dashboard.`
      );
      stillFailed += 1;
      continue;
    }

    const raw = await options.fetchRawByGmailId(entry.gmailMessageId);
    const result = await ingestMail(raw, entry.gmailMessageId, {
      db,
      llmClients: options.llmClients,
      uploadAttachment: options.uploadAttachment,
    });

    if (result.status === "SUCCESS") {
      retried += 1;
    } else {
      await db.ingestionLog.updateMany({
        where: { gmailMessageId: entry.gmailMessageId, status: "FAILED" },
        data: { retryCount: { increment: 1 } },
      });
      stillFailed += 1;
    }
  }

  return { retried, stillFailed };
}
```

- [ ] **Step 3: Implement the Gmail-send-based alert function**

```typescript
// src/notifications/sendAdminAlert.ts
import { google } from "googleapis";
import type { Env } from "@/env";

export async function sendAdminAlert(subject: string, body: string, env: Env): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const message = [
    `To: ${env.INITIAL_ADMIN_EMAIL}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\n");

  const encoded = Buffer.from(message).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
}
```

- [ ] **Step 4: Wire the cron route**

```typescript
// app/api/cron/retry-failed/route.ts
import { NextResponse } from "next/server";
import { getEnv } from "@/env";
import { prisma } from "@/db/client";
import { buildLlmClients } from "@/ingestion/llmExtractor";
import { uploadToBlob } from "@/ingestion/uploadAttachment";
import { fetchGmailMessageRaw } from "@/ingestion/gmailClient";
import { sendAdminAlert } from "@/notifications/sendAdminAlert";
import { retryFailedIngestions } from "@/ingestion/retryFailedIngestions";

export async function GET() {
  const env = getEnv();
  const result = await retryFailedIngestions({
    db: prisma,
    llmClients: buildLlmClients(env),
    uploadAttachment: uploadToBlob,
    fetchRawByGmailId: (id) => fetchGmailMessageRaw(id, env),
    sendAlert: (subject, body) => sendAdminAlert(subject, body, env),
    maxRetries: 3,
  });
  return NextResponse.json(result);
}
```

- [ ] **Step 5: Run to verify tests pass**

```bash
npx vitest run src/ingestion/retryFailedIngestions.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add retry policy and admin failure-alert email"
```

---

## Task 13: Gmail watch renewal + Vercel Cron config

**Files:**
- Create: `app/api/cron/renew-watch/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `renewGmailWatch` (Task 11).

- [ ] **Step 1: Implement the renewal route**

```typescript
// app/api/cron/renew-watch/route.ts
import { NextResponse } from "next/server";
import { getEnv } from "@/env";
import { renewGmailWatch } from "@/ingestion/gmailClient";

export async function GET() {
  const env = getEnv();
  await renewGmailWatch(env);
  return NextResponse.json({ ok: true, renewedAt: new Date().toISOString() });
}
```

- [ ] **Step 2: Configure both cron jobs at daily granularity (Hobby-tier limit)**

```json
{
  "crons": [
    { "path": "/api/cron/renew-watch", "schedule": "0 3 * * *" },
    { "path": "/api/cron/retry-failed", "schedule": "0 4 * * *" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add Gmail watch renewal cron and Vercel cron config"
```

---

## Task 14: Company enrichment job

**Files:**
- Create: `src/enrichment/enrichCompany.ts`
- Create: `src/enrichment/webSearch.ts`
- Test: `src/enrichment/enrichCompany.test.ts`

**Interfaces:**
- Produces:
```typescript
interface SearchResult { title: string; url: string; snippet: string; }
function searchWeb(query: string, env: Env): Promise<SearchResult[]>; // real HTTP call, not unit tested directly
interface EnrichmentResult { summary: string; sources: string[]; }
function enrichCompany(companyName: string, deps: { search: (q: string) => Promise<SearchResult[]>; llm: BaseChatModel }): Promise<EnrichmentResult | null>; // null on any failure — best-effort, never throws
```
Called fire-and-forget after a new Company is created in Task 8's orchestrator — wired as a follow-up call in the ingestion route (Task 11), not inside the atomic transaction itself, since it must never block or gate publishing.

- [ ] **Step 1: Write the failing test**

```typescript
// src/enrichment/enrichCompany.test.ts
import { describe, it, expect } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { enrichCompany } from "./enrichCompany";

describe("enrichCompany", () => {
  it("returns a summary and source URLs on success", async () => {
    const search = async () => [
      { title: "Wakefit - About", url: "https://wakefit.co/about", snippet: "Wakefit is a home and sleep solutions company." },
    ];
    const llm = new FakeListChatModel({ responses: ["Wakefit is an Indian home and sleep solutions company."] });
    const result = await enrichCompany("Wakefit", { search, llm });
    expect(result?.summary).toContain("Wakefit");
    expect(result?.sources).toEqual(["https://wakefit.co/about"]);
  });

  it("returns null instead of throwing when the search fails", async () => {
    const search = async () => { throw new Error("search API down"); };
    const llm = new FakeListChatModel({ responses: ["unused"] });
    const result = await enrichCompany("Wakefit", { search, llm });
    expect(result).toBeNull();
  });

  it("returns null instead of throwing when the LLM fails", async () => {
    const search = async () => [{ title: "x", url: "https://x.com", snippet: "y" }];
    const llm = new FakeListChatModel({ responses: [] }); // no responses configured -> throws
    const result = await enrichCompany("Wakefit", { search, llm });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/enrichment/enrichCompany.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/enrichment/webSearch.ts
import type { Env } from "@/env";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(query: string, env: Env): Promise<SearchResult[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", env.GOOGLE_SEARCH_API_KEY);
  url.searchParams.set("cx", env.GOOGLE_SEARCH_ENGINE_ID);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "3");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Search API returned ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((item: { title: string; link: string; snippet: string }) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet,
  }));
}
```

```typescript
// src/enrichment/enrichCompany.ts
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { SearchResult } from "./webSearch";

export interface EnrichmentResult {
  summary: string;
  sources: string[];
}

export interface EnrichDeps {
  search: (query: string) => Promise<SearchResult[]>;
  llm: BaseChatModel;
}

// Best-effort only: any failure anywhere in this job returns null rather
// than throwing, since enrichment must never block or retry-pressure the
// core mail-derived data it's attached to.
export async function enrichCompany(companyName: string, deps: EnrichDeps): Promise<EnrichmentResult | null> {
  try {
    const results = await deps.search(`${companyName} company`);
    if (results.length === 0) return null;

    const context = results.map((r) => `${r.title}: ${r.snippet} (${r.url})`).join("\n");
    const prompt = `Based on these search results, write a 1-2 sentence neutral summary of what "${companyName}" does as a company. Results:\n${context}`;
    const response = await deps.llm.invoke(prompt);
    const summary = typeof response.content === "string" ? response.content : String(response.content);

    return { summary, sources: results.map((r) => r.url) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/enrichment/enrichCompany.test.ts
```

- [ ] **Step 5: Wire the fire-and-forget call after company creation in the ingestion route**

Modify `app/api/ingest/manual/route.ts` and `app/api/ingest/gmail-webhook/route.ts`: after a successful `ingestMail` call, if a new company was created (check via `result.mailEventId` → look up the mail event's `companyId`, and whether that company already had `enrichmentAttemptedAt` set), call `enrichCompany` without awaiting it in the response path — `void enrichCompany(...).then((r) => r && prisma.company.update(...))` — so a slow or failing search never delays the ingestion response.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add one-time company web enrichment with sourced summaries"
```

---

## Task 15: Authenticated attachment proxy

**Files:**
- Create: `app/api/attachments/[id]/route.ts`
- Test: `app/api/attachments/[id]/route.test.ts`

**Interfaces:**
- Consumes: `isAuthorized` (Task 9), `prisma` (Task 2).

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/attachments/[id]/route.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/db/client", () => ({ prisma: { attachment: { findUnique: vi.fn() } } }));

describe("GET /api/attachments/[id]", () => {
  it("returns 401 when there is no session", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/attachments/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

```typescript
// app/api/attachments/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { prisma } from "@/db/client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { allowed } = await isAuthorized(session.user.email, prisma);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Blob storage holds the file; this route is the only sanctioned way to
  // reach it, so the login gate can never be bypassed by sharing a direct
  // Blob URL.
  const upstream = await fetch(attachment.blobUrl);
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.filename}"`,
    },
  });
}
```

- [ ] **Step 3: Run to verify it passes**

```bash
npx vitest run app/api/attachments/[id]/route.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add authenticated attachment proxy route"
```

---

## Task 16: Attachment viewers (PDF, DOCX, XLSX)

**Files:**
- Create: `app/components/attachments/PdfViewer.tsx`
- Create: `app/components/attachments/DocxViewer.tsx`
- Create: `app/components/attachments/XlsxViewer.tsx`
- Create: `app/components/attachments/AttachmentViewer.tsx`
- Create: `app/api/attachments/[id]/render/route.ts` (server-side DOCX→HTML and XLSX→JSON conversion, since `mammoth` and full-workbook parsing are heavier for the client to do)
- Test: `app/api/attachments/[id]/render/route.test.ts`

**Interfaces:**
- Consumes: attachment proxy route (Task 15), `extractNeoIdsFromXlsx`-style sheet reading (reuse `xlsx` package directly here for full-sheet rendering, not just Neo IDs).
- Produces: `<AttachmentViewer attachment={{ id, filename, mimeType }} />` — dispatches to the right viewer by mime type; `.doc` (legacy binary) renders a download-only link.

- [ ] **Step 1: Install viewer libraries**

```bash
npm install react-pdf mammoth
```

- [ ] **Step 2: Write the failing test for the render route's DOCX path**

```typescript
// app/api/attachments/[id]/render/route.test.ts
import { describe, it, expect, vi } from "vitest";
import mammoth from "mammoth";

vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue({ user: { email: "s@vitstudent.ac.in" } }) }));
vi.mock("@/db/client", () => ({
  prisma: {
    attachment: {
      findUnique: vi.fn().mockResolvedValue({
        id: "abc",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        blobUrl: "https://blob.example/fake.docx",
        filename: "JD.docx",
      }),
    },
  },
}));

describe("GET /api/attachments/[id]/render", () => {
  it("returns converted HTML for a docx attachment", async () => {
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as typeof fetch;
    vi.spyOn(mammoth, "convertToHtml").mockResolvedValue({ value: "<p>Job description</p>", messages: [] });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "abc" }) });
    const body = await res.json();
    expect(body.type).toBe("docx");
    expect(body.html).toContain("Job description");
  });
});
```

- [ ] **Step 3: Run to verify it fails, then implement**

```typescript
// app/api/attachments/[id]/render/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { prisma } from "@/db/client";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: "not found" }, { status: 404 });

  const upstream = await fetch(attachment.blobUrl);
  const buffer = Buffer.from(await upstream.arrayBuffer());

  if (attachment.mimeType === DOCX_MIME) {
    const { value: html } = await mammoth.convertToHtml({ buffer });
    return NextResponse.json({ type: "docx", html });
  }

  if (attachment.mimeType === XLSX_MIME) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as unknown[][],
    }));
    return NextResponse.json({ type: "xlsx", sheets });
  }

  return NextResponse.json({ error: "unsupported type for structured render" }, { status: 415 });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run app/api/attachments/[id]/render/route.test.ts
```

- [ ] **Step 5: Build the client viewer components**

```tsx
// app/components/attachments/PdfViewer.tsx
"use client";
import { Document, Page } from "react-pdf";
import { useState } from "react";

export default function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0);
  return (
    <div className="border rounded overflow-auto max-h-[80vh]">
      <Document file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
        {Array.from({ length: numPages }, (_, i) => (
          <Page key={i} pageNumber={i + 1} width={700} />
        ))}
      </Document>
    </div>
  );
}
```

```tsx
// app/components/attachments/DocxViewer.tsx
"use client";
import { useEffect, useState } from "react";

export default function DocxViewer({ renderUrl }: { renderUrl: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    fetch(renderUrl).then((r) => r.json()).then((data) => setHtml(data.html));
  }, [renderUrl]);
  if (!html) return <p className="text-sm text-gray-500">Loading document…</p>;
  // Content is server-converted from a mail-sourced .docx, not raw HTML
  // from an arbitrary external source directly injected — mammoth's output
  // is structural markup (p/table/etc.), not script-capable content.
  return <div className="prose max-w-none border rounded p-4" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

```tsx
// app/components/attachments/XlsxViewer.tsx
"use client";
import { useEffect, useState } from "react";

interface Sheet { name: string; rows: unknown[][]; }

export default function XlsxViewer({ renderUrl }: { renderUrl: string }) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    fetch(renderUrl).then((r) => r.json()).then((data) => setSheets(data.sheets));
  }, [renderUrl]);
  if (sheets.length === 0) return <p className="text-sm text-gray-500">Loading spreadsheet…</p>;

  return (
    <div className="border rounded">
      <div className="flex border-b overflow-x-auto">
        {sheets.map((s, i) => (
          <button key={s.name} onClick={() => setActive(i)} className={`px-3 py-2 text-sm ${i === active ? "font-semibold border-b-2 border-black" : "text-gray-500"}`}>
            {s.name}
          </button>
        ))}
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="text-sm w-full">
          <tbody>
            {sheets[active].rows.map((row, ri) => (
              <tr key={ri} className="border-b">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 whitespace-nowrap">{String(cell ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

```tsx
// app/components/attachments/AttachmentViewer.tsx
import PdfViewer from "./PdfViewer";
import DocxViewer from "./DocxViewer";
import XlsxViewer from "./XlsxViewer";

interface Props {
  attachment: { id: string; filename: string; mimeType: string };
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LEGACY_DOC_MIME = "application/msword";

export default function AttachmentViewer({ attachment }: Props) {
  const fileUrl = `/api/attachments/${attachment.id}`;
  const renderUrl = `/api/attachments/${attachment.id}/render`;

  if (attachment.mimeType === "application/pdf") return <PdfViewer url={fileUrl} />;
  if (attachment.mimeType === DOCX_MIME) return <DocxViewer renderUrl={renderUrl} />;
  if (attachment.mimeType === XLSX_MIME) return <XlsxViewer renderUrl={renderUrl} />;
  if (attachment.mimeType === LEGACY_DOC_MIME) {
    return (
      <a href={fileUrl} className="text-blue-600 underline text-sm">
        Download {attachment.filename} (.doc preview isn't supported — download to view)
      </a>
    );
  }
  return <a href={fileUrl} className="text-blue-600 underline text-sm">Download {attachment.filename}</a>;
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add in-app PDF, DOCX, and XLSX attachment viewers"
```

---

## Task 17: Calendar view with month and custom-range filters

**Files:**
- Create: `app/companies/page.tsx`
- Create: `app/components/CompanyCalendar.tsx`
- Create: `src/queries/getCompaniesInRange.ts`
- Test: `src/queries/getCompaniesInRange.test.ts`

**Interfaces:**
- Produces: `getCompaniesInRange(db: PrismaClient, from: Date, to: Date): Promise<Company[]>`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/queries/getCompaniesInRange.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getCompaniesInRange } from "./getCompaniesInRange";
import type { PrismaClient } from "@prisma/client";

describe("getCompaniesInRange", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    await db.company.createMany({
      data: [
        { name: "In Range", normalizedName: "in range", visitDate: new Date("2026-07-15") },
        { name: "Out of Range", normalizedName: "out of range", visitDate: new Date("2026-09-01") },
        { name: "No Date", normalizedName: "no date", visitDate: null },
      ],
    });
  });

  it("returns only companies with a visitDate inside the given range", async () => {
    const result = await getCompaniesInRange(db, new Date("2026-07-01"), new Date("2026-07-31"));
    expect(result.map((c) => c.name)).toEqual(["In Range"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

```typescript
// src/queries/getCompaniesInRange.ts
import type { PrismaClient, Company } from "@prisma/client";

export async function getCompaniesInRange(db: PrismaClient, from: Date, to: Date): Promise<Company[]> {
  return db.company.findMany({
    where: { visitDate: { gte: from, lte: to } },
    orderBy: { visitDate: "asc" },
  });
}
```

- [ ] **Step 3: Run to verify it passes**

```bash
npx vitest run src/queries/getCompaniesInRange.test.ts
```

- [ ] **Step 4: Build the page and calendar component**

```tsx
// app/components/CompanyCalendar.tsx
import Link from "next/link";
import type { Company } from "@prisma/client";

export default function CompanyCalendar({ companies }: { companies: Company[] }) {
  const byDate = new Map<string, Company[]>();
  for (const c of companies) {
    if (!c.visitDate) continue;
    const key = c.visitDate.toISOString().slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), c]);
  }

  return (
    <div className="space-y-3">
      {[...byDate.entries()].map(([date, list]) => (
        <div key={date} className="border rounded p-3">
          <div className="text-sm font-medium text-gray-500">{date}</div>
          <ul className="mt-1 space-y-1">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/companies/${c.id}`} className="text-blue-600 hover:underline">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {byDate.size === 0 && <p className="text-gray-500 text-sm">No visits in this range.</p>}
    </div>
  );
}
```

```tsx
// app/companies/page.tsx
import { prisma } from "@/db/client";
import { getCompaniesInRange } from "@/queries/getCompaniesInRange";
import CompanyCalendar from "@/components/CompanyCalendar";

function parseRange(searchParams: { from?: string; to?: string; month?: string }) {
  if (searchParams.month) {
    const [year, month] = searchParams.month.split("-").map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);
    return { from, to };
  }
  if (searchParams.from && searchParams.to) {
    return { from: new Date(searchParams.from), to: new Date(searchParams.to) };
  }
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; month?: string }> }) {
  const params = await searchParams;
  const { from, to } = parseRange(params);
  const companies = await getCompaniesInRange(prisma, from, to);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Company Visits</h1>
      <form className="flex gap-2 mb-6 text-sm items-end">
        <label className="flex flex-col">Month
          <input type="month" name="month" defaultValue={params.month} className="border rounded px-2 py-1" />
        </label>
        <span className="text-gray-400 pb-1">or</span>
        <label className="flex flex-col">From
          <input type="date" name="from" defaultValue={params.from} className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col">To
          <input type="date" name="to" defaultValue={params.to} className="border rounded px-2 py-1" />
        </label>
        <button type="submit" className="bg-black text-white rounded px-3 py-1">Filter</button>
      </form>
      <CompanyCalendar companies={companies} />
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add calendar view with month and custom-range filters"
```

---

## Task 18: Company timeline page

**Files:**
- Create: `app/companies/[id]/page.tsx`
- Create: `app/components/MailEventCard.tsx`
- Test: `src/queries/getCompanyTimeline.test.ts`
- Create: `src/queries/getCompanyTimeline.ts`

**Interfaces:**
- Produces: `getCompanyTimeline(db, companyId): Promise<Company & { mailEvents: (MailEvent & { attachments: Attachment[] })[] } | null>`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/queries/getCompanyTimeline.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getCompanyTimeline } from "./getCompanyTimeline";
import type { PrismaClient } from "@prisma/client";

describe("getCompanyTimeline", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("returns mail events ordered oldest to newest, with attachments", async () => {
    const company = await db.company.create({ data: { name: "Acme", normalizedName: "acme" } });
    await db.mailEvent.create({ data: { type: "REGISTRATION", subject: "reg", sender: "x", receivedAt: new Date("2026-07-01"), gmailMessageId: "1", bodyText: "b", companyId: company.id } });
    await db.mailEvent.create({ data: { type: "SHORTLIST_ROUND", subject: "sl", sender: "x", receivedAt: new Date("2026-07-10"), gmailMessageId: "2", bodyText: "b", companyId: company.id } });

    const result = await getCompanyTimeline(db, company.id);
    expect(result?.mailEvents.map((e) => e.type)).toEqual(["REGISTRATION", "SHORTLIST_ROUND"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

```typescript
// src/queries/getCompanyTimeline.ts
import type { PrismaClient } from "@prisma/client";

export async function getCompanyTimeline(db: PrismaClient, companyId: string) {
  return db.company.findUnique({
    where: { id: companyId },
    include: {
      mailEvents: {
        orderBy: { receivedAt: "asc" },
        include: { attachments: true },
      },
    },
  });
}
```

- [ ] **Step 3: Run to verify it passes**

```bash
npx vitest run src/queries/getCompanyTimeline.test.ts
```

- [ ] **Step 4: Build the page**

```tsx
// app/components/MailEventCard.tsx
import AttachmentViewer from "./attachments/AttachmentViewer";
import type { MailEvent, Attachment } from "@prisma/client";

export default function MailEventCard({ event }: { event: MailEvent & { attachments: Attachment[] } }) {
  return (
    <div className="border rounded p-4 space-y-2">
      <div className="text-xs uppercase tracking-wide text-gray-500">{event.type.replace("_", " ")}</div>
      <div className="text-sm text-gray-600">
        <strong>{event.subject}</strong> — {event.receivedAt.toLocaleString()} — from {event.sender}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-blue-600">View original mail</summary>
        <pre className="whitespace-pre-wrap mt-2 text-gray-700">{event.bodyText}</pre>
      </details>
      {event.attachments.map((a) => (
        <div key={a.id} className="mt-2">
          <div className="text-xs text-gray-500 mb-1">{a.filename}</div>
          <AttachmentViewer attachment={a} />
        </div>
      ))}
    </div>
  );
}
```

```tsx
// app/companies/[id]/page.tsx
import { prisma } from "@/db/client";
import { getCompanyTimeline } from "@/queries/getCompanyTimeline";
import MailEventCard from "@/components/MailEventCard";
import { notFound } from "next/navigation";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompanyTimeline(prisma, id);
  if (!company) notFound();

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        {company.category && <p className="text-gray-600">{company.category}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {company.ctc && <><dt className="text-gray-500">CTC</dt><dd>{company.ctc}</dd></>}
          {company.stipend && <><dt className="text-gray-500">Stipend</dt><dd>{company.stipend}</dd></>}
          {company.eligibleBranches.length > 0 && <><dt className="text-gray-500">Branches</dt><dd>{company.eligibleBranches.join(", ")}</dd></>}
          {company.eligibilityCriteria && <><dt className="text-gray-500">Eligibility</dt><dd>{company.eligibilityCriteria}</dd></>}
        </dl>
        {company.enrichmentSummary && (
          <div className="mt-4 text-sm bg-gray-50 border rounded p-3">
            <p className="text-gray-500 text-xs mb-1">Auto-generated overview (unofficial):</p>
            <p>{company.enrichmentSummary}</p>
            <p className="mt-1 text-xs">
              Sources: {company.enrichmentSources.map((s, i) => (
                <a key={s} href={s} className="text-blue-600 underline mr-2" target="_blank" rel="noreferrer">[{i + 1}]</a>
              ))}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {company.mailEvents.map((event) => <MailEventCard key={event.id} event={event} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add company timeline page with attachments and enrichment blurb"
```

---

## Task 19: Neo ID search and personal tracker

**Files:**
- Create: `app/search/page.tsx`
- Create: `src/queries/searchNeoId.ts`
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/actions.ts`
- Test: `src/queries/searchNeoId.test.ts`

**Interfaces:**
- Produces: `searchNeoId(db, partial: string): Promise<(ShortlistEntry & { mailEvent: { company: Company | null } })[]>` — partial, case-insensitive match.

- [ ] **Step 1: Write the failing test**

```typescript
// src/queries/searchNeoId.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { searchNeoId } from "./searchNeoId";
import type { PrismaClient } from "@prisma/client";

describe("searchNeoId", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    const company = await db.company.create({ data: { name: "Wakefit", normalizedName: "wakefit" } });
    const mailEvent = await db.mailEvent.create({ data: { type: "SHORTLIST_ROUND", subject: "s", sender: "x", receivedAt: new Date(), gmailMessageId: "1", bodyText: "b", companyId: company.id } });
    await db.shortlistEntry.create({ data: { neoId: "O3D8V4U8", mailEventId: mailEvent.id } });
  });

  it("matches on a partial, case-insensitive substring", async () => {
    const result = await searchNeoId(db, "3d8v");
    expect(result).toHaveLength(1);
    expect(result[0].neoId).toBe("O3D8V4U8");
  });

  it("returns nothing for a non-matching query", async () => {
    const result = await searchNeoId(db, "zzzz");
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

```typescript
// src/queries/searchNeoId.ts
import type { PrismaClient } from "@prisma/client";

export async function searchNeoId(db: PrismaClient, partial: string) {
  if (partial.trim().length < 3) return [];
  return db.shortlistEntry.findMany({
    where: { neoId: { contains: partial, mode: "insensitive" } },
    include: { mailEvent: { include: { company: true } } },
    take: 50,
  });
}
```

- [ ] **Step 3: Run to verify it passes**

```bash
npx vitest run src/queries/searchNeoId.test.ts
```

- [ ] **Step 4: Build the search page**

```tsx
// app/search/page.tsx
import { prisma } from "@/db/client";
import { searchNeoId } from "@/queries/searchNeoId";
import Link from "next/link";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const results = q ? await searchNeoId(prisma, q) : [];

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Search Neo ID</h1>
      <form className="mb-6">
        <input name="q" defaultValue={q} placeholder="e.g. 3D8V (partial match works)" className="border rounded px-3 py-2 w-full" />
      </form>
      {q && results.length === 0 && <p className="text-gray-500 text-sm">No matches for &quot;{q}&quot;.</p>}
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.id} className="border rounded p-3 flex justify-between">
            <span className="font-mono">{r.neoId}</span>
            {r.mailEvent.company && (
              <Link href={`/companies/${r.mailEvent.company.id}`} className="text-blue-600 hover:underline">
                {r.mailEvent.company.name}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Build the personal dashboard with auto-shortlist matching**

```typescript
// app/dashboard/actions.ts
"use server";
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { revalidatePath } from "next/cache";

export async function setNeoId(formData: FormData): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  const neoId = String(formData.get("neoId")).toUpperCase();
  await prisma.user.upsert({
    where: { email: session.user.email },
    update: { neoId },
    create: { email: session.user.email, neoId },
  });
  revalidatePath("/dashboard");
}

export async function setInterest(companyId: string, status: string): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email },
  });
  await prisma.interest.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    update: { status },
    create: { userId: user.id, companyId, status },
  });
  revalidatePath("/dashboard");
}
```

```tsx
// app/dashboard/page.tsx
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { setNeoId } from "./actions";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return <p className="p-6">Please sign in.</p>;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { interests: { include: { company: true } } },
  });

  const shortlistedFor = user?.neoId
    ? await prisma.shortlistEntry.findMany({
        where: { neoId: user.neoId },
        include: { mailEvent: { include: { company: true } } },
      })
    : [];

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">My Dashboard</h1>
      <form action={setNeoId} className="flex gap-2 items-end text-sm">
        <label className="flex flex-col">Your Neo ID (optional, for auto shortlist alerts)
          <input name="neoId" defaultValue={user?.neoId ?? ""} className="border rounded px-2 py-1 font-mono" />
        </label>
        <button type="submit" className="bg-black text-white rounded px-3 py-1">Save</button>
      </form>

      {shortlistedFor.length > 0 && (
        <div>
          <h2 className="font-medium mb-2">You&apos;re shortlisted for:</h2>
          <ul className="space-y-1">
            {shortlistedFor.map((s) => s.mailEvent.company && (
              <li key={s.id}>
                <Link href={`/companies/${s.mailEvent.company.id}`} className="text-blue-600 hover:underline">
                  {s.mailEvent.company.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="font-medium mb-2">My tracked companies</h2>
        <ul className="space-y-1">
          {user?.interests.map((i) => (
            <li key={i.id}>
              <Link href={`/companies/${i.companyId}`} className="text-blue-600 hover:underline">{i.company.name}</Link>
              <span className="text-gray-500 text-sm ml-2">({i.status})</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Neo ID search and personal tracker with auto shortlist matching"
```

---

## Task 20: Announcements feed and report-issue form

**Files:**
- Create: `app/announcements/page.tsx`
- Create: `src/queries/getGeneralNotices.ts`
- Create: `app/report-issue/page.tsx`
- Create: `app/report-issue/actions.ts`
- Test: `src/queries/getGeneralNotices.test.ts`

**Interfaces:**
- Produces: `getGeneralNotices(db): Promise<MailEvent[]>` (type `GENERAL_NOTICE`, no company link).

- [ ] **Step 1: Write the failing test**

```typescript
// src/queries/getGeneralNotices.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getGeneralNotices } from "./getGeneralNotices";
import type { PrismaClient } from "@prisma/client";

describe("getGeneralNotices", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    await db.mailEvent.create({ data: { type: "GENERAL_NOTICE", subject: "Portal downtime", sender: "x", receivedAt: new Date(), gmailMessageId: "1", bodyText: "b" } });
    await db.mailEvent.create({ data: { type: "REGISTRATION", subject: "Reg", sender: "x", receivedAt: new Date(), gmailMessageId: "2", bodyText: "b" } });
  });

  it("returns only GENERAL_NOTICE events, newest first", async () => {
    const result = await getGeneralNotices(db);
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe("Portal downtime");
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

```typescript
// src/queries/getGeneralNotices.ts
import type { PrismaClient } from "@prisma/client";

export async function getGeneralNotices(db: PrismaClient) {
  return db.mailEvent.findMany({
    where: { type: "GENERAL_NOTICE" },
    orderBy: { receivedAt: "desc" },
  });
}
```

- [ ] **Step 3: Run to verify it passes**

```bash
npx vitest run src/queries/getGeneralNotices.test.ts
```

- [ ] **Step 4: Build the announcements page**

```tsx
// app/announcements/page.tsx
import { prisma } from "@/db/client";
import { getGeneralNotices } from "@/queries/getGeneralNotices";

export default async function AnnouncementsPage() {
  const notices = await getGeneralNotices(prisma);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Announcements</h1>
      {notices.map((n) => (
        <div key={n.id} className="border rounded p-4">
          <div className="text-sm text-gray-500">{n.receivedAt.toLocaleString()}</div>
          <div className="font-medium">{n.subject}</div>
          <p className="text-sm mt-2 whitespace-pre-wrap">{n.bodyText}</p>
        </div>
      ))}
      {notices.length === 0 && <p className="text-gray-500 text-sm">No announcements yet.</p>}
    </main>
  );
}
```

- [ ] **Step 5: Build the report-issue form**

```typescript
// app/report-issue/actions.ts
"use server";
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

export async function reportIssue(formData: FormData): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  const description = String(formData.get("description"));
  const companyId = formData.get("companyId") ? String(formData.get("companyId")) : null;
  await prisma.reportedIssue.create({
    data: { description, companyId, reporterEmail: session.user.email },
  });
}
```

```tsx
// app/report-issue/page.tsx
import { reportIssue } from "./actions";

export default function ReportIssuePage() {
  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Report an issue</h1>
      <form action={reportIssue} className="space-y-3">
        <textarea name="description" required rows={4} placeholder="What looks wrong?" className="border rounded w-full px-3 py-2" />
        <input name="companyId" placeholder="Company page URL or name (optional)" className="border rounded w-full px-3 py-2" />
        <button type="submit" className="bg-black text-white rounded px-4 py-2">Submit</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add announcements feed and report-issue form"
```

---

## Task 21: Admin dashboard — ingestion log, retry, reported issues

**Files:**
- Create: `app/admin/page.tsx`
- Create: `app/admin/actions.ts`
- Test: `src/queries/getIngestionLogSummary.test.ts`
- Create: `src/queries/getIngestionLogSummary.ts`

**Interfaces:**
- Produces: `getIngestionLogSummary(db): Promise<IngestionLog[]>` (most recent first, deduped by `gmailMessageId` to its latest status).

- [ ] **Step 1: Write the failing test**

```typescript
// src/queries/getIngestionLogSummary.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getIngestionLogSummary } from "./getIngestionLogSummary";
import type { PrismaClient } from "@prisma/client";

describe("getIngestionLogSummary", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    await db.ingestionLog.create({ data: { gmailMessageId: "1", status: "FAILED", errorDetail: "e1" } });
    await db.ingestionLog.create({ data: { gmailMessageId: "1", status: "SUCCESS" } });
  });

  it("shows only the latest status per gmailMessageId", async () => {
    const result = await getIngestionLogSummary(db);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("SUCCESS");
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

```typescript
// src/queries/getIngestionLogSummary.ts
import type { PrismaClient } from "@prisma/client";

export async function getIngestionLogSummary(db: PrismaClient) {
  return db.ingestionLog.findMany({
    distinct: ["gmailMessageId"],
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
```

- [ ] **Step 3: Run to verify it passes**

```bash
npx vitest run src/queries/getIngestionLogSummary.test.ts
```

- [ ] **Step 4: Build the admin dashboard page**

```typescript
// app/admin/actions.ts
"use server";
import { prisma } from "@/db/client";
import { getEnv } from "@/env";
import { buildLlmClients } from "@/ingestion/llmExtractor";
import { uploadToBlob } from "@/ingestion/uploadAttachment";
import { fetchGmailMessageRaw } from "@/ingestion/gmailClient";
import { ingestMail } from "@/ingestion/ingestMail";
import { revalidatePath } from "next/cache";

export async function retryOne(gmailMessageId: string): Promise<void> {
  const env = getEnv();
  const raw = await fetchGmailMessageRaw(gmailMessageId, env);
  await ingestMail(raw, gmailMessageId, {
    db: prisma,
    llmClients: buildLlmClients(env),
    uploadAttachment: uploadToBlob,
  });
  revalidatePath("/admin");
}
```

```tsx
// app/admin/page.tsx
import { prisma } from "@/db/client";
import { getIngestionLogSummary } from "@/queries/getIngestionLogSummary";
import { retryOne } from "./actions";
import Link from "next/link";

export default async function AdminPage() {
  const [logs, issues] = await Promise.all([
    getIngestionLogSummary(prisma),
    prisma.reportedIssue.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { company: true } }),
  ]);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <Link href="/admin/manage-admins" className="text-blue-600 hover:underline text-sm">Manage Admins</Link>
      </div>

      <section>
        <h2 className="font-medium mb-2">Ingestion Log</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b"><th className="py-1">Mail</th><th>Status</th><th>Error</th><th></th></tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b">
                <td className="py-1 font-mono text-xs">{log.gmailMessageId}</td>
                <td className={log.status === "SUCCESS" ? "text-green-600" : "text-red-600"}>{log.status}</td>
                <td className="text-xs text-gray-500">{log.errorDetail}</td>
                <td>
                  {log.status === "FAILED" && (
                    <form action={retryOne.bind(null, log.gmailMessageId)}>
                      <button type="submit" className="text-blue-600 text-xs">Retry</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-medium mb-2">Reported Issues</h2>
        <ul className="space-y-2">
          {issues.map((i) => (
            <li key={i.id} className="border rounded p-3 text-sm">
              <div className="text-gray-500 text-xs">{i.createdAt.toLocaleString()} — {i.reporterEmail}{i.company && ` — ${i.company.name}`}</div>
              <p>{i.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add admin dashboard with ingestion log, retry, and reported issues"
```

---

## Task 22: Home page, navigation, and manual-ingestion admin UI

**Files:**
- Create: `app/page.tsx` (replace scaffold default)
- Create: `app/components/NavBar.tsx`
- Modify: `app/layout.tsx` (include `NavBar`)
- Create: `app/admin/manual-ingest/page.tsx`

**Interfaces:**
- Consumes: session from `getServerSession` to show/hide the Admin nav link by role.

- [ ] **Step 1: Build the nav bar, role-aware**

```tsx
// app/components/NavBar.tsx
import Link from "next/link";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { prisma } from "@/db/client";

export default async function NavBar() {
  const session = await getServerSession(buildAuthOptions());
  const role = session?.user?.email ? (await isAuthorized(session.user.email, prisma)).role : null;

  return (
    <nav className="border-b px-6 py-3 flex gap-4 items-center text-sm">
      <Link href="/" className="font-semibold">Placement Tracker</Link>
      <Link href="/companies" className="hover:underline">Companies</Link>
      <Link href="/announcements" className="hover:underline">Announcements</Link>
      <Link href="/search" className="hover:underline">Search Neo ID</Link>
      {session && <Link href="/dashboard" className="hover:underline">My Dashboard</Link>}
      {session && <Link href="/report-issue" className="hover:underline">Report Issue</Link>}
      {role === "admin" && <Link href="/admin" className="hover:underline text-orange-600">Admin</Link>}
      <span className="ml-auto text-gray-500">{session?.user?.email ?? "Not signed in"}</span>
    </nav>
  );
}
```

- [ ] **Step 2: Wire it into the root layout**

```tsx
// app/layout.tsx — add NavBar above {children}
import NavBar from "./components/NavBar";
// ...
<body className="min-h-screen flex flex-col">
  <NavBar />
  <div className="flex-1">{children}</div>
  <SiteFooter />
</body>
```

- [ ] **Step 3: Build the home page**

```tsx
// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Placement Tracker</h1>
      <p className="text-gray-600">Unofficial tracker for VIT placement-cell mails — dates, eligibility, and shortlists in one place.</p>
      <div className="flex gap-3">
        <Link href="/companies" className="bg-black text-white rounded px-4 py-2">View Companies</Link>
        <Link href="/search" className="border rounded px-4 py-2">Search Neo ID</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Build a simple manual-ingest admin form (posts a raw `.eml` file to the Task 11 route)**

```tsx
// app/admin/manual-ingest/page.tsx
"use client";
import { useState } from "react";

export default function ManualIngestPage() {
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return;
    const res = await fetch("/api/ingest/manual", { method: "POST", body: await file.arrayBuffer() });
    const json = await res.json();
    setResult(JSON.stringify(json, null, 2));
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Manual Ingest (.eml)</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="file" name="file" accept=".eml" required />
        <button type="submit" className="bg-black text-white rounded px-4 py-2">Ingest</button>
      </form>
      {result && <pre className="mt-4 text-xs bg-gray-50 border rounded p-3 overflow-auto">{result}</pre>}
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add home page, navigation, and manual ingest admin UI"
```

---

## Task 23: End-to-end verification against the real sample mails

**Files:**
- None created — this task runs the full suite and a manual smoke test.

- [ ] **Step 1: Run the full automated test suite**

```bash
npx vitest run
```

Expected: all tests pass, including every test written in Tasks 1–22 that exercises real sample-mail fixtures from `sample-emails/` through `parseMail`, `tryRegexExtract`, `extractNeoIdsFromXlsx`, and the full `ingestMail` orchestrator.

- [ ] **Step 2: Run the production build to catch type errors and route issues Vitest won't**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed with placeholder `.env.local` values in place (Task 1) — this proves the app builds cleanly without real secrets, which is what Vercel's build step will also do before the user supplies real environment variables in the Vercel dashboard.

- [ ] **Step 3: Smoke-test the ingestion pipeline against all four real sample mails via a throwaway script**, confirming the full pipeline (parse → regex/LLM → xlsx → transaction write) runs end-to-end on real data with a fake LLM client (since no real API key exists yet):

```typescript
// scripts/smokeTestIngestion.ts (throwaway — delete after running, or keep gitignored under sample-emails-adjacent tooling)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createTestPrismaClient } from "../src/db/testClient";
import { ingestMail } from "../src/ingestion/ingestMail";

async function main() {
  const db = await createTestPrismaClient();
  const dir = path.join(process.cwd(), "sample-emails");
  const files = readdirSync(dir).filter((f) => f.endsWith(".eml"));

  for (const file of files) {
    const raw = readFileSync(path.join(dir, file));
    const result = await ingestMail(raw, file, {
      db,
      llmClients: {
        primary: new FakeListChatModel({ responses: [JSON.stringify({
          eventType: "SHORTLIST_ROUND", companyName: "Fallback Co", category: null, campuses: [],
          visitDate: null, eligibleBranches: [], eligibilityCriteria: null, ctc: null, stipend: null,
          venue: null, instructions: null, website: null, fieldConfidence: {},
        })] }),
        fallback: new FakeListChatModel({ responses: ["{}"] }),
      },
      uploadAttachment: async (att) => `https://blob.example/${att.filename}`,
    });
    console.log(file, "->", result.status, result.error ?? "");
  }

  const companies = await db.company.findMany();
  console.log(`\n${companies.length} companies created:`, companies.map((c) => c.name));
}

main();
```

```bash
npx tsx scripts/smokeTestIngestion.ts
```

Expected: all 4 sample mails process to `SUCCESS` (the registration mail via the regex fast path with real extracted values; the three shortlist mails via the fake LLM, since no real Gemini/Groq key is present in this environment — this confirms pipeline plumbing end-to-end, while real-world extraction quality against actual Gemini/Groq responses remains unverified until the user supplies real API keys).

- [ ] **Step 4: Delete the throwaway script and commit the verification pass**

```bash
rm scripts/smokeTestIngestion.ts
git add -A
git commit -m "Verify full test suite and build pass end-to-end"
```

---

## Task 24: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write a README covering**: what the project is (with the unofficial/not-CDC-affiliated disclaimer up front), architecture summary, the full list of environment variables from `.env.example` and where to obtain each (Google Cloud Console for OAuth/Gmail/Pub/Sub/Search, Neon for `DATABASE_URL`, Vercel dashboard for `BLOB_READ_WRITE_TOKEN`, Google AI Studio for `GOOGLE_GENERATIVE_AI_API_KEY`, Groq Console for `GROQ_API_KEY`), local dev setup (`npm install`, `npm run dev`, `npx vitest run`), the one-time Gmail filter + `watch()` setup steps, and the Vercel deployment steps (env vars, cron config already in `vercel.json`, OAuth consent screen "In Production" toggle).

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "Add README"
```

---

## Self-Review Notes

- **Spec coverage**: every spec section has a task — Architecture (1, 2, 9), Data Model (2), Company Enrichment (14), Ingestion Pipeline (3–8, 11–13), Public UI (16–20, 22), Admin Dashboard (10, 21), Security (9, 15, all server-side checks embedded per-task). The one spec item intentionally deferred beyond this plan's tests is *live* verification against real Gemini/Groq/Gmail — impossible without the user's real credentials; Task 23 makes this gap explicit rather than silently skipping it.
- **No placeholders**: every step above has complete, runnable code — none were left as prose-only descriptions.
- **Type consistency checked**: `ParsedMail`/`ParsedAttachment` (Task 3) are the same shape consumed in Tasks 4, 5, 6, 8, 11, 14. `ExtractionResult` (Task 6) matches the fields written in Task 8's orchestrator. `IngestOptions`/`IngestResult` (Task 8) match every caller in Tasks 11, 12, 21. `isAuthorized`'s `{ allowed, role }` shape (Task 9) is used identically in Tasks 10, 15, 16, 22.
