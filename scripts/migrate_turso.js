const { createClient } = require("@libsql/client");
require("dotenv").config();

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    console.log("Adding quiz6DocId...");
    await client.execute("ALTER TABLE SRSItem ADD COLUMN quiz6DocId TEXT;");
    console.log("Adding quiz7DocId...");
    await client.execute("ALTER TABLE SRSItem ADD COLUMN quiz7DocId TEXT;");
    console.log("Migration successful!");
  } catch (e) {
    if (e.message.includes("duplicate column name")) {
      console.log("Columns already exist.");
    } else {
      console.error("Migration failed:", e);
    }
  }
}

main();
