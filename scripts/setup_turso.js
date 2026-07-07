const { createClient } = require("@libsql/client");
const fs = require("fs");

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    console.error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in the environment.");
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  const sql = fs.readFileSync("create_tables.sql", "utf-8");
  const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0);

  for (const stmt of statements) {
    console.log("Executing:", stmt.split("\n")[0]);
    try {
      await client.execute(stmt);
    } catch (e) {
      console.error(e);
    }
  }

  // initialize AppConfig
  try {
    await client.execute("INSERT INTO AppConfig (currentSemester, updatedAt) VALUES (1, CURRENT_TIMESTAMP)");
  } catch (e) {}

  console.log("Done!");
}

main();
