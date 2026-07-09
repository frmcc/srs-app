-- Gemini file transport mode: "inline" ships PDFs as base64 inlineData parts,
-- "file_api" uploads them (official File API, or the AIStudioToAPI wrapper's
-- /upload proxy) and references the returned fileData URI instead.
ALTER TABLE "AppConfig" ADD COLUMN "fileTransport" TEXT NOT NULL DEFAULT 'inline';
