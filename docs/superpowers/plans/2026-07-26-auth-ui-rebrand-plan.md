# Auth UI, Rebrand & Optional Neo ID Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custom on-brand sign-in/sign-out pages, rename "Placement Board" to "Placement Tracker" everywhere, let a signed-in user optionally save their own Neo ID (encrypted) for autofill on `/search`, and add Vercel Speed Insights.

**Architecture:** Two new standalone auth pages (`/auth/signin`, `/auth/signout`) wired into NextAuth's `pages` config, using `next-auth/react`'s browser-only `signIn()`/`signOut()` helpers (verified safe against the installed v4.24.15 source — no hand-rolled CSRF forms, no `SessionProvider`). A new `auth/neoIdVault.ts` (AES-256-GCM, keyed by a new `NEO_ID_ENC_SECRET`) plus `auth/neoIdVaultActions.ts` (session-gated server actions) back an opt-in save flow surfaced inline on `/search` and manageable from `/dashboard`. Two nullable `User` columns hold the encrypted value and a "already asked" marker.

**Tech Stack:** Next.js 16 App Router, NextAuth v4.24.15, Prisma 7 + Neon (PGlite in tests), Vitest, plain CSS (no component library).

## Global Constraints

- `/` stays public. Every other route (`/dashboard`, `/admin`, `/companies`, `/announcements`, `/search`, `/report-issue`) already redirects unauthenticated visitors via `proxy.ts`'s middleware matcher — do not change that matcher.
- `noindex` is already set in `app/layout.tsx` metadata — no change needed there.
- Do not introduce `SessionProvider` or `useSession()` from `next-auth/react`. The standalone `signIn()` / `signOut()` functions are fine (they need no provider) — confirmed by reading the installed `next-auth@4.24.15` source directly.
- Do not touch the shortlist-matching system: `ShortlistHash`, `ingestion/hashNeoId.ts`, `queries/searchNeoId.ts`, `app/search/actions.ts` (the `checkShortlist` action) are all out of scope and must keep working exactly as before.
- `NEO_ID_ENC_SECRET` must be a separate env var from `NEO_ID_HASH_SECRET` — never derive one from the other.
- Once `neoIdPromptDismissedAt` is set (whichever way the user answered), never show the save prompt again.
- The save prompt must never be pre-checked or default to "yes" — explicit action required either way.
- Git commits: short messages, no `Co-Authored-By` trailer (per this session's stated preference).

---

### Task 1: Rebrand — "Placement Board" → "Placement Tracker"

**Files:**
- Modify: `app/components/AppShell.tsx:86`, `:129`
- Modify: `app/layout.tsx:12`
- Modify: `app/globals.css:4`

**Interfaces:** None — pure copy change, no new exports or props.

- [ ] **Step 1: Update the sidebar brand mark**

In `app/components/AppShell.tsx`, line 86, change:

```tsx
            <b>Placement Board</b>
```

to:

```tsx
            <b>Placement Tracker</b>
```

- [ ] **Step 2: Update the mobile top-bar brand mark**

In the same file, line 129, change:

```tsx
          <b>Placement Board</b>
```

to:

```tsx
          <b>Placement Tracker</b>
```

- [ ] **Step 3: Update the page title metadata**

In `app/layout.tsx`, line 12, change:

```tsx
  title: "Placement Board — VIT placement tracker",
```

to:

```tsx
  title: "Placement Tracker — VIT placement tracker",
```

- [ ] **Step 4: Update the CSS header comment**

In `app/globals.css`, line 4, change:

```css
   Placement Board — design tokens
```

to:

```css
   Placement Tracker — design tokens
```

- [ ] **Step 5: Verify no leftover references**

Run: `grep -rn "Placement Board" app/ --include="*.tsx" --include="*.ts" --include="*.css"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/components/AppShell.tsx app/layout.tsx app/globals.css
git commit -m "Rebrand Placement Board to Placement Tracker"
```

---

### Task 2: Schema, migration, and env var for the Neo ID vault

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260726000000_neo_id_vault/migration.sql`
- Modify: `env.ts`
- Modify: `env.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `User.neoIdEncrypted: Bytes | null`, `User.neoIdPromptDismissedAt: DateTime | null` — consumed by Task 3/4's Prisma calls.
- Produces: `process.env.NEO_ID_ENC_SECRET` — consumed by `auth/neoIdVault.ts` in Task 3.

- [ ] **Step 1: Add the two columns to the `User` model**

In `prisma/schema.prisma`, find:

```prisma
model User {
  id        String     @id @default(cuid())
  email     String     @unique
  interests Interest[]
  createdAt DateTime   @default(now())
}
```

Replace with:

```prisma
model User {
  id        String     @id @default(cuid())
  email     String     @unique
  interests Interest[]
  createdAt DateTime   @default(now())

  // Opt-in, encrypted save of the user's own Neo ID, for autofill on
  // /search. Unrelated to ShortlistHash (everyone's Neo IDs, one-way
  // hashed, never linked to identity) — see auth/neoIdVault.ts.
  neoIdEncrypted         Bytes?
  // Set the first time the user answers the save prompt, either way, so
  // they are never asked twice.
  neoIdPromptDismissedAt DateTime?
}
```

- [ ] **Step 2: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: completes without error; `@prisma/client` now types `neoIdEncrypted` and `neoIdPromptDismissedAt` on `User`.

- [ ] **Step 4: Write the hand-written migration for Neon**

Create `prisma/migrations/20260726000000_neo_id_vault/migration.sql`:

```sql
-- Opt-in, encrypted Neo ID save (auth/neoIdVault.ts) — unrelated to the
-- one-way ShortlistHash system, which is untouched by this migration.
--
-- Both columns are nullable additions, so this is non-destructive and safe
-- to run before or after deploy. Run against Neon before deploying, per the
-- project's existing convention (see the 20260725000000_storage_reclamation
-- migration for the same pattern).

ALTER TABLE "User" ADD COLUMN "neoIdEncrypted" BYTEA;
ALTER TABLE "User" ADD COLUMN "neoIdPromptDismissedAt" TIMESTAMP(3);
```

- [ ] **Step 5: Add the new secret to the env schema**

In `env.ts`, find:

```ts
  NEO_ID_HASH_SECRET: z.string().min(1),
```

Replace with:

```ts
  NEO_ID_HASH_SECRET: z.string().min(1),
  // Reversible encryption key for the opt-in Neo ID save (auth/neoIdVault.ts).
  // Deliberately separate from NEO_ID_HASH_SECRET: that one is a one-way
  // pepper for shortlist matching, this one is a reversible key for a
  // user's own saved Neo ID — a leak of one must not compromise the other.
  NEO_ID_ENC_SECRET: z.string().min(1),
```

- [ ] **Step 6: Update the env test fixture**

In `env.test.ts`, in the `"returns a typed object when all vars are present"` test, find:

```ts
      NEO_ID_HASH_SECRET: "pepper",
    };
```

Replace with:

```ts
      NEO_ID_HASH_SECRET: "pepper",
      NEO_ID_ENC_SECRET: "vault-secret",
    };
```

- [ ] **Step 7: Run the env test**

Run: `npx vitest run env.test.ts`
Expected: both tests pass.

- [ ] **Step 8: Document the new var in `.env.example`**

In `.env.example`, after the `NEO_ID_HASH_SECRET` block, add:

```
# --- Neo ID vault (opt-in, per-user save) ---
# Reversible key for a user's own saved Neo ID (auth/neoIdVault.ts) — separate
# from NEO_ID_HASH_SECRET above, which is one-way and used only for shortlist
# matching. Generate with `openssl rand -base64 32`.
NEO_ID_ENC_SECRET="replace-with-openssl-rand-base64-32"
```

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260726000000_neo_id_vault env.ts env.test.ts .env.example
git commit -m "Add Neo ID vault columns, migration, and encryption secret"
```

---

### Task 3: `auth/neoIdVault.ts` — encrypt/decrypt

**Files:**
- Create: `auth/neoIdVault.ts`
- Create: `auth/neoIdVault.test.ts`

**Interfaces:**
- Consumes: `process.env.NEO_ID_ENC_SECRET` (Task 2).
- Produces: `encryptNeoId(neoId: string): Uint8Array<ArrayBuffer>`, `decryptNeoId(blob: Uint8Array): string` — consumed by Task 4's server actions and by `app/search/page.tsx` (Task 6).

- [ ] **Step 1: Write the failing test**

Create `auth/neoIdVault.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptNeoId, decryptNeoId } from "./neoIdVault";

