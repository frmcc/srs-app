// Applies prisma/reconcile-existing-db.sql to an EXISTING database, ignoring
// "duplicate column" / "already exists" errors so it is safe to re-run.
//
// Usage:
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/reconcile-existing-db.mjs
//   # or for a local file DB:
//   DATABASE_URL=file:./dev.db node scripts/reconcile-existing-db.mjs
//
// After it succeeds, baseline the DB:
//   npx prisma migrate resolve --applied 00000000000000_baseline

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@libsql/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "..", "prisma", "reconcile-existing-db.sql");

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) or DATABASE_URL.");
  process.exit(1);
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const IGNORE = /duplicate column name|already exists/i;

const statements = readFileSync(sqlPath, "utf8")
  .split(";")
  .map((s) => s.replace(/--.*$/gm, "").trim())
  .filter(Boolean);

let applied = 0;
let skipped = 0;
for (const stmt of statements) {
  try {
    await client.execute(stmt);
    applied++;
  } catch (e) {
    if (IGNORE.test(String(e?.message))) {
      skipped++;
    } else {
      console.error("FAILED:", stmt.split("\n")[0], "\n ", e.message);
      process.exit(1);
    }
  }
}

console.log(`Reconcile complete: ${applied} applied, ${skipped} already present.`);
console.log("Now run: npx prisma migrate resolve --applied 00000000000000_baseline");
