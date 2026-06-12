const { createClient } = require("@libsql/client");
require("dotenv").config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  try {
    await client.execute(`ALTER TABLE AppConfig ADD COLUMN wrapperMode TEXT NOT NULL DEFAULT 'all';`);
    console.log("Migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}
main();
