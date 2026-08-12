import { z } from "zod";

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

/**
 * Bounded maximum for search/filter strings (q, category). 200 chars is
 * generous for a search phrase or category name while rejecting pathological
 * input (e.g. someone pasting an entire prompt body as the query) before it
 * ever reaches the filtering logic.
 */
export const MAX_QUERY_LENGTH = 200;

/**
 * Query params for GET /v1/prompts.
 *
 * limit/offset are coerced from strings (query params always arrive as
 * strings) then validated as bounded integers. Anything malformed —
 * non-numeric, negative, zero, over the hard max — fails validation and the
 * route returns 400. Absent params fall back to safe defaults, so a missing
 * limit can never accidentally return the whole corpus.
 */
export const listPromptsQuerySchema = z
  .object({
    limit: z.coerce
      .number({ invalid_type_error: "limit must be a number" })
      .int("limit must be an integer")
      .min(1, "limit must be at least 1")
      .max(MAX_LIMIT, `limit must not exceed ${MAX_LIMIT}`)
      .optional(),
    offset: z.coerce
      .number({ invalid_type_error: "offset must be a number" })
      .int("offset must be an integer")
      .min(0, "offset must be 0 or greater")
      .optional(),
    category: z
      .string()
      .trim()
      .min(1, "category must not be empty")
      .max(100, "category is too long")
      .optional(),
    q: z
      .string()
      .trim()
      .min(1, "q must not be empty")
      .max(MAX_QUERY_LENGTH, `q is too long (max ${MAX_QUERY_LENGTH} characters)`)
      .optional(),
  })
  .strict();

export const promptIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "id must not be empty")
    .max(200, "id is too long"),
});

/**
 * Query params for GET /v1/search. Same shape as the list query, except `q`
 * is required (a search with no term is a list, not a search).
 */
export const searchQuerySchema = z
  .object({
    q: z
      .string({ required_error: "q is required" })
      .trim()
      .min(1, "q must not be empty")
      .max(MAX_QUERY_LENGTH, `q is too long (max ${MAX_QUERY_LENGTH} characters)`),
    limit: z.coerce
      .number({ invalid_type_error: "limit must be a number" })
      .int("limit must be an integer")
      .min(1, "limit must be at least 1")
      .max(MAX_LIMIT, `limit must not exceed ${MAX_LIMIT}`)
      .optional(),
    offset: z.coerce
      .number({ invalid_type_error: "offset must be a number" })
      .int("offset must be an integer")
      .min(0, "offset must be 0 or greater")
      .optional(),
    category: z
      .string()
      .trim()
      .min(1, "category must not be empty")
      .max(100, "category is too long")
      .optional(),
  })
  .strict();

/* --------------------------------------------------------- mutation bodies */

/**
 * Bounds for mutation body fields, chosen by inspecting the existing corpus
 * (2,084 prompts) rather than picking arbitrary numbers:
 *   - title:    observed max 191 chars, p99 ~82  -> cap at 300 (headroom, not corpus-breaking)
 *   - prompt:   observed max 144,268 chars        -> cap at 200,000 (comfortably above the largest existing prompt)
 *   - category: existing category-name cap already used by list/search is 100
 *   - tags:     observed max 5 tags/prompt, max tag length 28 chars
 *               -> cap at 10 tags, 50 chars/tag (headroom over observed data)
 */
export const MAX_TITLE_LENGTH = 300;
export const MAX_PROMPT_LENGTH = 200_000;
export const MAX_CATEGORY_LENGTH = 100;
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 50;

const titleField = z
  .string()
  .trim()
  .min(1, "title must not be empty")
  .max(MAX_TITLE_LENGTH, `title must not exceed ${MAX_TITLE_LENGTH} characters`);

const promptField = z
  .string()
  .trim()
  .min(1, "prompt must not be empty")
  .max(MAX_PROMPT_LENGTH, `prompt must not exceed ${MAX_PROMPT_LENGTH} characters`);

const categoryField = z
  .string()
  .trim()
  .min(1, "category must not be empty")
  .max(MAX_CATEGORY_LENGTH, `category must not exceed ${MAX_CATEGORY_LENGTH} characters`);

const tagField = z
  .string()
  .trim()
  .min(1, "tag must not be empty")
  .max(MAX_TAG_LENGTH, `tag must not exceed ${MAX_TAG_LENGTH} characters`);

const tagsField = z.array(tagField).max(MAX_TAGS, `at most ${MAX_TAGS} tags are allowed`);

/**
 * POST /v1/prompts body. Only fields that define a prompt are accepted;
 * id/characters/words are always server-derived and are rejected outright
 * (via .strict()) if the client tries to supply them.
 */
export const createPromptBodySchema = z
  .object({
    title: titleField,
    prompt: promptField,
    category: categoryField,
    tags: tagsField.optional().default([]),
  })
  .strict();

/**
 * PATCH /v1/prompts/:id body. Every field is optional individually, but the
 * body as a whole must contain at least one mutable field — an empty PATCH
 * is rejected as 400 rather than treated as a no-op. `tags` has no default
 * here (unlike create) so an omitted key stays omitted instead of silently
 * becoming `[]`.
 */
export const updatePromptBodySchema = z
  .object({
    title: titleField.optional(),
    prompt: promptField.optional(),
    category: categoryField.optional(),
    tags: tagsField.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "PATCH body must include at least one field to update.",
  });
