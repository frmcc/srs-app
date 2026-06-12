const { createClient } = require('@libsql/client');
require('dotenv').config();

const libsql = createClient({
  url: process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_URL.split('authToken=')[1]
});

async function main() {
  try {
    await libsql.execute(`ALTER TABLE "AppConfig" ADD COLUMN "useAiWrapper" BOOLEAN NOT NULL DEFAULT true;`);
    console.log("Column added successfully!");
  } catch (e) {
    console.error("Error adding column:", e.message);
  }
}
main();
