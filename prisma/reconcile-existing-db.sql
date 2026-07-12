-- Idempotent reconcile for an EXISTING database that was built by the old
-- ad-hoc scripts (create_tables*.sql / fix-prod-db.mjs) rather than by
-- `prisma migrate deploy`. It brings such a DB up to `schema.prisma` by adding
-- only the columns/tables/indexes that historically drifted out of the schema:
--   - the 5 comprehension* columns (created by NO previous path)
--   - AppConfig.wrapperMode / language (missing from several create paths)
--   - SRSItem.quiz6/quiz7/blueprint/coverageLedger/notebook*/podcast*/videoUrl
--   - BackgroundJob.updatedAt
--   - the tutorPromptDocId index
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`, so each ALTER is guarded by a
-- harmless failure: run this with a client that ignores "duplicate column"
-- errors, or use `scripts/reconcile-existing-db.mjs` which does exactly that.
--
-- AFTER running this, baseline the DB so Prisma considers the schema applied:
--   npx prisma migrate resolve --applied 00000000000000_baseline

ALTER TABLE "SRSItem" ADD COLUMN "comprehensionScore" REAL;
ALTER TABLE "SRSItem" ADD COLUMN "comprehensionPassed" BOOLEAN;
ALTER TABLE "SRSItem" ADD COLUMN "comprehensionAt" DATETIME;
ALTER TABLE "SRSItem" ADD COLUMN "comprehensionFeedback" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "comprehensionQuizText" TEXT;

ALTER TABLE "SRSItem" ADD COLUMN "quiz6DocId" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "quiz7DocId" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "blueprint" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "coverageLedger" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "semester" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SRSItem" ADD COLUMN "notebookId" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "prePodcastPrompt" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "postPodcastPrompt" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "prePodcastUrl" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "postPodcastUrl" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "videoUrl" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "tutorPromptContent" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "tutorPromptAssessmentContent" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- AppConfig may not exist at all on some create paths.
CREATE TABLE IF NOT EXISTS "AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "currentSemester" INTEGER NOT NULL DEFAULT 1,
    "modulePresets" TEXT NOT NULL DEFAULT '[]',
    "language" TEXT NOT NULL DEFAULT 'german',
    "wrapperMode" TEXT NOT NULL DEFAULT 'all',
    "wrapperModules" TEXT NOT NULL DEFAULT '{}',
    "fileTransport" TEXT NOT NULL DEFAULT 'inline',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "AppConfig" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'german';
ALTER TABLE "AppConfig" ADD COLUMN "wrapperMode" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "AppConfig" ADD COLUMN "wrapperModules" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "AppConfig" ADD COLUMN "fileTransport" TEXT NOT NULL DEFAULT 'inline';
-- Default model + per-Gemini-step model overrides. Additive. 2026-07-12.
ALTER TABLE "AppConfig" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'gemini-3.5-flash';
ALTER TABLE "AppConfig" ADD COLUMN "stepModels" TEXT NOT NULL DEFAULT '{}';

-- ReviewLog history columns (added post-hoc on several DBs).
ALTER TABLE "ReviewLog" ADD COLUMN "feedback" TEXT;
ALTER TABLE "ReviewLog" ADD COLUMN "itemId" TEXT;

ALTER TABLE "BackgroundJob" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "SRSItem_tutorPromptDocId_idx" ON "SRSItem"("tutorPromptDocId");
CREATE INDEX IF NOT EXISTS "SRSItem_nextReviewDate_idx" ON "SRSItem"("nextReviewDate");
CREATE INDEX IF NOT EXISTS "SRSItem_subjectMain_idx" ON "SRSItem"("subjectMain");
CREATE INDEX IF NOT EXISTS "ReviewLog_itemId_idx" ON "ReviewLog"("itemId");
CREATE INDEX IF NOT EXISTS "ReviewLog_completedAt_idx" ON "ReviewLog"("completedAt");
CREATE INDEX IF NOT EXISTS "BackgroundJob_status_createdAt_idx" ON "BackgroundJob"("status", "createdAt");
