import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // PGlite (WASM Postgres) cold-starts plus a `prisma migrate diff`
    // shell-out per test file; under full-suite parallel execution that can
    // exceed Vitest's 5s default, even though each step is fast in isolation.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
