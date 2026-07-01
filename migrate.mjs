import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Idempotent ad-hoc migration runner for Turso (mirrors prisma/migrations).
const statements = [
  // 20260701100000_reviewlog_feedback_history
  'ALTER TABLE "ReviewLog" ADD COLUMN "feedback" TEXT;',
  'ALTER TABLE "ReviewLog" ADD COLUMN "itemId" TEXT;',
  'CREATE INDEX IF NOT EXISTS "ReviewLog_itemId_idx" ON "ReviewLog"("itemId");',
  'CREATE INDEX IF NOT EXISTS "ReviewLog_completedAt_idx" ON "ReviewLog"("completedAt");',
];

async function run() {
  for (const sql of statements) {
    try {
      await client.execute(sql);
      console.log("OK:", sql);
    } catch (e) {
      console.log("Skipped (already applied?):", sql, "—", e.message);
    }
  }
}
run();
