-- AppConfig: opt-in "Agent Mode" (managed-agent critique-revise pass).
-- If the column was already added manually via `prisma db push` during the
-- earlier experiment, drop/skip this statement before running `migrate deploy`
-- (SQLite has no ADD COLUMN IF NOT EXISTS). For dev, `prisma db push` reconciles
-- without error.
ALTER TABLE "AppConfig" ADD COLUMN "agentMode" BOOLEAN NOT NULL DEFAULT false;