describe("neoIdVault", () => {
  const REAL_SECRET = process.env.NEO_ID_ENC_SECRET;
  beforeEach(() => {
    process.env.NEO_ID_ENC_SECRET = "test-vault-secret";
  });
  afterEach(() => {
    process.env.NEO_ID_ENC_SECRET = REAL_SECRET;
  });

  it("round-trips a Neo ID through encrypt and decrypt", () => {
    const blob = encryptNeoId("23bce1234");
    expect(decryptNeoId(blob)).toBe("23BCE1234");
  });

  it("produces different ciphertext for the same input each call (random IV)", () => {
    const a = encryptNeoId("23BCE1234");
    const b = encryptNeoId("23BCE1234");
    expect(a).not.toEqual(b);
    expect(decryptNeoId(a)).toBe(decryptNeoId(b));
  });

  it("fails to decrypt under a different secret", () => {
    const blob = encryptNeoId("23BCE1234");
    process.env.NEO_ID_ENC_SECRET = "different-secret";
    expect(() => decryptNeoId(blob)).toThrow();
  });

  it("fails to decrypt if the ciphertext is tampered with", () => {
    const blob = encryptNeoId("23BCE1234");
    const tampered = Uint8Array.from(blob);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptNeoId(tampered)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run auth/neoIdVault.test.ts`
Expected: FAIL — `Cannot find module './neoIdVault'`.

- [ ] **Step 3: Write the implementation**

Create `auth/neoIdVault.ts`:

```ts
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function deriveKey(): Buffer {
  const secret = process.env.NEO_ID_ENC_SECRET ?? "";
  return createHash("sha256").update(secret).digest();
}

/**
 * Reversibly encrypts a user's own Neo ID for opt-in autofill storage.
 *
 * Unlike ingestion/hashNeoId.ts (a one-way fingerprint used to match
 * everyone's Neo IDs against shortlist mail, never linked to an identity),
 * this is a per-user, per-account, explicitly opt-in convenience save — and
 * therefore must be reversible. Keyed by NEO_ID_ENC_SECRET, a separate
 * secret from the hashing pepper, so a leak of one cannot compromise the
 * other.
 *
 * Returns iv || authTag || ciphertext packed into one blob, as a fresh
 * Uint8Array copy — Prisma's Bytes type is Uint8Array<ArrayBuffer>, and a
 * Buffer view can be backed by a pooled SharedArrayBuffer.
 */
export function encryptNeoId(neoId: string): Uint8Array<ArrayBuffer> {
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const normalized = neoId.trim().toUpperCase();
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  return Uint8Array.from(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
}

/** Reverses encryptNeoId. Throws if the secret or the blob doesn't match
 * (wrong key, or the ciphertext/auth tag was tampered with). */
export function decryptNeoId(blob: Uint8Array): string {
  const key = deriveKey();
  const buf = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  const iv = buf.subarray(0, IV_BYTES);
  const authTag = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run auth/neoIdVault.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add auth/neoIdVault.ts auth/neoIdVault.test.ts
git commit -m "Add reversible Neo ID encryption for the opt-in vault"
```

---

### Task 4: `auth/neoIdVaultActions.ts` — session-gated server actions

**Files:**
- Create: `auth/neoIdVaultActions.ts`
- Create: `auth/neoIdVaultActions.test.ts`

**Interfaces:**
- Consumes: `encryptNeoId` (Task 3), `prisma` from `@/db/client`, `getServerSession` + `buildAuthOptions` (existing).
- Produces: `saveNeoId(neoId: string): Promise<void>`, `dismissNeoIdPrompt(): Promise<void>`, `forgetNeoId(): Promise<void>` — consumed by `ShortlistChecker.tsx` (Task 6) and `app/dashboard/page.tsx` (Task 7).

- [ ] **Step 1: Write the failing tests**

Create `auth/neoIdVaultActions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/db/client", async () => {
  const { createTestPrismaClient } = await import("@/db/testClient");
  const db = await createTestPrismaClient();
  return { prisma: db };
});

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
vi.mock("@/auth/authOptions", () => ({ buildAuthOptions: vi.fn() }));

describe("neoIdVaultActions", () => {
  const REAL_SECRET = process.env.NEO_ID_ENC_SECRET;
  beforeEach(() => {
    process.env.NEO_ID_ENC_SECRET = "test-vault-secret";
  });
  afterEach(() => {
    process.env.NEO_ID_ENC_SECRET = REAL_SECRET;
  });

  describe("saveNeoId", () => {
    it("rejects when there is no session", async () => {
      mockGetServerSession.mockResolvedValue(null);
      const { saveNeoId } = await import("./neoIdVaultActions");
      await expect(saveNeoId("23BCE1234")).rejects.toThrow(/not authorized/i);
    });

    it("creates a user row with the encrypted Neo ID and dismisses the prompt", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "saver@vitstudent.ac.in" } });
      const { saveNeoId } = await import("./neoIdVaultActions");
      const { decryptNeoId } = await import("./neoIdVault");
      const { prisma } = await import("@/db/client");
      const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

      await saveNeoId("23bce1234");

      const user = await db.user.findUnique({ where: { email: "saver@vitstudent.ac.in" } });
      expect(user?.neoIdEncrypted).not.toBeNull();
      expect(decryptNeoId(user!.neoIdEncrypted!)).toBe("23BCE1234");
      expect(user?.neoIdPromptDismissedAt).not.toBeNull();
    });
  });

  describe("dismissNeoIdPrompt", () => {
    it("marks the prompt dismissed without saving a Neo ID", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "decliner@vitstudent.ac.in" } });
      const { dismissNeoIdPrompt } = await import("./neoIdVaultActions");
      const { prisma } = await import("@/db/client");
      const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

      await dismissNeoIdPrompt();

      const user = await db.user.findUnique({ where: { email: "decliner@vitstudent.ac.in" } });
      expect(user?.neoIdEncrypted).toBeNull();
      expect(user?.neoIdPromptDismissedAt).not.toBeNull();
    });
  });

  describe("forgetNeoId", () => {
    it("is a no-op when the user has no row yet", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "never-saved@vitstudent.ac.in" } });
      const { forgetNeoId } = await import("./neoIdVaultActions");
      await expect(forgetNeoId()).resolves.not.toThrow();
    });

    it("clears the saved Neo ID but keeps the dismissed timestamp", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "forgetter@vitstudent.ac.in" } });
      const { saveNeoId, forgetNeoId } = await import("./neoIdVaultActions");
      const { prisma } = await import("@/db/client");
      const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

      await saveNeoId("23BCE1234");
      const before = await db.user.findUnique({ where: { email: "forgetter@vitstudent.ac.in" } });

      await forgetNeoId();

      const after = await db.user.findUnique({ where: { email: "forgetter@vitstudent.ac.in" } });
      expect(after?.neoIdEncrypted).toBeNull();
      expect(after?.neoIdPromptDismissedAt).toEqual(before?.neoIdPromptDismissedAt);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run auth/neoIdVaultActions.test.ts`
Expected: FAIL — `Cannot find module './neoIdVaultActions'`.

- [ ] **Step 3: Write the implementation**

Create `auth/neoIdVaultActions.ts`:

```ts
"use server";
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { revalidatePath } from "next/cache";
import { encryptNeoId } from "./neoIdVault";

