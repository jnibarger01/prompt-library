#!/usr/bin/env node
import pg from "pg";
import { runMigrations } from "./lib/migrate-core.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Refusing to run migrations.");
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { applied, skipped } = await runMigrations(client);
    if (applied.length) {
      console.log(`Applied ${applied.length} migration(s): ${applied.join(", ")}`);
    }
    if (skipped.length) {
      console.log(`Already applied (skipped): ${skipped.join(", ")}`);
    }
    if (!applied.length && !skipped.length) {
      console.log("No migration files found.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exitCode = 1;
});
