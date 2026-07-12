-- Per-module wrapper on/off: JSON map { "<module name>": true }. Replaces the
-- old global 3-way wrapperMode. A module absent (or false) uses the native
-- Gemini API. The native File API upload still runs on any native/fallback call,
-- so fallback works regardless of these toggles. Old wrapperMode column is kept
-- for migration safety but no longer read.
ALTER TABLE "AppConfig" ADD COLUMN "wrapperModules" TEXT NOT NULL DEFAULT '{}';
