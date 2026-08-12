import pg from "pg";
import { runMigrations } from "../../scripts/lib/migrate-core.js";
import { loadCorpusFile, validateCorpus, importPrompts } from "../../scripts/lib/import-core.js";

/**
 * Vitest globalSetup — runs once, before any test file, in its own isolated
 * context (no module state shared with the test files themselves).
 *
 * Fails closed: if TEST_DATABASE_URL isn't set, this throws immediately and
 * `vitest run` exits non-zero with a clear message instead of silently
 * skipping the database-backed suite or falling back to DATABASE_URL (which
 * might point at a real developer/production database).
 *
 * Responsibility here is limited to getting the schema in place and the
 * canonical corpus imported exactly once — individual test files are
 * responsible for their own mutation cleanup (they use unique markers or
 * delete what they create) so this doesn't need to run per-file.
 */
export default async function globalSetup() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set. The api/ test suite requires a real, " +
        "disposable PostgreSQL database for its persistence tests — set " +
        "TEST_DATABASE_URL to a database you're OK truncating, e.g. " +
        "postgresql://user:pass@localhost:5432/prompt_library_test. " +
        "Refusing to guess or fall back to DATABASE_URL."
    );
  }

  const client = new pg.Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    const { applied, skipped } = await runMigrations(client);
    console.log(`[test setup] migrations applied=${applied.length} skipped=${skipped.length}`);

    const corpus = loadCorpusFile();
    const errors = validateCorpus(corpus);
    if (errors.length) {
      throw new Error(`Corpus validation failed: ${errors.slice(0, 5).join("; ")}`);
    }

    const result = await importPrompts(client, corpus, { force: false });
    console.log(
      `[test setup] seed: total=${result.total} inserted=${result.inserted} unchanged=${result.unchanged}`
    );
  } finally {
    await client.end();
  }
}
