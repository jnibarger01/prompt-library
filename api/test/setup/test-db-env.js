/**
 * Vitest setupFile — runs inside each test file's own context (unlike
 * globalSetup, which runs once in isolation). Points the application's
 * DATABASE_URL at the explicitly-configured TEST_DATABASE_URL for the
 * lifetime of this test process only.
 *
 * This is the boundary that keeps tests off a developer/production
 * database: prompt-store.js / db/pool.js only ever read DATABASE_URL, and
 * this file is the single place that decides what DATABASE_URL means while
 * tests are running.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Refusing to run database-backed tests " +
      "without an explicit, disposable test database."
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
