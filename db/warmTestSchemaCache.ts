import { getMigrationSql } from "./testClient";

/**
 * Vitest globalSetup: builds the schema SQL once, in the main process, before
 * any worker starts.
 *
 * Each worker needs this SQL to create its database. Without a warm cache they
 * all shell out to `prisma migrate diff` simultaneously on the first run after
 * any schema edit — a few seconds each in isolation, but enough contention with
 * a dozen workers to blow the hook timeout and fail unrelated tests. Doing it
 * once up front costs one invocation and makes a cold run behave like a warm one.
 */
export default function setup(): void {
  getMigrationSql();
}
