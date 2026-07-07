const { createClient } = require("@libsql/client");
async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    console.error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in the environment.");
    process.exit(1);
  }
  const client = createClient({ url, authToken });
  await client.execute(`
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectMain" TEXT NOT NULL,
    "subjectSub" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
  `);
  console.log("ReviewLog table created");
}
main();
