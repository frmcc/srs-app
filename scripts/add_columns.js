const { createClient } = require("@libsql/client");
require("dotenv").config();

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const client = createClient({ url, authToken });

  try {
    console.log("Adding blueprint column...");
    await client.execute("ALTER TABLE SRSItem ADD COLUMN blueprint TEXT;");
  } catch (e) {
    console.log("Blueprint column might already exist", e.message);
  }

  try {
    console.log("Adding coverageLedger column...");
    await client.execute("ALTER TABLE SRSItem ADD COLUMN coverageLedger TEXT;");
  } catch (e) {
    console.log("coverageLedger column might already exist", e.message);
  }

  console.log("Done adding columns!");
}
main();
