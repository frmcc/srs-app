const { createClient } = require("@libsql/client");
async function main() {
  const url = "libsql://tutorsrshost-frmcc13.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODAyMzAwODMsImlkIjoiMDE5ZTdkZmEtZjAwMS03YzExLTkxNmYtNTNhYzRlNmEwNGU5IiwicmlkIjoiYjQwYjk1MGYtMjQwYy00NWE0LWFiMGEtNWYwMThkNGIzZTk2In0.tgfoTJP4FPyLzuq2mWXmowMNgVExCotqoiB4cJuLSeKwdeNr4pPjnL7dtBiX0AgBZwlXd8jgP-5-qVYdtMXjCw";
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
