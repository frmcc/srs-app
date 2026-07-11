-- Split tutor prompts by phase: tutorPromptContent stays the quiz-phase
-- (pre-grading) prompt; this column holds the assessment-phase (post-grading)
-- prompt. NULL on old items — the chat route falls back to the quiz prompt.
ALTER TABLE "SRSItem" ADD COLUMN "tutorPromptAssessmentContent" TEXT;
