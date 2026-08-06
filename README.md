# Prompt Foundry

A responsive Next.js and React prompt-library website built from the supplied collection of 2,084 prompts.

## Features

- Full-text search across titles and prompt bodies
- Server-side filtering and pagination (the full multi-megabyte dataset is not shipped to the browser)
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
npm start
```

## Validate the prompt data

```bash
node scripts/validate-data.mjs
```

## Structure

```text
app/
  api/prompts/          Search and detail API routes
  globals.css           Full responsive design system
  layout.js             Metadata and global layout
  page.js               Server-rendered entry page
components/
  prompt-library.js     Interactive React library UI
lib/
  prompt-store.js       Cached file loader, search, filters, pagination
data/
  prompts.json          Normalized prompt collection
scripts/
  validate-data.mjs     Dataset integrity check
```

## Notes

The data layer uses Node.js file access and is designed for standard Next.js Node deployments. For edge-only hosting, move the JSON data into a database or object store and replace `lib/prompt-store.js`.
