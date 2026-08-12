import { createHash, randomUUID } from "node:crypto";

/**
 * Shared, DB-independent derivation rules for prompt fields. Used by both
 * prompt-store.js (API mutations) and scripts/lib/import-core.js (corpus
 * import), so the two code paths can never quietly diverge.
 */

/**
 * Same measurement rule the frontend uses for user-added prompts
 * (lib/client-store.js `measure`): character count is raw length, word
 * count splits on whitespace after trimming.
 */
export function measure(text) {
  const body = String(text || "");
  return {
    characters: body.length,
    words: body.trim() ? body.trim().split(/\s+/).length : 0,
  };
}

/**
 * Reuses the shipped corpus's ID format: 43-character base64url SHA-256
 * digest (see lib/client-store.js `createId`, used client-side for
 * locally-added prompts).
 */
export function generateId(seed) {
  return createHash("sha256").update(seed, "utf8").digest("base64url");
}

/** Builds a fresh, format-compatible id seeded with content + time + a random nonce. */
export function newPromptSeed(title, promptText) {
  return `${title} ${promptText} ${Date.now()} ${randomUUID()}`;
}
