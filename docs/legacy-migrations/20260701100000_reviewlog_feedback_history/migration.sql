-- Feedback history: keep every review's Remediation Brief instead of only the
-- latest one on the SRSItem. itemId is a soft reference (no FK) so logs survive
-- module deletion.
ALTER TABLE "ReviewLog" ADD COLUMN "feedback" TEXT;
ALTER TABLE "ReviewLog" ADD COLUMN "itemId" TEXT;

CREATE INDEX "ReviewLog_itemId_idx" ON "ReviewLog"("itemId");
CREATE INDEX "ReviewLog_completedAt_idx" ON "ReviewLog"("completedAt");
