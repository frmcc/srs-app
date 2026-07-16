export const maxDuration = 300;
import { NextRequest, NextResponse, after } from "next/server";
import { runGradingPipeline, GradingMismatchError, ConcurrentGradingError, type GradingSketch } from "@/lib/grading-pipeline";
import { DecisionParseError } from "@/lib/markers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { scribbleEnabledForEmail } from "@/lib/feature-flags";

/** Models a client may request; anything else falls back to the pipeline default. */
const ALLOWED_MODELS = new Set([
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-pro",
  "gemini-3.1-pro-preview",
  "gemini-3.1-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
]);

/**
 * Web grading endpoint. Thin wrapper over runGradingPipeline:
 * validates input, streams NDJSON progress, defers Drive/NotebookLM work.
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY. Please set it in your .env file and restart the server." },
      { status: 400 }
    );
  }

  let body: { itemId?: string; studentAnswers?: string; language?: string; modelName?: string; comprehension?: boolean; sketches?: unknown; structuredAnswers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { itemId, studentAnswers, language, modelName, comprehension, sketches, structuredAnswers } = body;
  if (!itemId) {
    return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
  }

  // ── Structured answers (revisit snapshot) ─────────────────────────────────
  // Optional per-task copy of the answers, persisted (latest attempt only) so
  // the answered quiz can be revisited. Malformed shapes are dropped, not 400d:
  // the snapshot is a bonus artifact and must never block a grading run.
  const MAX_SNAPSHOT_ANSWER_CHARS = 40_000;   // one answer box
  const MAX_SNAPSHOT_TOTAL_CHARS = 400_000;   // all boxes together
  let cleanStructuredAnswers: { tasks: Record<string, string>; free: string } | undefined;
  if (structuredAnswers && typeof structuredAnswers === "object") {
    const tasks: Record<string, string> = {};
    let total = 0;
    const rawTasks = (structuredAnswers as { tasks?: unknown }).tasks;
    if (rawTasks && typeof rawTasks === "object") {
      for (const [taskId, answer] of Object.entries(rawTasks as Record<string, unknown>)) {
        if (typeof answer !== "string" || !answer.trim()) continue;
        const clipped = answer.slice(0, MAX_SNAPSHOT_ANSWER_CHARS);
        total += clipped.length;
        if (total > MAX_SNAPSHOT_TOTAL_CHARS) break;
        tasks[taskId.slice(0, 80)] = clipped;
      }
    }
    const rawFree = (structuredAnswers as { free?: unknown }).free;
    const free = typeof rawFree === "string" ? rawFree.slice(0, MAX_SNAPSHOT_TOTAL_CHARS) : "";
    if (Object.keys(tasks).length > 0 || free.trim()) {
      cleanStructuredAnswers = { tasks, free };
    }
  }

  // Gate the client-supplied model through an allow-list (mirrors quiz/route.ts):
  // an unvalidated modelName must never flow into the grading pipeline.
  const safeModel = modelName && ALLOWED_MODELS.has(modelName) ? modelName : undefined;

  // ── Scribbled answer boxes (allowlist feature) ────────────────────────────
  // Normalize + validate BEFORE opening the stream: strip the data-URL prefix,
  // whitelist raster mime types, and cap count/size so a buggy client can't
  // ship megabytes of junk into every Gemini call of the pipeline.
  const MAX_SKETCHES = 20;
  const MAX_SKETCH_B64_CHARS = 3_000_000;  // ~2.2 MB image each
  const MAX_TOTAL_B64_CHARS = 16_000_000;  // ~12 MB total
  const ALLOWED_SKETCH_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
  let normalizedSketches: GradingSketch[] | undefined;
  if (sketches !== undefined) {
    if (!Array.isArray(sketches) || sketches.length > MAX_SKETCHES) {
      return NextResponse.json({ error: "Invalid sketches payload" }, { status: 400 });
    }
    let totalChars = 0;
    const cleaned: GradingSketch[] = [];
    for (const raw of sketches) {
      const label = typeof raw?.label === "string" ? raw.label.trim().slice(0, 80) : "";
      const taskId = typeof raw?.taskId === "string" ? raw.taskId.trim().slice(0, 80) : undefined;
      const image = typeof raw?.image === "string" ? raw.image : "";
      // Accept "data:image/png;base64,AAAA…" or raw base64 (PNG assumed).
      const dataUrlMatch = image.match(/^data:([a-z0-9./+-]+);base64,(.+)$/i);
      const mimeType = dataUrlMatch ? dataUrlMatch[1].toLowerCase() : "image/png";
      const data = dataUrlMatch ? dataUrlMatch[2] : image;
      if (!label || !data || !ALLOWED_SKETCH_MIMES.has(mimeType) || !/^[A-Za-z0-9+/=\s]+$/.test(data)) {
        return NextResponse.json({ error: "Invalid sketch entry (label/image)" }, { status: 400 });
      }
      if (data.length > MAX_SKETCH_B64_CHARS || (totalChars += data.length) > MAX_TOTAL_B64_CHARS) {
        return NextResponse.json({ error: "Sketch images too large" }, { status: 413 });
      }
      cleaned.push({ label, data: data.replace(/\s+/g, ""), mimeType, taskId });
    }
    if (cleaned.length > 0) normalizedSketches = cleaned;
  }

  // Server-side re-check of the allowlist (the client UI is only the first gate).
  // No DB users here (JWT sessions), so we read the email straight off the
  // session. Fails closed: no session ⇒ no sketches.
  if (normalizedSketches) {
    const session = await getServerSession(authOptions);
    if (!scribbleEnabledForEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Scribble answers are not enabled for this account." }, { status: 403 });
    }
  }

  // A submission may be typed text, sketches, or both — but never neither.
  if ((!studentAnswers || !studentAnswers.trim()) && !normalizedSketches) {
    return NextResponse.json({ error: "Student answers are required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ event, data }) + "\n"));
        } catch {
          // Client disconnected — pipeline continues, results land in the DB.
        }
      };

      try {
        const result = await runGradingPipeline({
          itemId,
          submission: { text: studentAnswers, sketches: normalizedSketches },
          language,
          modelName: safeModel,
          comprehension: comprehension === true,
          structuredAnswers: cleanStructuredAnswers,
          onProgress: (step, message) => sendEvent("progress", { step, message }),
        });

        sendEvent("done", {
          success: true,
          isPass: result.isPass,
          feedback: result.cleanFeedback,
          // Only set in comprehension mode — the library rating updates from this.
          comprehensionScore: result.comprehensionScore ?? null,
          srsItem: result.updatedItem,
        });

        // Drive doc + NotebookLM worker after the response is done streaming.
        after(result.postActions);
      } catch (error) {
        const message =
          error instanceof GradingMismatchError ||
          error instanceof ConcurrentGradingError ||
          error instanceof DecisionParseError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unbekannter Fehler bei der Bewertung.";
        console.error("[grade] Pipeline failed:", error);
        sendEvent("error", { message });
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
      Connection: "keep-alive",
    },
  });
}
