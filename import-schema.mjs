import { createClient } from "@libsql/client";
import fs from "fs";

const client = createClient({
  url: "https://tutorsrspersonal-frmcc13.aws-eu-west-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODExMDQyNDgsImlkIjoiMDE5ZWIyMTUtYzYwMS03MDE2LTgyOWYtZjJmNzIzNjk3MDAxIiwicmlkIjoiMDE3MzE1YTMtYWM5OC00MjEwLWJlMzAtZTQxNjdhN2Y3NDAwIn0.Mu7Xikwg1IO1F03UmRi-5fUKZiAttTQVnCaGURv7gJ5gc6wgHmA7OlM9Hh8X1qC8SSVMvmf2RDZMirjUrmUrAA",
});

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
