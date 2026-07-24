import { PrismaClient } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let cachedMigrationSql: string | null = null;

function getMigrationSql(): string {
  if (cachedMigrationSql) return cachedMigrationSql;

  const migrationDir = mkdtempSync(path.join(tmpdir(), "ptracker-test-"));
  const outputPath = path.join(migrationDir, "init.sql");
  execSync(
    `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > "${outputPath}"`,
    { cwd: process.cwd() }
  );
  cachedMigrationSql = readFileSync(outputPath, "utf-8");
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
