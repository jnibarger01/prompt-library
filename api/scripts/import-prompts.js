#!/usr/bin/env node
import pg from "pg";
import { loadCorpusFile, validateCorpus, importPrompts } from "./lib/import-core.js";

const FORCE = process.argv.includes("--force");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Refusing to import.");
    process.exitCode = 1;
    return;
  }

  const corpus = loadCorpusFile();
  const errors = validateCorpus(corpus);
  if (errors.length) {
    console.error(`Corpus validation failed with ${errors.length} error(s):`);
    console.error(errors.slice(0, 20).join("\n"));
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await importPrompts(client, corpus, { force: FORCE });
    console.log(
      `Import complete (force=${result.force}). ` +
        `total_in_file=${result.total} inserted=${result.inserted} ` +
        (result.force
          ? `overwritten=${result.overwritten}`
          : `unchanged(existing, left alone)=${result.unchanged}`)
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Import failed: ${err.message}`);
  process.exitCode = 1;
});
