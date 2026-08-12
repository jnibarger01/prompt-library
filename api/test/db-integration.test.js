import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCorpusFile, importPrompts } from "../scripts/lib/import-core.js";
import { getPool, closePool } from "../src/db/pool.js";
import { updatePrompt, queryPrompts } from "../src/services/prompt-store.js";
import { buildServer } from "../src/server.js";

/**
 * Storage-layer acceptance tests: migrations, import determinism/
 * idempotency, and the "don't clobber mutations" rerun guarantee. These
 * talk to PostgreSQL directly (not just through HTTP) because the things
 * being verified — row counts, source_order values, rerun behavior — are
 * storage facts, not HTTP contract facts.
 */
describe("PostgreSQL migrations + corpus import (Slice 4)", () => {
  let corpus;
  let corpusIds;

  beforeAll(async () => {
    corpus = loadCorpusFile();
    corpusIds = corpus.map((p) => p.id);
  });

  afterAll(async () => {
    await closePool();
  });

  it("migrations have been applied (schema_migrations records both migration files)", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT version FROM schema_migrations WHERE version = ANY($1::text[])",
      [["001_create_prompts.sql", "002_source_order_id_tiebreak_index.sql"]]
    );
    expect(rows.map((r) => r.version).sort()).toEqual([
      "001_create_prompts.sql",
      "002_source_order_id_tiebreak_index.sql",
    ]);
  });

  it("the prompts table has the expected columns and constraints", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'prompts' ORDER BY column_name`
    );
    const columns = Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable]));
    for (const col of [
      "id",
      "title",
      "prompt",
      "category",
      "tags",
      "characters",
      "words",
      "source_order",
      "created_at",
      "updated_at",
    ]) {
      expect(columns).toHaveProperty(col);
      expect(columns[col]).toBe("NO"); // NOT NULL on every one of these
    }
  });

  it("database constraints reject invalid rows (negative characters, empty title)", async () => {
    const pool = getPool();

    await expect(
      pool.query(
        `INSERT INTO prompts (id, title, prompt, category, tags, characters, words, source_order)
         VALUES ('constraint-test-negative', 'x', 'y', 'Other', '[]'::jsonb, -1, 0, 999999)`
      )
    ).rejects.toThrow(/violates check constraint/);

    await expect(
      pool.query(
        `INSERT INTO prompts (id, title, prompt, category, tags, characters, words, source_order)
         VALUES ('constraint-test-empty-title', '   ', 'y', 'Other', '[]'::jsonb, 1, 1, 999999)`
      )
    ).rejects.toThrow(/violates check constraint/);
  });

  it("import loaded exactly the full corpus (2,084 prompts), preserving every id", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT id FROM prompts WHERE id = ANY($1::text[])",
      [corpusIds]
    );
    expect(rows.length).toBe(corpus.length);
    expect(corpus.length).toBe(2084);
    const dbIds = new Set(rows.map((r) => r.id));
    for (const id of corpusIds) {
      expect(dbIds.has(id)).toBe(true);
    }
  });

  it("import preserved deterministic source order (source_order matches original array index)", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT id, source_order FROM prompts WHERE id = ANY($1::text[])",
      [corpusIds]
    );
    const sourceOrderById = new Map(rows.map((r) => [r.id, r.source_order]));
    corpus.forEach((p, index) => {
      expect(sourceOrderById.get(p.id)).toBe(index);
    });
  });

  it("GET-equivalent list ordering (ORDER BY source_order ASC, id ASC) matches the corpus file order", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT id FROM prompts WHERE id = ANY($1::text[]) ORDER BY source_order ASC, id ASC",
      [corpusIds]
    );
    expect(rows.map((r) => r.id)).toEqual(corpusIds);
  });

  it("breaks source_order ties deterministically by id ASC (Slice 5)", async () => {
    // The imported corpus never has duplicate source_order values (each row
    // gets its original array index), so this deliberately fabricates a tie
    // to prove the tie-breaker actually works, rather than assuming
    // PostgreSQL returns equal-key rows in any particular order.
    const pool = getPool();
    const tieSourceOrder = 999998;
    const idLower = "zzz-tie-break-aaa"; // sorts before idHigher
    const idHigher = "zzz-tie-break-bbb";
    const marker = "zzztiebreaksearchmarker";

    // Insert the alphabetically-later id FIRST, so a pass just relying on
    // insertion/physical order would return them in the wrong sequence.
    // Both rows share a unique tag so they can be isolated via search
    // regardless of how many other rows exist in their category.
    await pool.query(
      `INSERT INTO prompts (id, title, prompt, category, tags, characters, words, source_order)
       VALUES ($1, 'Tie test B', 'body b', 'Other', $2::jsonb, 6, 2, $3)`,
      [idHigher, JSON.stringify([marker]), tieSourceOrder]
    );

    try {
      await pool.query(
        `INSERT INTO prompts (id, title, prompt, category, tags, characters, words, source_order)
         VALUES ($1, 'Tie test A', 'body a', 'Other', $2::jsonb, 6, 2, $3)`,
        [idLower, JSON.stringify([marker]), tieSourceOrder]
      );

      const { rows } = await pool.query(
        "SELECT id FROM prompts WHERE source_order = $1 ORDER BY source_order ASC, id ASC",
        [tieSourceOrder]
      );
      expect(rows.map((r) => r.id)).toEqual([idLower, idHigher]);

      // Also prove it through the actual store function used by the routes,
      // not just a hand-written query.
      const { items } = await queryPrompts({ limit: 10, offset: 0, q: marker });
      expect(items.map((p) => p.id)).toEqual([idLower, idHigher]);
    } finally {
      await pool.query("DELETE FROM prompts WHERE id = ANY($1::text[])", [[idLower, idHigher]]);
    }
  });

  // importPrompts runs BEGIN/COMMIT across several statements, so it needs
  // one dedicated connection for the whole call — pool.query() alone would
  // let different statements land on different pooled connections and
  // break the transaction.
  async function runImport(options) {
    const client = await getPool().connect();
    try {
      return await importPrompts(client, corpus, options);
    } finally {
      client.release();
    }
  }

  it("rerunning the import (no --force) does not duplicate rows", async () => {
    const pool = getPool();
    const before = await pool.query("SELECT COUNT(*)::int AS n FROM prompts");

    const result = await runImport({ force: false });
    expect(result.inserted).toBe(0); // every corpus id already exists
    expect(result.unchanged).toBe(corpus.length);

    const after = await pool.query("SELECT COUNT(*)::int AS n FROM prompts");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("rerunning the import (no --force) does not overwrite a mutation made through the API", async () => {
    const targetId = corpusIds[0];
    const mutatedTitle = "MUTATED BY TEST — should survive a non-force reimport";

    const updated = await updatePrompt(targetId, { title: mutatedTitle });
    expect(updated.title).toBe(mutatedTitle);

    await runImport({ force: false });

    const pool = getPool();
    const { rows } = await pool.query("SELECT title FROM prompts WHERE id = $1", [targetId]);
    expect(rows[0].title).toBe(mutatedTitle); // NOT reverted to the corpus's original title

    // --force is the explicit, opt-in reset path: it DOES overwrite back to
    // the canonical corpus values. Use it here to restore state for any
    // other test file that reads this exact row, and to prove --force
    // actually does what it says.
    const forceResult = await runImport({ force: true });
    expect(forceResult.overwritten).toBeGreaterThan(0);

    const restored = await pool.query("SELECT title FROM prompts WHERE id = $1", [targetId]);
    expect(restored.rows[0].title).toBe(corpus[0].title);
  });

  it("category counts derived from the table match the corpus exactly after the restore above", async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT category, COUNT(*)::int AS count FROM prompts
       WHERE id = ANY($1::text[]) GROUP BY category ORDER BY category`,
      [corpusIds]
    );

    const expected = new Map();
    for (const p of corpus) {
      expected.set(p.category, (expected.get(p.category) || 0) + 1);
    }

    expect(rows.length).toBe(expected.size);
    for (const row of rows) {
      expect(row.count).toBe(expected.get(row.category));
    }
  });
});

