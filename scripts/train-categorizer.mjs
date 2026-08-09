/**
 * Trains the category suggester from the labelled prompts in data/prompts.json
 * and writes lib/category-model.json.
 *
 * Model: multinomial naive Bayes over a vocabulary pruned by mutual information.
 * Pruning to ~1500 terms costs almost nothing in accuracy (55.3% -> 53.9% top-1
 * against a 10.7k-term full vocabulary) while keeping the model small enough to
 * bundle into the page, and it is a plain dictionary lookup at scoring time so
 * it runs in the browser with no dependencies.
 *
 * Run after changing data/prompts.json:
 *   node scripts/train-categorizer.mjs
 *
 * The accuracy printed at the end is measured on a held-out fifth of the corpus
 * using the same pruning and the same scoring function that ship, so the
 * numbers describe what users actually get.
 */
import fs from "node:fs";
import path from "node:path";
import { tokenize } from "../lib/tokenize.mjs";
import { rankCategories } from "../lib/score-categories.mjs";

const VOCABULARY_SIZE = 1500;
const MIN_DOCUMENT_FREQUENCY = 3;

const root = process.cwd();
const prompts = JSON.parse(fs.readFileSync(path.join(root, "data", "prompts.json"), "utf8"));

/** Deterministic stratified split, so repeated runs are comparable. */
function split(items) {
  const byCategory = new Map();
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }

  const train = [];
  const test = [];
  for (const group of byCategory.values()) {
    const ordered = [...group].sort((a, b) => (a.id < b.id ? -1 : 1));
    const cut = Math.floor(ordered.length * 0.8);
    ordered.forEach((item, index) => (index < cut ? train : test).push(item));
  }
  return { train, test };
}

/**
 * Rank vocabulary by mutual information with the category labels, which keeps
 * terms that discriminate between categories and drops those that are merely
 * frequent.
 */
function selectVocabulary(items, categories) {
  const documentFrequency = new Map();
  const perCategory = new Map(categories.map((category) => [category, new Map()]));
  const documentsPerCategory = new Map(categories.map((category) => [category, 0]));

  for (const item of items) {
    documentsPerCategory.set(item.category, documentsPerCategory.get(item.category) + 1);
    for (const term of new Set(tokenize(item.title, item.prompt))) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      const counts = perCategory.get(item.category);
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }

  const total = items.length;
  const contribution = (joint, left, right) =>
    joint ? (joint / total) * Math.log2((joint * total) / (left * right) || Number.EPSILON) : 0;

  const scored = [];
  for (const [term, withTerm] of documentFrequency) {
    if (withTerm < MIN_DOCUMENT_FREQUENCY) continue;

    let information = 0;
    for (const category of categories) {
      const inCategory = documentsPerCategory.get(category);
      const both = perCategory.get(category).get(term) || 0;
      information +=
        contribution(both, withTerm, inCategory) +
        contribution(withTerm - both, withTerm, total - inCategory) +
        contribution(inCategory - both, total - withTerm, inCategory) +
        contribution(total - withTerm - inCategory + both, total - withTerm, total - inCategory);
    }
    scored.push([term, information]);
  }

  scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return new Set(scored.slice(0, VOCABULARY_SIZE).map(([term]) => term));
}

function build(items) {
  const categories = [...new Set(items.map((item) => item.category))].sort();
  const vocabulary = selectVocabulary(items, categories);

  const termCounts = new Map(categories.map((category) => [category, new Map()]));
  const totalTerms = new Map(categories.map((category) => [category, 0]));
  const documents = new Map(categories.map((category) => [category, 0]));

  for (const item of items) {
    documents.set(item.category, documents.get(item.category) + 1);
    for (const term of tokenize(item.title, item.prompt)) {
      if (!vocabulary.has(term)) continue;
      const counts = termCounts.get(item.category);
      counts.set(term, (counts.get(term) || 0) + 1);
      totalTerms.set(item.category, totalTerms.get(item.category) + 1);
    }
  }

  // Sparse storage: absent categories fall back to the smoothing floor, which
  // lib/categorize.mjs computes from totals, so zeros never need storing.
  const terms = {};
  for (const term of [...vocabulary].sort()) {
    const row = {};
    categories.forEach((category, index) => {
      const count = termCounts.get(category).get(term) || 0;
      if (count) row[index] = count;
    });
    if (Object.keys(row).length) terms[term] = row;
  }

  return {
    version: 2,
    categories,
    priors: categories.map((category) => +(documents.get(category) / items.length).toFixed(6)),
    totals: categories.map((category) => totalTerms.get(category)),
    vocabularySize: vocabulary.size,
    terms,
  };
}

const { train, test } = split(prompts);
const evaluationModel = build(train);

let top1 = 0;
let top3 = 0;
for (const item of test) {
  const ranked = rankCategories(item.title, item.prompt, evaluationModel);
  const position = ranked.findIndex((entry) => entry.category === item.category);
  if (position === 0) top1 += 1;
  if (position >= 0 && position < 3) top3 += 1;
}

// Ship a model trained on the whole corpus; the split exists only to measure.
const shipped = build(prompts);
const outputPath = path.join(root, "lib", "category-model.json");
fs.writeFileSync(outputPath, `${JSON.stringify(shipped)}\n`);

const kilobytes = fs.statSync(outputPath).size / 1024;
console.log(
  `Wrote lib/category-model.json — ${shipped.categories.length} categories, ` +
    `${shipped.vocabularySize} terms, ${kilobytes.toFixed(1)} KB`,
);
console.log(`Held-out top-1: ${((100 * top1) / test.length).toFixed(1)}%`);
console.log(`Held-out top-3: ${((100 * top3) / test.length).toFixed(1)}%`);
console.log(`Majority baseline: ${(100 * Math.max(...shipped.priors)).toFixed(1)}%`);
