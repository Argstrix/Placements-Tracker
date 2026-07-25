# Retired-Company Storage Reclamation — Design

**Date:** 2026-07-25
**Status:** Approved for planning

## Problem

Two free-tier storage ceilings are on a collision course with an
ever-growing archive:

- **Vercel Blob** holds every non-shortlist attachment (JDs as PDF/DOCX,
  typically ~0.5 MB each). Nothing has ever deleted one. This is the
  dominant pressure.
- **Neon Postgres** caps at 0.5 GB. `ShortlistHash` is the largest table
  by a wide margin, and `IngestionLog` grows without bound.

Once a company's drive is over and its final shortlist has been
announced — a *retired* company — its attachments have no remaining
value. Its records still do.

The schema currently has no concept of retirement at all.

## Goals

1. Reclaim blob storage for retired companies via a cascading delete.
2. Reduce Postgres footprint **without deleting company records, mail
   history, mail body text, or shortlist data.**
3. Keep the reclamation automatic, so storage does not depend on the
   admin remembering to act.

## Non-goals

- Deleting companies, mail events, body text, or shortlist hashes. Every
  one of these is retained permanently.
- Restoring purged attachments. Blob deletion is one-way and the UI must
  say so.
- Any change to who can access what. Auth and the attachment proxy gate
  are untouched.

## Decisions

| Question | Decision |
|---|---|
| How does a company retire? | Automatic daily sweep, with admin override both ways |
| Retirement thresholds | 30d after last mail when a `RESULT` event exists; 120d total idle otherwise |
| Shortlist hashes for retired companies | **Kept in full** — lookups work forever |
| `MailEvent.bodyText` for retired companies | **Kept** — the compliance disclaimer depends on it |
| Purged attachments | Tombstoned, not deleted — row survives with `blobUrl = NULL` |

`bodyText` is retained deliberately. It is only a few MB per year once
TOAST-compressed, and the site's disclaimer ("always cross-check against
the original mail shown on each page") is the project's core compliance
posture. Deleting it to save single-digit megabytes would be a bad trade.

## Where the sweep runs

Folded into the existing `/api/cron/retry-failed` daily job, which
becomes `sync → retry → reclaim`.

Rejected alternatives:

- **A dedicated cron route.** `vercel.json` already defines two cron
  jobs and Vercel Hobby caps a project at two. A third breaks the
  deploy.
- **Retire-on-write during ingestion.** Structurally broken: a company
  becomes retirable *because* mail stopped arriving, so an
  ingestion-triggered check would never fire for the companies that
  need it.

The reclaim phase is wrapped so that a failure inside it cannot mask or
abort the sync/retry phases — those are the load-bearing ones. The whole
sweep is idempotent and batch-bounded, so a mid-run timeout simply
resumes on the next day's run.

## Data model

```prisma
model Company {
  // ...existing fields
  retiredAt DateTime?   // set by sweep or by admin
  purgedAt  DateTime?   // set once blob deletion for this company completed

  @@index([retiredAt])
}

model Attachment {
  // ...existing fields
  blobUrl   String?     // was non-null; NULLed on purge
  purgedAt  DateTime?
  mailEvent MailEvent @relation(fields: [mailEventId], references: [id], onDelete: Cascade)
}

model ShortlistHash {
  id     BigInt @id @default(autoincrement())  // was String @default(cuid())
  idHash Bytes                                  // was String (64-char hex)
  round  String?
  mailEventId String
  mailEvent   MailEvent @relation(fields: [mailEventId], references: [id], onDelete: Cascade)
  // createdAt dropped — redundant with mailEvent.receivedAt

  @@index([idHash])
}

model IngestionLog {
  // ...existing fields
  gmailMessageId String @unique   // NEW
}
```

`onDelete: Cascade` on the two `MailEvent` relations is a correctness
backstop against orphaned rows if a hard delete is ever added. It is
**not** the mechanism used here — this feature never deletes a
`MailEvent`.

### `ShortlistHash` compaction

`hashNeoId` changes from returning a 64-character hex string to
returning 16 raw bytes:

