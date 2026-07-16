-- Answered-quiz snapshots for the revisit feature: latest attempt only, written
-- in the same transaction as lastFeedback / comprehensionFeedback so snapshot
-- and assessment always describe the same attempt.
ALTER TABLE "SRSItem" ADD COLUMN "lastAnswersJson" TEXT;
ALTER TABLE "SRSItem" ADD COLUMN "comprehensionAnswersJson" TEXT;