/** Saves the user's own Neo ID, encrypted, and marks the save prompt
 * answered. Only called when the user explicitly clicks "Save it". */
export async function saveNeoId(neoId: string): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  await prisma.user.upsert({
    where: { email: session.user.email },
    update: { neoIdEncrypted: encryptNeoId(neoId), neoIdPromptDismissedAt: new Date() },
    create: {
      email: session.user.email,
      neoIdEncrypted: encryptNeoId(neoId),
      neoIdPromptDismissedAt: new Date(),
    },
  });
  revalidatePath("/search");
}

/** Marks the save prompt answered "no" — nothing is stored, and the user
 * is not asked again. */
export async function dismissNeoIdPrompt(): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  await prisma.user.upsert({
    where: { email: session.user.email },
    update: { neoIdPromptDismissedAt: new Date() },
    create: { email: session.user.email, neoIdPromptDismissedAt: new Date() },
  });
  revalidatePath("/search");
}

/** Clears a previously saved Neo ID. Leaves neoIdPromptDismissedAt as-is,
 * so forgetting it doesn't immediately re-trigger the save prompt. */
export async function forgetNeoId(): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { neoIdEncrypted: null } });
  revalidatePath("/dashboard");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run auth/neoIdVaultActions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add auth/neoIdVaultActions.ts auth/neoIdVaultActions.test.ts
