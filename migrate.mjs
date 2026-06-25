import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  try {
    await client.execute('ALTER TABLE "AppConfig" ADD COLUMN "agentMode" BOOLEAN NOT NULL DEFAULT false;');
    console.log("Migration applied");
  } catch (e) {
    console.log("Error or already applied:", e.message);
  }
}
run();
