#!/usr/bin/env node
import pg from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exitCode = 1;
    return;
  }

  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM prompts");
    console.log(`Database reachable. prompts row count: ${rows[0].count}`);
  } catch (err) {
    console.error(`Database check failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
