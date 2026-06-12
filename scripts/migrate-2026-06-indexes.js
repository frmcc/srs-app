/**
 * Migration: dashboard indexes + BackgroundJob.updatedAt heartbeat.
 * Run once from the repo root:  node scripts/migrate-2026-06-indexes.js
 * (Applies to the Turso DB from TURSO_DATABASE_URL; idempotent.)
 */
const { createClient } = require("@libsql/client");
require("dotenv").config();

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const run = async (label, sql) => {
    try {
      await client.execute(sql);
      console.log(`✓ ${label}`);
    } catch (e) {
      if (/duplicate column name|already exists/i.test(e.message)) {
        console.log(`- ${label} (already applied)`);
      } else {
        throw e;
      }
    }
  };

  await run("SRSItem.nextReviewDate index", 'CREATE INDEX IF NOT EXISTS "SRSItem_nextReviewDate_idx" ON "SRSItem"("nextReviewDate")');
  await run("SRSItem.subjectMain index", 'CREATE INDEX IF NOT EXISTS "SRSItem_subjectMain_idx" ON "SRSItem"("subjectMain")');
  // SQLite forbids non-constant defaults in ALTER TABLE — add nullable, then backfill.
  await run("BackgroundJob.updatedAt column", 'ALTER TABLE "BackgroundJob" ADD COLUMN "updatedAt" DATETIME');
  await run("BackgroundJob.updatedAt backfill", 'UPDATE "BackgroundJob" SET "updatedAt" = COALESCE("completedAt", "createdAt") WHERE "updatedAt" IS NULL');
  await run("BackgroundJob poller index", 'CREATE INDEX IF NOT EXISTS "BackgroundJob_status_createdAt_idx" ON "BackgroundJob"("status", "createdAt")');

  console.log("Migration complete.");
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
