/**
 * Shared tokenizer for the category suggester.
 *
 * The trainer, the browser, and the issue-ingest workflow all import this, so
 * a prompt tokenizes identically wherever it is scored. Changing anything here
 * invalidates lib/category-model.json — re-run scripts/train-categorizer.mjs.
 */

const STOP_WORDS = new Set(
  `a an the and or but if then than that this these those is are was were be been being
   do does did doing have has had having i you he she it we they me him her them my your
   his its our their as at by for from in into of on to with about over under again
   further once here there when where why how all any both each few more most other some
   such no nor not only own same so too very can will just should now act please make
   sure use using provide give want need like based want ensure include following also
   above below out up down off then once while during before after between through`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Titles carry far more signal per word than bodies, so they are repeated to
 * weight them without needing a separate weighting pass at scoring time.
 */
const TITLE_REPEATS = 3;

export function tokenize(title, body) {
  const text = `${`${title || ""} `.repeat(TITLE_REPEATS)} ${body || ""}`;

  const matches = text
    .toLowerCase()
    // Placeholders like ${tone} are template syntax, not topic signal.
    .replace(/\$\{[^}]*\}/g, " ")
    .match(/[a-z][a-z+#.-]{2,}/g);

  if (!matches) return [];

  return matches.filter((term) => term.length < 20 && !STOP_WORDS.has(term));
}
