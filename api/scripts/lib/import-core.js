import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measure } from "../../src/lib/prompt-derive.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// api/scripts/lib -> api/scripts -> api -> repo root -> data/prompts.json
export const CORPUS_FILE = path.resolve(__dirname, "..", "..", "..", "data", "prompts.json");

/** Reads + parses data/prompts.json. Throws with a clear message on any shape problem. */
export function loadCorpusFile(filePath = CORPUS_FILE) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("data/prompts.json must contain a JSON array.");
  }
  return parsed;
}

/** Validates the fields the import needs. Returns a list of error strings (empty = valid). */
export function validateCorpus(corpus) {
  const errors = [];
  const seenIds = new Set();

  corpus.forEach((p, index) => {
    for (const field of ["id", "title", "prompt", "category"]) {
      if (typeof p?.[field] !== "string" || !p[field].trim()) {
        errors.push(`item ${index}: missing or invalid "${field}"`);
      }
    }
    if (!Array.isArray(p?.tags)) {
      errors.push(`item ${index}: "tags" must be an array`);
    }
    if (typeof p?.id === "string") {
      if (seenIds.has(p.id)) errors.push(`item ${index}: duplicate id "${p.id}"`);
      seenIds.add(p.id);
    }
  });

  return errors;
}

/**
 * Imports the corpus into the `prompts` table inside a single transaction.
 *
 * Default (force=false) — safe/idempotent:
 *   INSERT ... ON CONFLICT (id) DO NOTHING. An id that already exists in the
 *   database is left completely untouched, whether that row still matches
 *   the shipped corpus or has since been edited/deleted via the API. This
 *   is what makes rerunning the import safe: it can never duplicate rows,
 *   and it can never clobber a mutation made through the API.
 *
 * Force (force=true) — explicit, opt-in reset:
 *   INSERT ... ON CONFLICT (id) DO UPDATE, overwriting title/prompt/
 *   category/tags/characters/words/source_order for existing ids back to
 *   the shipped corpus values. Only use this to deliberately reset the
 *   corpus rows to their canonical values.
 *
 * Known limitation either way: a prompt hard-deleted via DELETE
 * /v1/prompts/:id frees its id, so re-running the import (with or without
 * --force) will re-insert that corpus row. Import is a first-run /
 * disaster-recovery tool, not something meant to run routinely against a
 * live database with API-driven deletions.
 *
 * @param {import("pg").Client | import("pg").PoolClient} client - already connected, no open transaction
 * @param {object[]} corpus
 * @param {{force?: boolean}} [options]
 */
export async function importPrompts(client, corpus, { force = false } = {}) {
  let inserted = 0;
  let unchanged = 0;
  let overwritten = 0;

  await client.query("BEGIN");
  try {
    for (let i = 0; i < corpus.length; i += 1) {
      const p = corpus[i];
      const derived = measure(p.prompt);
      const characters = typeof p.characters === "number" ? p.characters : derived.characters;
      const words = typeof p.words === "number" ? p.words : derived.words;
      const tagsJson = JSON.stringify(p.tags);

      if (force) {
        const { rows } = await client.query(
          `INSERT INTO prompts (id, title, prompt, category, tags, characters, words, source_order)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             prompt = EXCLUDED.prompt,
             category = EXCLUDED.category,
             tags = EXCLUDED.tags,
             characters = EXCLUDED.characters,
             words = EXCLUDED.words,
             source_order = EXCLUDED.source_order,
             updated_at = now()
           RETURNING (xmax = 0) AS was_insert`,
          [p.id, p.title, p.prompt, p.category, tagsJson, characters, words, i]
        );
        if (rows[0].was_insert) inserted += 1;
        else overwritten += 1;
      } else {
        const { rowCount } = await client.query(
          `INSERT INTO prompts (id, title, prompt, category, tags, characters, words, source_order)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.title, p.prompt, p.category, tagsJson, characters, words, i]
        );
        if (rowCount > 0) inserted += 1;
        else unchanged += 1;
      }
    }

    // Advance the new-prompt sequence past whatever is now the highest
    // source_order in the table (imported rows or pre-existing API rows),
    // so POST-created prompts always sort after every existing row. Safe
    // to run on every import: it only ever reflects the current true max.
    await client.query(
      `SELECT setval('prompts_source_order_seq', (SELECT COALESCE(MAX(source_order), -1) FROM prompts) + 1, false)`
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }

  return { total: corpus.length, inserted, unchanged, overwritten, force };
}
