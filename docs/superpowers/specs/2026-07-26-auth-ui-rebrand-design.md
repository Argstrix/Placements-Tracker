# Auth UI, Rebrand & Optional Neo ID Save — Design

**Date:** 2026-07-26
**Status:** Approved for planning

## Problem

Three separate asks, bundled because they touch the same files:

1. Sign-in/sign-out currently go through NextAuth's default, unstyled
   `/api/auth/signin` and `/api/auth/signout` pages — jarring next to the
   rest of the app's designed UI.
2. The app is branded "Placement Board" in the sidebar, mobile top bar,
   and page title. It should read "Placement Tracker."
3. Users want a way to save their own Neo ID to their account so they
   don't have to retype it on `/search` every visit — but only if they
   explicitly opt in.

## Goals

1. Custom, on-brand sign-in and sign-out pages, standalone (no sidebar
   chrome — there's nothing to navigate to pre-auth anyway).
2. Rename "Placement Board" → "Placement Tracker" everywhere it's
   user-visible.
3. Let a signed-in user optionally save their own Neo ID, encrypted at
   rest, with an explicit yes/no ask — never stored on a default or a
   pre-checked box, and never asked more than once.

## Non-goals

- Changing which routes require auth. `/` stays public; every other
  route already redirects to sign-in via `proxy.ts`'s existing
  middleware matcher. `noindex` is already set in `layout.tsx` and needs
  no change.
- Touching the shortlist-matching system (`ShortlistHash`, `hashNeoId`,
  `searchNeoId`). Those Neo IDs — everyone's, extracted from placement
  mail — remain one-way hashed and never linked to an identity. This
  spec adds a completely separate, narrower thing: a user's own Neo ID,
  saved only to their own account, only if they choose to.
- Any new OAuth provider. Google via NextAuth stays the only sign-in
  method.
- `next-auth/react` / `SessionProvider`. Nothing in the app uses them
  today (everything is server components + `getServerSession`); the new
  pages follow that pattern rather than introducing client-side session
  state.

## Decisions

| Question | Decision |
|---|---|
| Home page (`/`) gating | Stays public — landing page only, no real data on it |
| Sign-in/out page chrome | Standalone, no sidebar |
| Neo ID save mechanism | Server-side, encrypted at rest (not localStorage) |
| Where the save is offered | Inline on `/search`, after a signed-in user with no saved ID runs a check |
| Re-asking | Never, once answered either way |

## 1. Rebrand

"Placement Board" → "Placement Tracker" in:

- `app/components/AppShell.tsx` — sidebar brand (`<b>Placement Board</b>`)
  and mobile top bar (`<b>Placement Board</b>`)
- `app/layout.tsx` — `metadata.title`
- `app/globals.css` — header comment (cosmetic only)

No copy elsewhere in the app names the product, so this is the full
scope.

## 2. Sign-in / sign-out pages

New routes:

- `app/auth/signin/page.tsx`
- `app/auth/signout/page.tsx`

Wired via `pages: { signIn: "/auth/signin", signOut: "/auth/signout" }`
added to `buildAuthOptions()` in `auth/authOptions.ts`. This is
NextAuth v4's documented mechanism for custom pages — it does not change
any provider or callback behavior, only which URL is used for the UI.

Both are server components, no client JS, using `getCsrfToken()` from
`next-auth/react` (server-safe, does not require `SessionProvider`) plus
a plain HTML form:

- **Sign-in** — `<form method="post" action="/api/auth/signin/google">`
  with a hidden `csrfToken` field and a "Sign in with Google" submit
  button. Brand mark, one-line pitch, and a note that sign-in is
  restricted to current-batch `vitstudent.ac.in` accounts (the existing
  `isAuthorized` check still runs in the `signIn` callback — this page
  only changes presentation, not who gets in). If `?error=` is present
  (NextAuth appends this on a rejected sign-in), show a plain-language
  message — "Your account isn't authorized. Sign-in is limited to
  current-batch VIT accounts." — instead of the raw NextAuth error code.
- **Sign-out** — `<form method="post" action="/api/auth/signout">` with
  a hidden `csrfToken` field, a "Sign out of Placement Tracker" heading,
  and a submit button. A POST form (not a bare link) is required by
  NextAuth for sign-out and has the side benefit of no accidental
  sign-outs from prefetch/crawlers.

Both forms redirect back to `/` on completion (NextAuth's default
`callbackUrl` behavior; sign-in additionally honors an explicit
`callbackUrl` query param the way `proxy.ts` already sets one when
redirecting a protected-route visit to sign-in).

**Layout.** `app/layout.tsx`'s root layout always wraps children in
`AppShell`. Rather than introduce a second root layout via route groups
for two pages, `AppShell` checks `pathname.startsWith("/auth/")` and, for
that case, renders `children` inside a plain centered wrapper (brand
mark + theme toggle only) instead of the full rail/nav. This is a
small, local change to an already-client component that already reads
`pathname`.

**Sidebar link.** `AppShell.tsx`'s existing sign-in/out link
(`href={isSignedIn ? "/api/auth/signout" : "/api/auth/signin"}`) is
repointed at `/auth/signout` / `/auth/signin`.

**New CSS.** A small `.authwrap` / `.authcard` block in `globals.css`
for the centered single-card layout, reusing existing tokens (`--card`,
`--hair`, `--r`) rather than introducing new ones.

## 3. Optional Neo ID save

### Data model

Two new nullable columns on `User`:

```prisma
model User {
  id        String     @id @default(cuid())
  email     String     @unique
  interests Interest[]
  createdAt DateTime   @default(now())

  neoIdEncrypted          Bytes?     // iv (12B) || authTag (16B) || ciphertext; null = not saved
  neoIdPromptDismissedAt  DateTime?  // set the first time the user answers yes OR no; null = never asked
}
```

No new table — this is per-user, singular, and doesn't need history.

### Encryption

New module `auth/neoIdVault.ts`, mirroring the existing
`ingestion/hashNeoId.ts` style:

```ts
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest(); // 32 bytes, for AES-256
}

export function encryptNeoId(neoId: string, secret: string): Buffer {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(neoId.trim().toUpperCase(), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptNeoId(blob: Buffer, secret: string): string {
  const key = deriveKey(secret);
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
```

**New secret:** `NEO_ID_ENC_SECRET`, added to `env.ts` alongside
`NEO_ID_HASH_SECRET` (`z.string().min(1)`, required — same treatment as
every other secret in that schema) and documented in `.env.example`.
Deliberately a **separate** secret from `NEO_ID_HASH_SECRET`: one is a
one-way pepper for the shortlist-matching system, the other is a
reversible key for this opt-in save feature. Keeping them independent
means a leak of one does not compromise the other.

### Server actions

New file `app/search/neoIdVaultActions.ts` (kept separate from the
existing `checkShortlist` in `app/search/actions.ts`, which stays
untouched):

- `saveNeoId(neoId: string): Promise<void>` — requires a session;
  upserts the `User` row, sets `neoIdEncrypted` and
  `neoIdPromptDismissedAt = now()`.
- `dismissNeoIdPrompt(): Promise<void>` — requires a session; upserts
  the `User` row, sets only `neoIdPromptDismissedAt = now()`, leaves
  `neoIdEncrypted` null.
- `forgetNeoId(): Promise<void>` — requires a session; sets
  `neoIdEncrypted = null` on the existing `User` row (leaves
  `neoIdPromptDismissedAt` as-is, so they aren't re-asked immediately
  after deliberately forgetting it).

`app/dashboard/page.tsx` additionally reads `neoIdEncrypted` (decrypting
only the boolean-ish "is it set" — the actual value is never rendered
outside the pre-filled search input) to show saved/not-saved state.

`ShortlistChecker.tsx` is passed whether the signed-in user already has
a saved Neo ID and, if so, the decrypted value to pre-fill the input
(decrypted server-side in `app/search/page.tsx`, a server component,
and passed down as a prop — never round-tripped through a client
fetch).

### UI flow on `/search`

`ShortlistChecker.tsx` (client component) gains a `savedState` prop:
`"none" | "asked" | "saved"` (derived server-side from the two columns:
`neoIdEncrypted` set → `"saved"`; else `neoIdPromptDismissedAt` set →
`"asked"`; else `"none"`).

- `"saved"` — input pre-filled with the decrypted value; no prompt.
- `"asked"` — normal flow, no prompt (they already answered).
- `"none"` — after a check completes (success or "not on any
  shortlist" — either way we know they typed a real ID), show an inline
  banner: *"Save this Neo ID to your account for next time?"* with
  **Save it** / **No, don't ask again** buttons, calling `saveNeoId` /
  `dismissNeoIdPrompt` respectively. Dismissing either way hides the
  banner immediately (optimistic) without a page reload.

### Dashboard

`app/dashboard/page.tsx` gains a small block next to the existing
"Tracking" panel:

- Saved: "Neo ID saved: •••••••• [Forget it]" — `forgetNeoId` action.
- Not saved (regardless of asked/not-asked): no block shown — avoids
  cluttering the dashboard with a call-to-action for something that
  belongs on `/search`, where the ID is actually used.

`deleteMyData` in `dashboard/actions.ts` is extended to also null out
both new columns when the account is deleted (it already deletes the
whole `User` row, so this is automatic — just updating the misleading
comment "Neo IDs are never stored, so there's nothing of that kind to
erase" to reflect the new reality).

## 4. Copy updates

Every place currently claiming Neo IDs are never stored needs the
narrower, accurate version — "used for shortlist matching" — rather
than a blanket claim:

- `app/page.tsx` — home page explainer panel
- `app/search/page.tsx` — page intro and the `callout` box
- `ShortlistChecker.tsx` — consent checkbox label
- `app/dashboard/page.tsx` — the "It's entered fresh each session..."
  callout
- `dashboard/actions.ts` — `deleteMyData` doc comment

Wording direction: *"Neo IDs used to check shortlists are matched
against one-way fingerprints and never stored. You can optionally save
your own Neo ID to your account, encrypted, so it's pre-filled next
time — only if you choose to, and you can forget it any time from your
dashboard."*

## Testing

Vitest, matching existing patterns (`db/testClient.ts` / PGlite where DB
access is involved):

- `neoIdVault.ts` — encrypt then decrypt round-trips to the original
  (case-normalized) value; different secrets produce non-matching
  ciphertext; tampering with the auth tag throws on decrypt (mirrors
  `hashNeoId.test.ts`'s structure).
- `saveNeoId` / `dismissNeoIdPrompt` / `forgetNeoId` — require a
  session; upsert correctly; `forgetNeoId` clears only the encrypted
  column, not the dismissed timestamp.
- `deleteMyData` — asserts both new columns are cleared alongside the
  existing interest/user deletion.
- `isAuthorized`/`authOptions` behavior is unaffected — the `pages`
  config only changes routing, not the `signIn` callback logic already
  covered by `authOptions.test.ts`.

No UI/browser test infra exists in this repo (tests are Vitest against
PGlite, not component/e2e tests), so the new pages and the
`ShortlistChecker` prompt flow are verified manually against the dev
server per the project's existing convention (see `DeleteMyDataButton`,
which has no test of its own either — only the action behind it does).

## Expected outcome

- Sign-in and sign-out feel like part of the app, not a NextAuth
  default screen.
- "Placement Tracker" is the name everywhere it's shown.
- A user can save their own Neo ID for convenience with a clear,
  reversible, explicit choice — and the shortlist-matching privacy
  invariant for *everyone else's* Neo IDs is untouched.
