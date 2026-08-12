-- Slice 4: durable prompt storage.
--
-- source_order provides explicit, deterministic ordering independent of
-- PostgreSQL's unspecified physical row order. The import script assigns
-- source_order = original array index for the shipped corpus (0..2083);
-- prompts_source_order_seq assigns strictly increasing values to prompts
-- created afterwards via POST /v1/prompts, so newly created rows always
-- sort after the imported corpus and after each other in creation order.

CREATE SEQUENCE IF NOT EXISTS prompts_source_order_seq;

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  prompt TEXT NOT NULL CHECK (btrim(prompt) <> ''),
  category TEXT NOT NULL CHECK (btrim(category) <> ''),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tags) = 'array'),
  characters INTEGER NOT NULL CHECK (characters >= 0),
  words INTEGER NOT NULL CHECK (words >= 0),
  source_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query patterns this needs to serve efficiently, per the accepted API:
--   GET /v1/prompts?category=...   -> filter by category, order by source_order
--   GET /v1/prompts (list/search)  -> order by source_order for every page
-- 2,084 rows doesn't strictly need either index yet, but both are cheap,
-- narrow, and map directly to real query predicates already in use — no
-- speculative indexing (no trigram/full-text/vector indexes).
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts (category);
CREATE INDEX IF NOT EXISTS idx_prompts_source_order ON prompts (source_order);
