-- SRSItem: indexes for the dashboard list query (ORDER BY nextReviewDate) and subject grouping
CREATE INDEX IF NOT EXISTS "SRSItem_nextReviewDate_idx" ON "SRSItem"("nextReviewDate");
CREATE INDEX IF NOT EXISTS "SRSItem_subjectMain_idx" ON "SRSItem"("subjectMain");

-- BackgroundJob: updatedAt heartbeat for stale-job detection + poller index
ALTER TABLE "BackgroundJob" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "BackgroundJob_status_createdAt_idx" ON "BackgroundJob"("status", "createdAt");
