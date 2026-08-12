import { defineConfig } from "vitest/config";

/**
 * Slice 4 moves the test suite onto a real, shared PostgreSQL database
 * (see test/setup/*.js). Test files therefore can no longer be assumed
 * isolated-by-default the way they were with per-process in-memory state —
 * running them concurrently would let mutation tests and read/count tests
 * race against each other over the same rows. fileParallelism is disabled
 * so files run one at a time against the shared test database; individual
 * `it` blocks within a file still run in the order they're declared.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    globalSetup: ["./test/setup/global-setup.js"],
    setupFiles: ["./test/setup/test-db-env.js"],
  },
});
