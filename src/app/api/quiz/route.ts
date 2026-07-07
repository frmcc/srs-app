export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { runQuizGeneration } from "@/lib/quiz-generator";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

/** Models a client may request; anything else falls back to the generator default. */
const ALLOWED_MODELS = new Set([
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
]);

/**
 * Web quiz generation endpoint. Thin wrapper over runQuizGeneration:
 * saves uploads to temp files, streams NDJSON progress, sends `done` as soon
 * as the item exists (podcast uploads continue inside the generator, which
 * also owns temp-file cleanup).
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Missing API Key", details: "Set GEMINI_API_KEY in your .env file." },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error("Form parsing error:", err);
    return NextResponse.json({ error: "Failed to parse form data." }, { status: 500 });
  }

  const subjectMain = formData.get("subjectMain") as string;
  const subjectSub = (formData.get("subjectSub") as string) || "Module";
  const textContent = (formData.get("content") as string) || "";
  const files = formData.getAll("files") as File[];
  const rawModel = formData.get("modelName") as string | null;
  const modelName = rawModel && ALLOWED_MODELS.has(rawModel) ? rawModel : undefined;

  if (!subjectMain) {
    return NextResponse.json({ error: "Bitte fülle alle Pflichtfelder aus." }, { status: 400 });
  }
  if (!textContent.trim() && files.length === 0) {
    return NextResponse.json({ error: "Missing subject or content." }, { status: 400 });
  }

  // Persist uploads to temp files BEFORE streaming starts — the generator
  // reads them from disk (Gemini upload, text extraction, Drive, NotebookLM).
  const uploadsDir = path.join(os.tmpdir(), "srs-uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const filePaths: { name: string; path: string; mimeType: string }[] = [];
  for (const file of files) {
    if (file.size === 0) continue;
    const uniqueFileName = `${Date.now()}-${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const localFilePath = path.join(uploadsDir, uniqueFileName);
    await fs.writeFile(localFilePath, Buffer.from(await file.arrayBuffer()));
    filePaths.push({ name: file.name, path: localFilePath, mimeType: file.type || "application/octet-stream" });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ event, data }) + "\n"));
        } catch {
          // Client disconnected — generation continues, results land in the DB.
        }
      };

      try {
        await runQuizGeneration({
          subjectMain,
          subjectSub,
          textContent,
          filePaths,
          modelName,
          onProgress: (step, message) => sendEvent("progress", { step, message }),
          // Fire `done` the moment the item exists — podcast uploads keep
          // running inside the generator without blocking the UI.
          onCreated: (item) => sendEvent("done", { success: true, srsItem: item }),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("Quiz generation error:", error);
        sendEvent("error", { message: error.message });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