```ts
export function hashNeoId(neoId: string): Buffer {
  const pepper = process.env.NEO_ID_HASH_SECRET ?? "";
  const normalized = neoId.trim().toUpperCase();
  return createHash("sha256").update(`${pepper}:${normalized}`).digest().subarray(0, 16);
}
```

Per-row footprint, including index tuples:

| | Current | Compacted |
|---|---|---|
| Heap tuple (incl. item pointer) | ~164 B | ~92 B |
| PK index | ~44 B | ~20 B |
| `idHash` index | ~84 B | ~36 B |
| **Total** | **~292 B** | **~148 B** |

Roughly a 50% reduction on the largest table, losing nothing. These are
estimates from tuple layout, not measurements — the plan should capture
actual `pg_total_relation_size` before and after.

**Security note.** Truncating to 128 bits is safe here. Collision
probability across ~10⁵ rows against a 2¹²⁸ space is negligible, and
preimage resistance never came from digest length — it comes from
`NEO_ID_HASH_SECRET`, which is unchanged. Neo IDs remain unstored and
unrecoverable from a leaked database. The privacy posture documented in
`prisma/schema.prisma` and `ingestion/hashNeoId.ts` is preserved
verbatim.

### `IngestionLog` uniqueness

Making `gmailMessageId` unique and writing via upsert is a bug fix as
much as a storage fix.

`ingestion/retryFailedIngestions.ts:23` currently calls `findMany` with
no `take` and a `distinct` that Prisma applies **client-side** — it
loads the entire table into memory every night. With uniqueness
enforced, that becomes an indexed `where: { status: "FAILED" }`, and
`getIngestionLogSummary` drops its `distinct` too. The table is
permanently bounded to one row per mail ever ingested.

`retryCount` semantics are preserved: the upsert increments it on
failure rather than inserting a new row.

**Time-windowed pruning of `IngestionLog` was considered and
rejected.** `ingestion/syncGmailLabel.ts:24` uses `SUCCESS` rows as the
"already ingested" guard. Deleting them would cause still-labeled mail
to be re-ingested, collide with the `MailEvent.gmailMessageId` unique
constraint, fail, and enter a permanent retry loop. Collapsing to one
row per mail is safe; deleting rows is not.

## The cascade

Application-level, top-down, resumable:

```
company where retiredAt IS NOT NULL AND purgedAt IS NULL
  └─ each MailEvent
      └─ each Attachment where blobUrl IS NOT NULL
          ├─ del(blobUrl)                      ← Vercel Blob
          └─ blobUrl = NULL, purgedAt = now()  ← tombstone
  └─ company.purgedAt = now()
```

Each attachment is committed individually rather than wrapping the
company in one transaction. Blob deletion is an external side effect
that cannot participate in a database transaction; committing per
attachment means an interrupted run leaves a consistent partial state
that the next run finishes. `del()` on an already-deleted blob is
treated as success.

`company.purgedAt` is set only after every attachment beneath it has
been processed, so it is a reliable "nothing left to do here" marker.

### Retirement predicate

A company is retirable when `retiredAt IS NULL` and either:

- its timeline contains a `RESULT` mail event **and** its most recent
  mail event is older than `RETIRE_AFTER_RESULT_DAYS` (default 30), or
- its most recent mail event is older than `RETIRE_AFTER_IDLE_DAYS`
  (default 120), regardless of event type.

Companies with no mail events at all are never retired.

Both thresholds are read from the environment with defaults, so no
`.env` change is required to deploy. `RECLAIM_BATCH_SIZE` (default 200)
bounds attachments processed per run.

These three are added to `env.ts` as
`z.coerce.number().int().positive().default(...)`. Unlike every existing
entry in that schema they are optional, so an unset variable is not a
startup failure. They are documented in `.env.example` as tunables.

### Admin override

The admin dashboard gains a retention panel: retire a company early, or
un-retire one. Retiring early sets `retiredAt` only — the blob purge
happens on the next nightly sweep, not synchronously, so the admin
action stays fast and the purge path has exactly one implementation.
Un-retiring clears `retiredAt` and `purgedAt` but **cannot restore
deleted blobs** — the confirmation UI states this before the action is
taken.

### Late mail for a retired company

