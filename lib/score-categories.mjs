/**
 * Pure scoring for the category suggester. Takes the model as an argument and
 * imports nothing but the tokenizer, so the trainer can evaluate a candidate
 * model before one has ever been written to disk.
 *
 * Browser code should import lib/categorize.mjs, which binds these to the
 * trained model that ships with the bundle.
 */
import { tokenize } from "./tokenize.mjs";

const SMOOTHING = 0.2;

/** Minimum in-vocabulary terms before a ranking means more than the prior. */
const CONFIDENCE_THRESHOLD = 3;

/**
 * Scores every category for a prompt, best first.
 *
 * @returns {{category: string, score: number}[]}
 */
export function rankCategories(title, body, model) {
  const { categories, priors, totals, vocabularySize, terms } = model;
  const present = tokenize(title, body).filter((term) => terms[term]);

  return categories
    .map((category, index) => {
      let score = Math.log(priors[index]);
      const denominator = totals[index] + SMOOTHING * vocabularySize;

      for (const term of present) {
        const count = terms[term][index] || 0;
        score += Math.log((count + SMOOTHING) / denominator);
      }

      return { category, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * The suggestion callers act on: a best guess plus the runners-up.
 *
 * Held-out accuracy is ~54% at the top and ~79% within the first three, which
 * is why this returns alternatives instead of one answer — the right category
 * is on screen roughly four times in five, one click away. Present it as a
 * suggestion the user can override, never as a silent decision.
 *
 * `confident` is false when too little of the prompt matched the vocabulary for
 * the ranking to mean anything, so callers can avoid pre-selecting what is
 * really just the corpus prior.
 */
export function topCategories(title, body, model, count = 3) {
  const matchedTerms = tokenize(title, body).filter((term) => model.terms[term]).length;

  return {
    suggestions: rankCategories(title, body, model)
      .slice(0, count)
      .map((entry) => entry.category),
    confident: matchedTerms >= CONFIDENCE_THRESHOLD,
    matchedTerms,
  };
}
