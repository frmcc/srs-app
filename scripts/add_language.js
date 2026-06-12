const { createClient } = require("@libsql/client");
require("dotenv").config();

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const client = createClient({ url, authToken });

  try {
    console.log("Adding language column to AppConfig...");
    await client.execute("ALTER TABLE AppConfig ADD COLUMN language TEXT DEFAULT 'german';");
  } catch (e) {
    console.log("language column might already exist", e.message);
  }

  console.log("Done adding columns!");
}
main();
