// Applies pending SQL migrations directly to the Supabase Postgres database.
// Requires SUPABASE_DB_URL in .env.local (Supabase dashboard → Connect → Session pooler URI).
// Usage:
//   node --env-file=.env.local scripts/apply-migrations.mjs 0006 0007 0008

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL in .env.local.");
  console.error("Get it from the Supabase dashboard: Connect → Session pooler URI (postgresql://postgres.<ref>:<password>@...:5432/postgres).");
  process.exit(1);
}

const prefixes = process.argv.slice(2);
if (!prefixes.length) {
  console.error("Usage: node --env-file=.env.local scripts/apply-migrations.mjs <prefix> [<prefix> ...]  e.g. 0006 0007 0008");
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  for (const prefix of prefixes) {
    const file = files.find((f) => f.startsWith(prefix));
    if (!file) {
      console.error(`No migration found for prefix ${prefix}`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    process.stdout.write(`Applying ${file}... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("OK");
    } catch (err) {
      await client.query("rollback");
      // "already exists" means a previous partial/manual apply — report and continue.
      console.log(`FAILED: ${err.message}`);
    }
  }
} finally {
  await client.end();
}
