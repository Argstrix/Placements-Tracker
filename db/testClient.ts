import { PrismaClient } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

// Vitest runs each test file in its own worker, so an in-memory module cache
// doesn't share across files — every file would otherwise re-spawn a
// `prisma migrate diff` subprocess. Caching to disk, keyed off the schema's
// mtime, means only the first test file in a run pays that cost.
const CACHE_DIR = path.join(process.cwd(), "node_modules", ".cache", "ptracker-test-db");
const CACHE_SQL_PATH = path.join(CACHE_DIR, "migration.sql");
const CACHE_META_PATH = path.join(CACHE_DIR, "migration.meta");
const SCHEMA_PATH = path.join(process.cwd(), "prisma", "schema.prisma");

let cachedMigrationSql: string | null = null;

export function getMigrationSql(): string {
  if (cachedMigrationSql) return cachedMigrationSql;

  const schemaMtime = String(statSync(SCHEMA_PATH).mtimeMs);
  if (existsSync(CACHE_SQL_PATH) && existsSync(CACHE_META_PATH)) {
    const cachedMeta = readFileSync(CACHE_META_PATH, "utf-8");
    if (cachedMeta === schemaMtime) {
      cachedMigrationSql = readFileSync(CACHE_SQL_PATH, "utf-8");
      return cachedMigrationSql;
    }
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  // Capture stdout rather than letting the shell redirect into the cache file.
  // Workers start in parallel, so on the first run after a schema edit several
  // of them regenerate at once; with `>` they all held the same file open and
  // every one but the first died with EBUSY. Writing via a worker-unique temp
  // file and renaming into place makes concurrent regeneration harmless — the
  // output is identical, so last writer wins with a complete file either way.
  const sql = execSync("npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script", {
    cwd: process.cwd(),
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });

  // Populating the cache is an optimization, never a correctness requirement —
  // the SQL is already in hand. On Windows a rename over a file another worker
  // currently holds open fails with EPERM, so a lost race here just means that
  // worker regenerates too. Swallow it rather than failing an unrelated test.
  try {
    const tmpSuffix = `.${process.pid}.tmp`;
    writeFileSync(CACHE_SQL_PATH + tmpSuffix, sql);
    renameSync(CACHE_SQL_PATH + tmpSuffix, CACHE_SQL_PATH);
    // Meta last: a reader that sees a matching mtime must be able to trust that
    // the SQL beside it is already complete.
    writeFileSync(CACHE_META_PATH + tmpSuffix, schemaMtime);
    renameSync(CACHE_META_PATH + tmpSuffix, CACHE_META_PATH);
  } catch {
    // Cache miss next time; nothing else is affected.
  }

  cachedMigrationSql = sql;
  return cachedMigrationSql;
}

/** A fresh, isolated, in-memory Postgres-compatible database per call — real
 * Postgres semantics via PGlite, no daemon or network connection required. */
export async function createTestPrismaClient(): Promise<PrismaClient> {
  const client = new PGlite();
  const sql = getMigrationSql();
  await client.exec(sql);

  const adapter = new PrismaPGlite(client);
  return new PrismaClient({ adapter });
}