If a mail arrives for an already-retired company — a delayed offer
letter, joining instructions — `ingestMail` clears that company's
`retiredAt` and `purgedAt` when it links the new mail to the timeline.
The company re-enters the live pool and becomes eligible for retirement
again only once the thresholds are met afresh.

Attachments already tombstoned stay tombstoned; the new mail's
attachments upload and are served normally. This is the safety valve
that makes the 30-day threshold acceptable: a premature retirement is
self-correcting for everything except blobs already deleted.

## Read-path changes

- `app/api/attachments/[id]/route.ts` and `.../render/route.ts` return
  **410 Gone** when `blobUrl` is null, after the existing auth checks.
  The null check must not leak attachment existence to unauthenticated
  callers.
- `app/components/MailEventCard.tsx` renders a muted "file removed to
  save storage" chip in place of the viewer link for tombstoned
  attachments.
- `queries/searchNeoId.ts` and the shortlist checker are unaffected in
  behaviour — only the hash's wire type changes.

## Migration

`prisma/migrations/` is configured in `prisma.config.ts` but empty;
production has been deployed with `prisma db push`. The `ShortlistHash`
type changes are destructive under `db push`, so this ships as a
hand-written SQL migration run against Neon:

1. Add nullable columns to `Company` and `Attachment`.
2. Add `ShortlistHash.id_hash_bytes BYTEA`, populate with
   `decode(substring(id_hash, 1, 32), 'hex')`, drop `id_hash`, rename.
   This is derivable from existing rows — no re-hashing, no data loss,
   and existing shortlist lookups continue to match.
3. Swap `ShortlistHash.id` to `BIGSERIAL`, drop `created_at`.
4. De-duplicate `IngestionLog` down to the latest row per
   `gmail_message_id`, then add the unique constraint.

Tests are unaffected by migration ordering: `db/testClient.ts` builds
each test database from `prisma migrate diff --from-empty --to-schema`,
so they always reflect the final schema.

## Module layout

New directory `retention/`, mirroring the existing `ingestion/` and
`queries/` conventions — dependency-injected, no direct imports of the
production Prisma client or `@vercel/blob`:

| Module | Responsibility |
|---|---|
| `retention/retirementPredicate.ts` | Pure: given mail events + thresholds + now, is this company retirable? |
| `retention/retireCompanies.ts` | Query candidates, set `retiredAt` |
| `retention/purgeRetiredBlobs.ts` | Walk the cascade, delete blobs, tombstone rows (takes `deleteBlob` as a dependency) |
| `retention/reclaimStorage.ts` | Orchestrates the two above; called by the cron route |
| `retention/deleteBlob.ts` | Thin `@vercel/blob` `del()` wrapper, mirroring `ingestion/uploadAttachment.ts` |

## Testing

Vitest against PGlite, matching existing patterns:

- **Predicate:** `RESULT` + 30d fires; `RESULT` + 29d does not; no
  `RESULT` + 120d fires; no `RESULT` + 119d does not; already-retired
  skipped; zero-mail company skipped.
- **Cascade:** blobs deleted via an injected fake, rows tombstoned with
  `purgedAt` set, `company.purgedAt` set, and a second run is a no-op.
- **Resumability:** injected `deleteBlob` throws partway through — state
  stays consistent, `company.purgedAt` stays null, rerun completes.
- **Hash migration:** a fixture proving old hex rows map to byte-identical
  new values, so a Neo ID that matched before still matches after.
- **`IngestionLog` upsert:** a failed retry increments `retryCount`
  without adding a row; `syncNewMailFromLabel` still skips succeeded
  mail.
- **Late mail:** ingesting a mail for a retired company clears
  `retiredAt`/`purgedAt` and leaves existing tombstones intact.
- **Routes:** 410 on a purged attachment, 401/403 precedence preserved.
- **Admin actions:** retire/un-retire require the admin role; retiring
  early does not purge synchronously.

## Expected outcome

- Blob usage for retired drives drops to **zero** — the dominant win.
- `ShortlistHash` footprint roughly halves.
- `IngestionLog` permanently bounded to one row per mail, and no longer
  fully loaded into memory each night.
- No company, mail event, body text, or shortlist hash is ever deleted.
