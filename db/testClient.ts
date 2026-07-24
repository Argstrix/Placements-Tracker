import { PrismaClient } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

function getMigrationSql(): string {
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
  execSync(
    `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > "${CACHE_SQL_PATH}"`,
    { cwd: process.cwd() }
  );
  writeFileSync(CACHE_META_PATH, schemaMtime);
  cachedMigrationSql = readFileSync(CACHE_SQL_PATH, "utf-8");
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
