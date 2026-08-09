# Prompt Foundry

A responsive Next.js and React prompt-library website built from the supplied collection of 2,084 prompts.

## Features

- Full-text search across titles and prompt bodies
- Client-side filtering, sorting, and pagination over a single fetched dataset
- 14 automatically inferred categories
- Relevance, title, shortest, and longest sorting
- Prompt detail modal with variable detection for `${...}` placeholders
- One-click copy buttons
- Favorites persisted in `localStorage`
- Add your own prompts from the UI, with the category suggested for you
- Optionally publish a prompt to the shared library through GitHub
- Light and dark themes
- Responsive keyboard-accessible interface
- `/` focuses search and `Escape` closes the active prompt

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
```

`next.config.mjs` sets `output: "export"`, so the build writes a fully static
site to `out/`. There is no Node server to run — preview it with any static
file server:

```bash
npx serve out
```

## Deployment

`.github/workflows/deploy-pages.yml` builds the export and publishes it to
GitHub Pages on every push to `main`, and on manual dispatch. The first run
enables Pages and sets its source to GitHub Actions.

The site is served from a project subpath, so the build sets `basePath` to
`/prompt-library` whenever `GITHUB_ACTIONS=true`. Local builds keep an empty
`basePath`. Anything that constructs a URL by hand must prefix it with
`process.env.NEXT_PUBLIC_BASE_PATH`, as `lib/client-store.js` does when it
fetches the dataset.

To reproduce the deployed output locally:

```bash
GITHUB_ACTIONS=true npm run build
```

## Adding prompts

There are two layers, and the first works on its own.

### Layer 1 — your own prompts, in your browser

"Add prompt" in the header opens a dialog for a title and a body. The category
is **suggested, not assigned**: three chips appear with the best guess
preselected, and you can pick another or override it entirely from the
dropdown.

Saved prompts live in `localStorage` and are merged onto the shipped corpus by
`lib/client-store.js`, so they pick up search, filtering, sorting, favourites
and pagination with no separate code path. They are marked "yours" in the grid
and can be edited or deleted from the detail modal.

They stay in that one browser. Nothing is uploaded.

### Layer 2 — publishing to the shared library

"Publish" on one of your prompts opens a prefilled GitHub issue. A maintainer
reviews it and applies the `approved-prompt` label, which runs
`.github/workflows/ingest-prompt.yml`: it validates the submission, decides a
category, appends to both dataset copies, commits, and redeploys.

The label gate is deliberate. Anyone can open an issue on a public repo, so
without a human in the loop any stranger could commit content into a site you
host under your own name.

A push made with `GITHUB_TOKEN` does not start another workflow, so the ingest
job calls `deploy-pages.yml` directly as a reusable workflow rather than
relying on its own commit to trigger the deploy.

## How categorisation works

`scripts/train-categorizer.mjs` trains a multinomial naive Bayes model on the
already-labelled corpus and writes `lib/category-model.json` (~107 KB, ~26 KB
gzipped). The vocabulary is pruned to 1,500 terms by mutual information, which
costs almost nothing against the full 10.7k-term vocabulary and keeps scoring
to a dictionary lookup that runs in the browser.

Measured on a held-out fifth of the corpus:

| | |
|---|---|
| Top-1 accuracy | ~54% |
| Correct within the top 3 | ~79% |
| Majority-class baseline | 23% |

**This is why the UI suggests rather than decides.** At 54% a silent assignment
would mislabel nearly half of all additions, and a wrong category is invisible
in the filter — worse than no category at all. Three chips put the right answer
on screen about four times in five, one click away.

The unattended path in Layer 2 has no user to confirm, so it falls back to
`Other` when the model is not confident, and says so on the issue. Setting an
`ANTHROPIC_API_KEY` repository secret makes that path use Claude instead, which
is considerably more accurate; without it the local model is used.

Re-run the trainer after the corpus changes meaningfully:

```bash
npm run train
```

Ingestion deliberately does not retrain — one prompt in 2,000 does not move the
model, and retraining on every submission would churn a 107 KB file.

## Validate the prompt data

```bash
npm run validate
```

## Structure

```text
app/
  globals.css           Full responsive design system
  layout.js             Metadata and global layout
  page.js               Statically prerendered entry page
components/
  prompt-library.js     Interactive React library UI
  add-prompt-dialog.js  Add / edit dialog with category suggestions
lib/
  prompt-store.js       Build-time loader; supplies category counts to page.js
  client-store.js       Browser-side fetch, search, filters, local prompts
  tokenize.mjs          Shared tokenizer — trainer, browser, and ingest
  score-categories.mjs  Pure scoring; takes the model as an argument
  categorize.mjs        Browser entry point, bound to the bundled model
  category-model.json   Trained model (generated — do not edit by hand)
  publish.js            Builds the prefilled GitHub issue URL
data/
  prompts.json          Normalized prompt collection (build-time input)
public/
  prompts.json          Same collection, served to the browser
scripts/
  validate-data.mjs     Dataset integrity check
  train-categorizer.mjs Trains lib/category-model.json and reports accuracy
  ingest-issue.mjs      Turns an approved submission into a committed prompt
.github/
  ISSUE_TEMPLATE/add-prompt.yml   Submission form
  workflows/deploy-pages.yml      Static export build and Pages deploy
  workflows/ingest-prompt.yml     Approved-submission ingestion
```

## Notes

The dataset exists twice on purpose. `lib/prompt-store.js` reads
`data/prompts.json` from the filesystem at build time to compute the category
counts baked into the prerendered page. `public/prompts.json` is the copy
shipped to the browser, which `lib/client-store.js` fetches once and caches
before doing all search and filtering locally.

That means the browser downloads the whole multi-megabyte collection on first
load. It is cached afterward, and it is what makes serverless hosting on Pages
possible, but a much larger dataset would want a prebuilt search index or a
real backing store instead.

Keep the two copies in sync when the collection changes — `scripts/ingest-issue.mjs`
writes both, and stores them minified with no trailing newline to match the
existing format, so each addition is a one-line diff rather than a 5.9 MB
rewrite.
