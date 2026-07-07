import { createClient } from "@libsql/client";
import fs from "fs";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
if (!process.env.TURSO_DATABASE_URL) {
  console.error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in the environment.");
  process.exit(1);
}

async function run() {
  try {
    const sql = fs.readFileSync("schema.sql", "utf-8");
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.includes("sqlite_sequence"));
    
    console.log(`Executing ${statements.length} statements...`);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
    console.log("Schema imported successfully to Turso!");
  } catch (e) {
    console.error("Error importing schema:", e);
  }
}
run();
