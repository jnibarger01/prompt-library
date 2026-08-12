import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// api/scripts/lib -> api/scripts -> api -> api/migrations
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "migrations");

/**
 * Applies any migration files under api/migrations that haven't been
 * recorded in schema_migrations yet, each in its own transaction, in
 * filename order. No ORM: migrations are plain, readable SQL files.
 *
 * Idempotent — safe to run every deploy. Already-applied migrations are
 * skipped.
 *
 * @param {import("pg").Client | import("pg").PoolClient} client - already-connected
 * @returns {Promise<{applied: string[], skipped: string[]}>}
 */
export async function runMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await client.query("SELECT version FROM schema_migrations");
  const alreadyApplied = new Set(rows.map((r) => r.version));

  const applied = [];
  const skipped = [];

  for (const file of files) {
    if (alreadyApplied.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      applied.push(file);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  return { applied, skipped };
}