git commit -m "Add session-gated actions for the Neo ID vault"
```

---

### Task 5: Custom sign-in / sign-out pages

**Files:**
- Modify: `auth/authOptions.ts`
- Create: `app/auth/SignInButton.tsx`
- Create: `app/auth/SignOutButton.tsx`
- Create: `app/auth/signin/page.tsx`
- Create: `app/auth/signout/page.tsx`
- Modify: `app/components/AppShell.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `next-auth/react`'s `signIn`/`signOut` (verified to need no `SessionProvider`).
- Produces: routes `/auth/signin`, `/auth/signout`.

**Why `signIn()`/`signOut()` instead of a hand-built CSRF form:** the installed `next-auth@4.24.15` source (`core/index.js:229`) requires a *verified* CSRF token for the `signin` POST action for every provider type, not just credentials. Verification means the token in the POST body must match the value inside the visitor's `next-auth.csrf-token` cookie. A Server Component calling `getCsrfToken()` with no request context mints a token via a server-to-server `fetch` whose `Set-Cookie` never reaches the browser — the form would silently fail (bounce back to `/auth/signin?csrf=true`) on a visitor's very first ever visit. `next-auth/react`'s standalone `signIn()`/`signOut()` functions run entirely in the browser, so the CSRF fetch-then-POST happens in the same cookie jar and always works. Confirmed against `node_modules/next-auth/src/react/index.tsx:212-331` — these functions need no `SessionProvider`, only `useSession()` does.

- [ ] **Step 1: Wire NextAuth's custom pages config**

In `auth/authOptions.ts`, find:

```ts
export function buildAuthOptions(): NextAuthOptions {
  const env = getEnv();
  return {
    providers: [
```

Replace with:

```ts
export function buildAuthOptions(): NextAuthOptions {
  const env = getEnv();
  return {
    pages: {
      signIn: "/auth/signin",
      signOut: "/auth/signout",
    },
    providers: [
```

- [ ] **Step 2: Run the existing auth test to confirm nothing broke**

