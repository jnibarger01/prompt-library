import pg from "pg";

/**
 * Single PostgreSQL connection pool abstraction.
 *
 * - Reads DATABASE_URL lazily (at first query time), never at module load,
 *   so importing this module can never crash a process that hasn't
 *   configured a database yet (see startup policy below).
 * - Never falls back to another datastore (data/prompts.json, SQLite,
 *   an in-memory map, etc.) if the database is unset or unreachable —
 *   every failure surfaces as a clearly-typed error instead.
 * - Never includes the connection string (which contains credentials) in
 *   any thrown error, log line, or HTTP response.
 *
 * STARTUP POLICY (documented, chosen explicitly):
 *   The API process starts regardless of database availability. Routes
 *   that need the database will fail per-request (500, or 503 from
 *   /health) if PostgreSQL is unreachable, rather than crash-looping the
 *   whole process at boot. This is simpler to operate (no startup race
 *   against a database that's still booting in the same deploy) and keeps
 *   a transient DB blip from taking the whole API down. The tradeoff is
 *   that a fully-misconfigured deployment won't fail loudly at startup —
 *   /health and db:check exist specifically to catch that.
 */

let pool = null;
let poolConnectionString = null;

/** Thrown when DATABASE_URL is not configured at all. */
export class DatabaseConfigError extends Error {
  constructor() {
    super("Database is not configured.");
    this.name = "DatabaseConfigError";
  }
}

/** Thrown when DATABASE_URL is configured but PostgreSQL could not be reached. */
export class DatabaseUnavailableError extends Error {
  constructor(cause) {
    super("Database is unavailable.");
    this.name = "DatabaseUnavailableError";
    // Keep the cause out of `message` (which routes may end up logging or
    // exposing) — only attach it as a non-enumerable-ish debug aid.
    this.cause = cause;
  }
}

/**
 * Returns the shared pg.Pool, creating (or recreating, if the configured
 * connection string changed — only happens in tests) it on demand.
 */
export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseConfigError();
  }

  if (pool && poolConnectionString === connectionString) {
    return pool;
  }

  if (pool) {
    // Connection target changed underneath us (test suites do this
    // deliberately between runs). Let the old pool drain in the
    // background; callers only ever see the new one.
    pool.end().catch(() => {});
  }

  pool = new pg.Pool({ connectionString });
  poolConnectionString = connectionString;

  // A pool-level "error" event fires for idle-client errors (e.g. the
  // server terminated a connection). Without a handler, Node treats these
  // as uncaught exceptions and crashes the process. Log only a minimal,
  // credential-free summary.
  pool.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(`[db] pool error: ${err.code || err.name || "unknown"}`);
  });

  return pool;
}

/** Runs a trivial query to confirm the database is reachable. Returns boolean, never throws. */
export async function checkDatabaseHealth() {
  try {
    const p = getPool();
    await p.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Closes the pool. Used on graceful shutdown and between test runs. */
export async function closePool() {
  if (pool) {
    await pool.end().catch(() => {});
  }
  pool = null;
  poolConnectionString = null;
}