describe("database error sanitization (Slice 4)", () => {
  const realDatabaseUrl = process.env.DATABASE_URL;
  const fakePassword = "supersecretfakepassword123";

  afterAll(async () => {
    await closePool();
    process.env.DATABASE_URL = realDatabaseUrl;
  });

  it("a database-unreachable error never leaks DATABASE_URL/password/stack/path", async () => {
    await closePool();
    process.env.DATABASE_URL = `postgresql://baduser:${fakePassword}@127.0.0.1:1/does_not_exist`;

    const app = buildServer();
    await app.ready();

    try {
      const res = await app.inject({ method: "GET", url: "/v1/prompts" });
      expect(res.statusCode).toBe(500);
      const text = res.body;
      expect(text).not.toContain(fakePassword);
      expect(text).not.toContain("baduser");
      expect(text).not.toContain("does_not_exist");
      expect(text).not.toMatch(/\/home\//);
      expect(text).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no stack-trace-shaped content
    } finally {
      await app.close();
      process.env.DATABASE_URL = realDatabaseUrl;
    }
  });

  it("GET /health reports 503 + sanitized body when the database is unreachable", async () => {
    await closePool();
    process.env.DATABASE_URL = `postgresql://baduser:${fakePassword}@127.0.0.1:1/does_not_exist`;

    const app = buildServer();
    await app.ready();

    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.status).toBe("degraded");
      expect(body.database).toBe("unavailable");
      const text = JSON.stringify(body);
      expect(text).not.toContain(fakePassword);
      expect(text).not.toContain("baduser");
    } finally {
      await app.close();
      process.env.DATABASE_URL = realDatabaseUrl;
    }
  });
});
