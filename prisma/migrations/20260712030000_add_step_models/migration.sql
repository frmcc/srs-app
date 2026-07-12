-- Default model + per-Gemini-step model overrides.
ALTER TABLE "AppConfig" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'gemini-3.5-flash';
ALTER TABLE "AppConfig" ADD COLUMN "stepModels" TEXT NOT NULL DEFAULT '{}';
