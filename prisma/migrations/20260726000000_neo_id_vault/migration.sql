-- Opt-in, encrypted Neo ID save (auth/neoIdVault.ts) — unrelated to the
-- one-way ShortlistHash system, which is untouched by this migration.
--
-- Both columns are nullable additions, so this is non-destructive and safe
-- to run before or after deploy. Run against Neon before deploying, per the
-- project's existing convention (see the 20260725000000_storage_reclamation
-- migration for the same pattern).

ALTER TABLE "User" ADD COLUMN "neoIdEncrypted" BYTEA;
ALTER TABLE "User" ADD COLUMN "neoIdPromptDismissedAt" TIMESTAMP(3);