Run: `npx vitest run auth/authOptions.test.ts`
Expected: PASS, 2 tests (the `pages` key doesn't affect the `signIn` callback behavior under test).

- [ ] **Step 3: Create the sign-in button (client component)**

Create `app/auth/SignInButton.tsx`:

```tsx
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInButton({ callbackUrl }: { callbackUrl?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="btn pri"
      style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn("google", { callbackUrl: callbackUrl ?? "/" });
      }}
    >
      {busy ? "Redirecting…" : "Sign in with Google"}
    </button>
  );
}
```

- [ ] **Step 4: Create the sign-out button (client component)**

Create `app/auth/SignOutButton.tsx`:

```tsx
"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="btn danger"
      style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ callbackUrl: "/" });
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
```

- [ ] **Step 5: Create the sign-in page**

Create `app/auth/signin/page.tsx`:

```tsx
import SignInButton from "../SignInButton";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <div className="authcard">
      <p className="eye">Sign in</p>
      <h1>Welcome to Placement Tracker</h1>
      <p className="psub">
        Sign in with your VIT Google account to see companies, shortlist status, and drive timelines. Access is
        limited to current-batch (2023) vitstudent.ac.in accounts.
      </p>
      {error && (
        <div className="toast err">
          Your account isn&rsquo;t authorized. Sign-in is limited to current-batch VIT accounts.
        </div>
      )}
      <SignInButton callbackUrl={callbackUrl} />
    </div>
  );
}
```

- [ ] **Step 6: Create the sign-out page**

Create `app/auth/signout/page.tsx`:

```tsx
import SignOutButton from "../SignOutButton";

export default function SignOutPage() {
  return (
    <div className="authcard">
      <p className="eye">Sign out</p>
      <h1>Sign out of Placement Tracker?</h1>
      <p className="psub">You can sign back in any time with your VIT Google account.</p>
      <SignOutButton />
    </div>
  );
}
```

- [ ] **Step 7: Add the standalone auth-shell layout to `AppShell`**

In `app/components/AppShell.tsx`, find:

```tsx
  const isActive = (item: NavItem) => (item.match ? item.match(pathname) : pathname === item.href);

  const renderNav = (items: NavItem[]) =>
    items.map((item) => (
      <Link key={item.href} href={item.href} className="navlink" aria-current={isActive(item) ? "page" : undefined}>
        <span className="stn" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    ));

  return (
    <div className={`shell${navOpen ? " nav-open" : ""}`}>
```

Replace with (this adds `isAuthPage`, keeps `isActive`/`renderNav` unchanged, and inserts an early return for auth pages — placed after every hook call so the Rules of Hooks stay respected; only the returned JSX branches, no hook becomes conditional):

```tsx
  const isAuthPage = pathname.startsWith("/auth/");
  const isActive = (item: NavItem) => (item.match ? item.match(pathname) : pathname === item.href);

  const renderNav = (items: NavItem[]) =>
    items.map((item) => (
      <Link key={item.href} href={item.href} className="navlink" aria-current={isActive(item) ? "page" : undefined}>
        <span className="stn" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    ));

  if (isAuthPage) {
    return (
      <div className="authshell">
        <div className="authtop">
          <Link href="/" className="brand">
            <span className="glyph" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>
              <b>Placement Tracker</b>
              <small>vitstudent.ac.in</small>
            </span>
          </Link>
          <ThemeToggle />
        </div>
        <main className="authmain">{children}</main>
      </div>
    );
  }

  return (
    <div className={`shell${navOpen ? " nav-open" : ""}`}>
```

- [ ] **Step 8: Repoint the sidebar sign-in/out link**

In the same file, find:

```tsx
          <a
            className="themebtn"
            style={{ marginLeft: "auto" }}
            href={isSignedIn ? "/api/auth/signout" : "/api/auth/signin"}
          >
```

Replace with:

```tsx
          <a
            className="themebtn"
            style={{ marginLeft: "auto" }}
            href={isSignedIn ? "/auth/signout" : "/auth/signin"}
          >
```

- [ ] **Step 9: Add the auth-shell CSS**

In `app/globals.css`, after the `.sitefoot` block (end of the "Footer" section, before the "Responsive" section), add:

```css
/* ============================================================
   Standalone auth pages (sign in / sign out) — no sidebar
   ============================================================ */
.authshell{ min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:40px 20px; }
.authtop{ display:flex; align-items:center; gap:10px; width:100%; max-width:400px; margin-bottom:40px; }
.authtop .themebtn{ margin-left:auto; }
.authmain{ width:100%; max-width:400px; margin:auto 0; }
.authcard{ border:1px solid var(--hair); background:var(--card); border-radius:var(--r); padding:26px; animation:pb-fade .25s ease both; }
.authcard .eye{ font-family:var(--font-mono); font-size:.7rem; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); }
.authcard h1{ font-size:1.4rem; margin:8px 0 0; font-weight:800; }
.authcard .psub{ color:var(--muted); font-size:.88rem; margin:10px 0 0; }
```

- [ ] **Step 10: Manual verification**

Run: `npm run dev`, then in a browser visit `/auth/signin` and `/auth/signout` while signed out. Confirm: no sidebar renders, the card is centered, "Sign in with Google" starts the OAuth flow and lands back on `/` (or the intended `callbackUrl`) once authorized. Then, signed in, visit `/auth/signout` and confirm "Sign out" ends the session and redirects to `/`.

- [ ] **Step 11: Commit**

```bash
git add auth/authOptions.ts app/auth app/components/AppShell.tsx app/globals.css
git commit -m "Add custom sign-in/sign-out pages"
```

---

### Task 6: Neo ID save prompt on `/search`

**Files:**
- Modify: `app/search/page.tsx`
- Modify: `app/search/ShortlistChecker.tsx`

**Interfaces:**
- Consumes: `decryptNeoId` (Task 3), `saveNeoId`/`dismissNeoIdPrompt` (Task 4).
- Produces: `ShortlistChecker` now takes `savedState: "none" | "asked" | "saved"` and `savedNeoId?: string` props.

- [ ] **Step 1: Make the search page read and decrypt the saved state**

Replace the full contents of `app/search/page.tsx`:

```tsx
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { prisma } from "@/db/client";
import { decryptNeoId } from "@/auth/neoIdVault";
import ShortlistChecker from "./ShortlistChecker";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const session = await getServerSession(buildAuthOptions());
  let savedState: "none" | "asked" | "saved" = "none";
  let savedNeoId: string | undefined;

  if (session?.user?.email) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (user?.neoIdEncrypted) {
      savedState = "saved";
      savedNeoId = decryptNeoId(user.neoIdEncrypted);
    } else if (user?.neoIdPromptDismissedAt) {
      savedState = "asked";
    }
  }

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Shortlist lookup</p>
        <h1>Check shortlist</h1>
        <p>
          See which companies shortlisted you. Matching uses one-way fingerprints of the IDs in shortlist mail, so
          the check itself never stores a Neo ID.
        </p>
      </div>

      <ShortlistChecker savedState={savedState} savedNeoId={savedNeoId} />

      <div className="callout" style={{ marginTop: 16 }}>
        <span className="ci">i</span>
        <div>
          Neo IDs used to check shortlists are matched against one-way fingerprints and never stored — exact ID
          only, partial matches aren&rsquo;t possible. You can optionally save your own Neo ID to your account,
          encrypted, so it&rsquo;s pre-filled next time; forget it any time from your dashboard.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the save prompt and props to `ShortlistChecker`**

Replace the full contents of `app/search/ShortlistChecker.tsx`:

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { checkShortlist, type ShortlistMatch } from "./actions";
import { saveNeoId, dismissNeoIdPrompt } from "@/auth/neoIdVaultActions";

type SavedState = "none" | "asked" | "saved";

export default function ShortlistChecker({
  savedState,
  savedNeoId,
}: {
  savedState: SavedState;
  savedNeoId?: string;
}) {
  const [consent, setConsent] = useState(false);
  const [neoId, setNeoId] = useState(savedNeoId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ShortlistMatch[] | null>(null);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [savePromptDone, setSavePromptDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMatches(null);
    try {
      const res = await checkShortlist(neoId);
      if (res.error) {
        setError(res.error);
      } else {
        setMatches(res.matches ?? []);
        if (savedState === "none" && !savePromptDone) setShowSavePrompt(true);
      }
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveNeoId() {
    setSaving(true);
    try {
      await saveNeoId(neoId);
    } finally {
      setSaving(false);
      setSavePromptDone(true);
      setShowSavePrompt(false);
    }
  }

  async function onDismissPrompt() {
    setSaving(true);
    try {
      await dismissNeoIdPrompt();
    } finally {
      setSaving(false);
      setSavePromptDone(true);
      setShowSavePrompt(false);
    }
  }

  return (
    <div className="panel">
      <h3>Check your shortlist status</h3>
      <p className="psub">
        Enter your full Neo ID to see which companies shortlisted you. It&rsquo;s checked against one-way
        fingerprints and <strong>never stored</strong> for the check itself.
      </p>

      <label
        style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: ".82rem", color: "var(--muted)", marginBottom: 14 }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, flex: "none" }}
        />
        <span>
          I&rsquo;m a current-batch student authorized to view these shortlists, and I understand my Neo ID is used
          only for this check. Shortlists come from placement-cell mail and may contain errors — I&rsquo;ll confirm
          anything important against the original mail.
        </span>
      </label>

      <form className="search" onSubmit={onSubmit}>
        <input
          value={neoId}
          onChange={(e) => setNeoId(e.target.value)}
          placeholder="e.g. O3D8V4U8"
          maxLength={10}
          autoComplete="off"
          spellCheck={false}
          aria-label="Your Neo ID"
          disabled={!consent}
        />
        <button type="submit" disabled={!consent || busy || neoId.trim().length < 6}>
          {busy ? "Checking…" : "Check"}
        </button>
      </form>

      {error && (
        <div className="results">
          <div className="empty">{error}</div>
        </div>
      )}

      {showSavePrompt && (
        <div className="callout" style={{ marginTop: 14 }}>
          <span className="ci">?</span>
          <div>
            <b>Save this Neo ID to your account for next time?</b> It&rsquo;ll be encrypted and only used to
            pre-fill this form.
            <div className="formrow" style={{ marginTop: 8 }}>
              <button type="button" className="btn pri" disabled={saving} onClick={onSaveNeoId}>
                Save it
              </button>
              <button type="button" className="btn" disabled={saving} onClick={onDismissPrompt}>
                No, don&rsquo;t ask again
              </button>
            </div>
          </div>
        </div>
      )}

      {matches && (
        <div className="results">
          {matches.length === 0 ? (
            <div className="empty">
              <b>{neoId.trim().toUpperCase()}</b> isn&rsquo;t on any shortlist on record yet. New shortlists arrive
              through the season — check back after the next mail lands.
            </div>
          ) : (
            matches.map((m) => (
              <Link key={m.companyId + m.subject} href={`/companies/${m.companyId}`} className="res">
                <span className="tick" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <b>{m.company}</b>
                  <small>{m.subject}</small>
                </div>
                <span className="stage">Shortlisted</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, sign in, visit `/search`, run a check. Confirm the save prompt appears once, "Save it" pre-fills the field on a later visit, "No, don't ask again" hides it and it doesn't reappear on a fresh page load.

- [ ] **Step 4: Commit**

```bash
git add app/search/page.tsx app/search/ShortlistChecker.tsx
git commit -m "Add opt-in Neo ID save prompt to the shortlist checker"
```

---

### Task 7: Dashboard management + `deleteMyData` cleanup

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/actions.ts`
- Modify: `app/dashboard/actions.test.ts`

**Interfaces:**
- Consumes: `forgetNeoId` (Task 4).

- [ ] **Step 1: Add the failing test for `deleteMyData` clearing the vault**

In `app/dashboard/actions.test.ts`, add near the top (after the existing `vi.mock` calls, before `describe("deleteMyData"...)`):

```ts
beforeEach(() => {
  process.env.NEO_ID_ENC_SECRET = "test-vault-secret";
});
```

(Add `beforeEach` to the existing `import { describe, it, expect, vi } from "vitest";` line, changing it to `import { describe, it, expect, vi, beforeEach } from "vitest";`.)

Then, inside `describe("deleteMyData", ...)`, add:

```ts
  it("also erases a saved Neo ID, since the whole account row is removed", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "vault-erasure@vitstudent.ac.in" } });
    const { saveNeoId } = await import("@/auth/neoIdVaultActions");
    const { deleteMyData } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    await saveNeoId("23BCE1234");
    await deleteMyData();

    const user = await db.user.findUnique({ where: { email: "vault-erasure@vitstudent.ac.in" } });
    expect(user).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/dashboard/actions.test.ts`
Expected: this new test actually passes already (deleting the whole `User` row already erases the columns — nothing to implement). Confirm this by running it now: PASS. This step exists to lock in the behavior as a regression test, not to drive new code.

- [ ] **Step 3: Update the misleading comment on `deleteMyData`**

In `app/dashboard/actions.ts`, find:

```ts
/** Self-service data erasure: removes this account and every tracked-interest
 * record. (Neo IDs are never stored, so there's nothing of that kind to
 * erase.) Scoped to the user's own personalization data — reported issues aren't
 * touched, since those are support records the admin may still need to act on,
 * akin to a support ticket. A no-op if the user never tracked any interest. */
```

Replace with:

```ts
/** Self-service data erasure: removes this account and every tracked-interest
 * record. If the user opted into saving their own Neo ID (auth/neoIdVault.ts),
 * that goes too — it lives on the same User row. Scoped to the user's own
 * personalization data — reported issues aren't touched, since those are
 * support records the admin may still need to act on, akin to a support
 * ticket. A no-op if the user never tracked any interest or saved a Neo ID. */
```

- [ ] **Step 4: Add the saved-Neo-ID management block to the dashboard**

In `app/dashboard/page.tsx`, add the import:

```ts
import { forgetNeoId } from "@/auth/neoIdVaultActions";
```

Then find:

```tsx
      <div className="callout" style={{ marginBottom: 18 }}>
        <span className="ci">✓</span>
        <div>
          Wondering if you got shortlisted? <Link href="/search" style={{ color: "var(--info)", fontWeight: 600 }}>Check your Neo ID</Link>.
          It&rsquo;s entered fresh each session and <b>never saved</b> — so it&rsquo;s not shown here, by design.
        </div>
      </div>
```

Replace with:

```tsx
      <div className="callout" style={{ marginBottom: 18 }}>
        <span className="ci">✓</span>
        <div>
          Wondering if you got shortlisted? <Link href="/search" style={{ color: "var(--info)", fontWeight: 600 }}>Check your Neo ID</Link>.
          It&rsquo;s never stored for the check itself — only saved here if you opt in on that page.
        </div>
      </div>

      {user?.neoIdEncrypted && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panelhead">
            <h3>Saved Neo ID</h3>
          </div>
          <div className="formrow">
            <span className="mono">•••••••• saved, encrypted — used to pre-fill Check shortlist</span>
            <form action={forgetNeoId} style={{ marginLeft: "auto" }}>
              <button type="submit" className="btn danger">
                Forget it
              </button>
            </form>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Run the dashboard action tests**

Run: `npx vitest run app/dashboard/actions.test.ts`
Expected: PASS, all tests including the new one.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, save a Neo ID on `/search`, then visit `/dashboard` — confirm the "Saved Neo ID" panel appears with a working "Forget it" button, and disappears once clicked.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/actions.ts app/dashboard/actions.test.ts
git commit -m "Add saved Neo ID management to the dashboard"
```

---

### Task 8: Remaining privacy-copy touch-ups

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/components/SiteFooter.tsx`

**Interfaces:** None — pure copy.

- [ ] **Step 1: Update the home page explainer**

In `app/page.tsx`, find:

```tsx
        <div className="panel">
          <h3>Check your shortlist</h3>
          <p className="psub" style={{ marginBottom: 0 }}>
            Enter your Neo ID to see who shortlisted you. It&rsquo;s matched against one-way fingerprints and never
            saved — no Neo ID, yours or anyone&rsquo;s, is ever stored.
          </p>
        </div>
```

Replace with:

```tsx
        <div className="panel">
          <h3>Check your shortlist</h3>
          <p className="psub" style={{ marginBottom: 0 }}>
            Enter your Neo ID to see who shortlisted you. It&rsquo;s matched against one-way fingerprints and never
            stored for the check itself — you can optionally save your own Neo ID to your account afterward, only
            if you choose to.
          </p>
        </div>
```

- [ ] **Step 2: Update the site footer disclosure**

In `app/components/SiteFooter.tsx`, find:

```tsx
      <p>
        <strong>We do not store Neo IDs.</strong> Shortlist matching uses irreversible one-way fingerprints of the IDs
        in shortlist mails — no Neo ID is ever kept in the database — and your own Neo ID is used only during your
        session and is never saved.
      </p>
```

Replace with:

```tsx
      <p>
        <strong>Shortlist matching never stores a Neo ID.</strong> It uses irreversible one-way fingerprints of the
        IDs in shortlist mails. Separately, you can choose to save your own Neo ID to your account, encrypted,
        purely for autofill convenience — never on by default, and removable any time from your dashboard.
      </p>
```

- [ ] **Step 3: Verify no stale claims remain**

Run: `grep -rn "never saved\|never stor\|not stored\|do not store" app/ --include="*.tsx"`
Expected: only the intentionally nuanced copy from Tasks 6–8 (e.g. "never stored for the check itself"), nothing claiming a blanket "never stored" for all Neo IDs.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/components/SiteFooter.tsx
git commit -m "Update Neo ID privacy copy for the opt-in save feature"
```

---

### Task 9: Vercel Speed Insights

**Files:**
- Modify: `package.json`
- Modify: `app/layout.tsx`

**Interfaces:** None.

**Note on cost:** the `@vercel/speed-insights` package itself is free to install and use — Vercel's free (Hobby) plan includes Speed Insights with a capped monthly data-point allowance; usage beyond that cap is a paid-plan feature. This task only wires up the SDK; whether collection is actually free in practice depends on the Vercel plan and dashboard toggle for this project, which isn't something visible from the repo.

- [ ] **Step 1: Install the package**

Run: `npm install @vercel/speed-insights@^2.0.0`
Expected: added to `dependencies` in `package.json`.

- [ ] **Step 2: Add the component to the root layout**

In `app/layout.tsx`, add the import alongside the existing ones:

```tsx
import { SpeedInsights } from "@vercel/speed-insights/next";
```

Then find:

```tsx
      <body>
        <AppShell email={email} isAdmin={role === "admin"} isSignedIn={Boolean(session)}>
          <main className="content">{children}</main>
          <SiteFooter />
        </AppShell>
      </body>
```

Replace with:

```tsx
      <body>
        <AppShell email={email} isAdmin={role === "admin"} isSignedIn={Boolean(session)}>
          <main className="content">{children}</main>
          <SiteFooter />
        </AppShell>
        <SpeedInsights />
      </body>
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds successfully with no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/layout.tsx
git commit -m "Add Vercel Speed Insights"
```

---

## After all tasks

Run the full suite once more before considering this done:

```bash
npx vitest run
npm run lint
npm run build
```

Then, before this ever reaches production, run the migration from Task 2 (`prisma/migrations/20260726000000_neo_id_vault/migration.sql`) against Neon, and set `NEO_ID_ENC_SECRET` in the production environment — the app will fail to start without it (per `env.ts`'s `z.string().min(1)`).
