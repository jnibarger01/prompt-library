/**
 * Browser entry point for the category suggester: the pure scoring functions
 * bound to the trained model that ships in the bundle.
 *
 * The model is produced by scripts/train-categorizer.mjs — re-run it after
 * changing data/prompts.json or lib/tokenize.mjs.
 *
 * Node tooling (the trainer, the issue-ingest script) should import
 * lib/score-categories.mjs and read the model with fs instead, so it does not
 * depend on bundler JSON handling.
 */
import model from "./category-model.json";
import { rankCategories, topCategories } from "./score-categories.mjs";

/** Best guess plus runners-up. See topCategories for the accuracy caveats. */
export function getTopCategories(title, body, count = 3) {
  return topCategories(title, body, model, count);
}

/** Full ranking, best first. */
export function rankAllCategories(title, body) {
  return rankCategories(title, body, model);
}

/** Every category the model knows, for a manual override control. */
export function allCategories() {
  return [...model.categories];
}
