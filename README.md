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

## Validate the prompt data

```bash
node scripts/validate-data.mjs
```

## Structure

```text
app/
  globals.css           Full responsive design system
  layout.js             Metadata and global layout
  page.js               Statically prerendered entry page
components/
  prompt-library.js     Interactive React library UI
lib/
  prompt-store.js       Build-time loader; supplies category counts to page.js
  client-store.js       Browser-side fetch, search, filters, pagination
data/
  prompts.json          Normalized prompt collection (build-time input)
public/
  prompts.json          Same collection, served to the browser
scripts/
  validate-data.mjs     Dataset integrity check
.github/workflows/
  deploy-pages.yml      Static export build and GitHub Pages deploy
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

Keep the two copies in sync when the collection changes.
