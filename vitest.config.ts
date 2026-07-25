import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // Generate the schema SQL once up front rather than letting every worker
    // shell out to `prisma migrate diff` at the same time on a cold cache.
    globalSetup: [path.resolve(__dirname, "db/warmTestSchemaCache.ts")],
    // PGlite (WASM Postgres) cold-starts per test file; under full-suite
    // parallel execution that can exceed Vitest's 5s default, even though
    // each step is fast in isolation.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
