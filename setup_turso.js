const { createClient } = require("@libsql/client");
const fs = require("fs");

async function main() {
  const url = "libsql://tutorsrshost-frmcc13.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODAyMzAwODMsImlkIjoiMDE5ZTdkZmEtZjAwMS03YzExLTkxNmYtNTNhYzRlNmEwNGU5IiwicmlkIjoiYjQwYjk1MGYtMjQwYy00NWE0LWFiMGEtNWYwMThkNGIzZTk2In0.tgfoTJP4FPyLzuq2mWXmowMNgVExCotqoiB4cJuLSeKwdeNr4pPjnL7dtBiX0AgBZwlXd8jgP-5-qVYdtMXjCw";

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
