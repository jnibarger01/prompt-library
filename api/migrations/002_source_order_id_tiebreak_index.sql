-- Slice 5: source_order alone is not a total order — PostgreSQL does not
-- guarantee any particular relative order for rows that tie on the ORDER BY
-- key. Every list/search query now does ORDER BY source_order ASC, id ASC,
-- using `id` purely as a deterministic tie-breaker (no semantic meaning).
--
-- Replace the source_order-only index with a composite index matching that
-- exact ORDER BY, so ties are resolved by an index scan instead of an
-- extra in-memory sort step.
DROP INDEX IF EXISTS idx_prompts_source_order;
CREATE INDEX IF NOT EXISTS idx_prompts_source_order_id ON prompts (source_order ASC, id ASC);
