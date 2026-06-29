import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  try {
    const res = await client.execute(`UPDATE "BackgroundJob" SET status = 'error', error = 'Cancelled by user' WHERE status IN ('pending', 'processing');`);
    console.log("Jobs cancelled:", res.rowsAffected);
  } catch (e) {
    console.log("Error:", e.message);
  }
}
run();
