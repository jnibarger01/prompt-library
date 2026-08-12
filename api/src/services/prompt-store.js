import { getPool } from "../db/pool.js";
import { measure, generateId, newPromptSeed } from "../lib/prompt-derive.js";

/**
 * Single abstraction over prompt storage. As of Slice 4, this is backed by
 * PostgreSQL (see api/db/pool.js) instead of data/prompts.json + an
 * in-memory overlay. Routes must not contain SQL — everything below is the
 * only place that does.
 *
 * PERSISTENCE: every mutation here is a real, committed write to
 * PostgreSQL. Created/updated/deleted prompts survive process restarts —
 * there is no separate in-memory source of truth to fall out of sync with.
 *
 * ORDERING: `source_order` (see migrations/001_create_prompts.sql) is an
 * explicit integer column, not reliance on PostgreSQL's unspecified
 * physical row order. Every list/search query does
 * `ORDER BY source_order ASC, id ASC`. `source_order` alone is NOT a total
 * order — PostgreSQL makes no guarantee about the relative order of rows
 * that compare equal on the ORDER BY key, so two rows sharing a
 * source_order value (which can't happen for the imported corpus, since
 * every row gets a distinct array index, but *can* happen if source_order
 * is ever assigned by anything less careful than the sequence) would sort
 * unpredictably without a tie-breaker. `id` is appended as a second sort
 * key purely to make the order total and reproducible; it has no semantic
 * meaning of its own. The import script assigns source_order = original
 * array index for the shipped corpus; prompts_source_order_seq assigns
 * strictly increasing values to new prompts created via POST, so ordering
 * stays deterministic and stable across requests and across restarts.
 *
 * TRANSACTIONS: PATCH does a SELECT ... FOR UPDATE + UPDATE inside a single
 * transaction so a concurrent PATCH on the same row can't interleave and
 * produce a lost update. POST relies on the `id` PRIMARY KEY constraint as
 * the authoritative collision guard (a unique_violation triggers a retry
 * with a freshly generated id). DELETE is a single statement — existence
 * and removal are atomic by construction.
 */

function rowToPrompt(row) {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    category: row.category,
    tags: row.tags,
    characters: row.characters,
    words: row.words,
  };
}

/** Thrown when a real conflict condition exists (e.g. an id collision that survives retries). */
export class PromptConflictError extends Error {}

/** Escapes LIKE metacharacters so `q`/`category` are treated as literal substrings, not patterns. */
function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Returns the full, API-visible corpus array, in deterministic source order. */
export async function getAllPrompts() {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM prompts ORDER BY source_order ASC, id ASC");
  return rows.map(rowToPrompt);
}

/** Returns a single prompt by id, or undefined if not found. */
export async function getPromptById(id) {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM prompts WHERE id = $1", [id]);
  return rows[0] ? rowToPrompt(rows[0]) : undefined;
}

/**
 * Filters + paginates deterministically (ORDER BY source_order ASC, id ASC,
 * then a plain LIMIT/OFFSET slice) — same semantics as Slice 1/2, now
 * evaluated in SQL instead of in-process. Search is a case-insensitive
 * substring match across title, prompt, and tags; no relevance ranking, no
 * full-text search.
 *
 * @param {object} opts
 * @param {number} opts.limit
 * @param {number} opts.offset
 * @param {string} [opts.category]
 * @param {string} [opts.q]
 */
export async function queryPrompts({ limit, offset, category, q }) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (category) {
    params.push(category.toLowerCase());
    conditions.push(`LOWER(category) = $${params.length}`);
  }

  if (q) {
    params.push(`%${escapeLikePattern(q.toLowerCase())}%`);
    const idx = params.length;
    conditions.push(
      `(LOWER(title) LIKE $${idx} ESCAPE '\\' ` +
        `OR LOWER(prompt) LIKE $${idx} ESCAPE '\\' ` +
        `OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS tag WHERE LOWER(tag) LIKE $${idx} ESCAPE '\\'))`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM prompts ${where}`,
    params
  );
  const total = countRows[0].total;

  const listParams = [...params, limit, offset];
  const { rows } = await pool.query(
    `SELECT * FROM prompts ${where} ORDER BY source_order ASC, id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { items: rows.map(rowToPrompt), total };
}

/** Derives distinct categories + counts directly from the current table state, sorted by name. */
export async function getCategories() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT category AS name, COUNT(*)::int AS count
     FROM prompts
     GROUP BY category
     ORDER BY category ASC`
  );
  return { items: rows, total: rows.length };
}

/**
 * Creates a prompt. `characters`/`words`/`id` are always server-derived —
 * client-supplied values for those fields are never trusted (the route's
 * Zod schema already rejects them before this is called). `source_order`
 * comes from prompts_source_order_seq, so concurrent creates get distinct,
 * strictly increasing values without any application-level locking.
 *
 * The `id` PRIMARY KEY constraint is the authoritative collision guard: an
 * insert that collides (unique_violation, SQLSTATE 23505) is retried with a
 * freshly generated id. Only if that keeps failing do we surface 409.
 */
export async function createPrompt({ title, prompt, category, tags }) {
  const pool = getPool();
  const { characters, words } = measure(prompt);
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = generateId(newPromptSeed(title, prompt));
    try {
      const { rows } = await pool.query(
        `INSERT INTO prompts (id, title, prompt, category, tags, characters, words, source_order)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, nextval('prompts_source_order_seq'))
         RETURNING *`,
        [id, title, prompt, category, tagsJson, characters, words]
      );
      return rowToPrompt(rows[0]);
    } catch (err) {
      if (err && err.code === "23505") continue; // id collision — regenerate and retry
      throw err;
    }
  }

  // Practically unreachable (would require a real SHA-256 collision), but a
  // genuine unresolved duplicate-id condition is exactly what 409 is for.
  throw new PromptConflictError("Could not allocate a unique prompt id.");
}

/**
 * Applies a partial update. Returns the updated record, or undefined if the
 * id doesn't exist (route maps that to 404). `id` can never change.
 * `characters`/`words` are recomputed only when `prompt` is part of the
 * patch; otherwise the previous values are kept.
 *
 * Wrapped in a transaction with `SELECT ... FOR UPDATE` so a concurrent
 * PATCH on the same row can't read-modify-write on stale data.
 */
export async function updatePrompt(id, patch) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query("SELECT * FROM prompts WHERE id = $1 FOR UPDATE", [id]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return undefined;
    }

    const current = rowToPrompt(rows[0]);
    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);

    const nextTitle = has("title") ? patch.title : current.title;
    const nextPrompt = has("prompt") ? patch.prompt : current.prompt;
    const nextCategory = has("category") ? patch.category : current.category;
    const nextTags = has("tags") ? patch.tags : current.tags;
    const derived = has("prompt")
      ? measure(nextPrompt)
      : { characters: current.characters, words: current.words };

    const { rows: updatedRows } = await client.query(
      `UPDATE prompts
       SET title = $2, prompt = $3, category = $4, tags = $5::jsonb,
           characters = $6, words = $7, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, nextTitle, nextPrompt, nextCategory, JSON.stringify(nextTags), derived.characters, derived.words]
    );

    await client.query("COMMIT");
    return rowToPrompt(updatedRows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Deletes a prompt. Returns true if a row was removed, false if the id
 * didn't exist. A single DELETE is atomic — existence-check-and-remove
 * needs no explicit transaction.
 */
export async function deletePrompt(id) {
  const pool = getPool();
  const { rowCount } = await pool.query("DELETE FROM prompts WHERE id = $1", [id]);
  return rowCount > 0;
}
