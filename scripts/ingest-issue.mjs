/**
 * Layer 2: turns an approved "Add a prompt" issue into a committed prompt.
 *
 * Reads the issue body from ISSUE_BODY, validates it, decides a category, and
 * appends the prompt to both data/prompts.json and public/prompts.json. It only
 * writes files — committing and deploying are the workflow's job.
 *
 * Category comes from, in order:
 *   1. the submitter's explicit choice, if it names a known category
 *   2. Claude, when ANTHROPIC_API_KEY is configured
 *   3. the local naive Bayes model
 *
 * Usage (see .github/workflows/ingest-prompt.yml):
 *   ISSUE_BODY="$BODY" node scripts/ingest-issue.mjs
 *
 * Writes a one-line human summary to stdout and sets `summary` and `title` as
 * GitHub Actions step outputs.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { topCategories } from "../lib/score-categories.mjs";

const MAX_TITLE = 120;
const MAX_BODY = 20000;
const MODEL = "claude-haiku-4-5-20251001";

const root = process.cwd();
const dataPath = path.join(root, "data", "prompts.json");
const publicPath = path.join(root, "public", "prompts.json");
const modelPath = path.join(root, "lib", "category-model.json");

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/**
 * Parses a GitHub issue-form body, which renders as `### Field` headings
 * followed by the value. Unfilled optional fields come through as
 * `_No response_`.
 */
function parseIssueForm(body) {
  const sections = {};
  const parts = String(body || "").split(/^###\s+/m);

  for (const part of parts.slice(1)) {
    const newline = part.indexOf("\n");
    if (newline < 0) continue;
    const heading = part.slice(0, newline).trim().toLowerCase();
    const value = part.slice(newline + 1).trim();
    sections[heading] = value === "_No response_" ? "" : value;
  }

  return sections;
}

/** Matches the 43-character base64url SHA-256 IDs used across the corpus. */
function createId(seed) {
  return crypto.createHash("sha256").update(seed).digest("base64url");
}

function measure(text) {
  return {
    characters: text.length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
  };
}

function normaliseTags(raw) {
  return [
    ...new Set(
      String(raw || "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase().slice(0, 30))
        .filter(Boolean),
    ),
  ].slice(0, 6);
}

/**
 * Asks Claude to pick a category. Any failure returns null so the caller falls
 * back to the local model — a categorisation problem must never block a
 * submission.
 */
async function classifyWithClaude(title, body, categories) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16,
        messages: [
          {
            role: "user",
            content:
              `Classify this prompt into exactly one category.\n\n` +
              `Categories: ${categories.join(", ")}\n\n` +
              `Title: ${title}\n\nPrompt:\n${body.slice(0, 4000)}\n\n` +
              `Reply with the category name only, copied exactly from the list.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.log(`Claude classification unavailable (HTTP ${response.status}); using local model.`);
      return null;
    }

    const payload = await response.json();
    const answer = payload?.content?.[0]?.text?.trim();
    const match = categories.find((name) => name.toLowerCase() === answer?.toLowerCase());
    if (!match) {
      console.log(`Claude returned an unknown category (${answer}); using local model.`);
      return null;
    }
    return match;
  } catch (error) {
    console.log(`Claude classification failed (${error.message}); using local model.`);
    return null;
  }
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  // Heredoc form so multi-line and special characters survive intact.
  const delimiter = `EOF_${crypto.randomBytes(8).toString("hex")}`;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

async function main() {
  const issueBody = process.env.ISSUE_BODY_PATH
    ? fs.readFileSync(process.env.ISSUE_BODY_PATH, "utf8")
    : process.env.ISSUE_BODY;
  const fields = parseIssueForm(issueBody);

  const title = (fields.title || "").slice(0, MAX_TITLE).trim();
  const body = (fields.prompt || "").trim();
  const requested = (fields.category || "").trim();
  const tags = normaliseTags(fields.tags);

  if (!title) fail("The issue has no Title field. Use the “Add a prompt” form.");
  if (!body) fail("The issue has no Prompt field. Use the “Add a prompt” form.");
  if (body.length > MAX_BODY) fail(`Prompt body is ${body.length} characters; the limit is ${MAX_BODY}.`);

  const prompts = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const categories = model.categories;

  const id = createId(`${title}\n${body}`);
  if (prompts.some((prompt) => prompt.id === id)) {
    fail("That exact prompt is already in the library.");
  }
  const duplicateTitle = prompts.find(
    (prompt) => prompt.title.toLowerCase() === title.toLowerCase(),
  );
  if (duplicateTitle) {
    fail(`A prompt titled “${duplicateTitle.title}” already exists. Pick a distinct title.`);
  }

  let category = categories.find((name) => name.toLowerCase() === requested.toLowerCase());
  let decidedBy = "the submitter";
  let uncertain = false;

  if (!category) {
    category = await classifyWithClaude(title, body, categories);
    decidedBy = category ? "Claude" : null;
  }

  if (!category) {
    // The local model is only ~54% accurate on its top pick, so a specific
    // label it is unsure about is worse than the catch-all: a wrong category
    // is invisible in the filter, whereas "Other" is visibly unsorted.
    const guess = topCategories(title, body, model, 1);
    category = guess.confident ? guess.suggestions[0] : "Other";
    decidedBy = "the local model";
    uncertain = true;
  }

  const entry = {
    id,
    title,
    prompt: body,
    category,
    tags,
    ...measure(body),
  };

  const updated = [...prompts, entry];
  // The corpus is stored minified with no trailing newline. Matching that
  // exactly keeps each ingest a one-line diff instead of rewriting 5.9 MB.
  const serialised = JSON.stringify(updated);
  fs.writeFileSync(dataPath, serialised);
  // public/prompts.json is the copy the browser fetches; the two must match.
  fs.writeFileSync(publicPath, serialised);

  const caveat = uncertain
    ? `\n\nThat category was guessed by the bundled model, which gets its top pick ` +
      `right about half the time — check it and correct it in \`data/prompts.json\` ` +
      `(and \`public/prompts.json\`) if it is wrong. Setting the \`ANTHROPIC_API_KEY\` ` +
      `secret makes this step considerably more accurate.`
    : "";

  const summary =
    `Added **${title}** to **${category}** (chosen by ${decidedBy}).${caveat}\n\n` +
    `The library is now ${updated.length.toLocaleString()} prompts. ` +
    `The site redeploys automatically.`;

  console.log(summary.replace(/\*\*/g, ""));
  setOutput("summary", summary);
  setOutput("title", title);
}

main().catch((error) => fail(error.message));
