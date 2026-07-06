export const maxDuration = 300;
import { NextRequest, NextResponse, after } from "next/server";
import { runGradingPipeline, GradingMismatchError, ConcurrentGradingError } from "@/lib/grading-pipeline";
import { DecisionParseError } from "@/lib/markers";

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

  let body: { itemId?: string; studentAnswers?: string; language?: string; modelName?: string; comprehension?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { itemId, studentAnswers, language, modelName, comprehension } = body;
  if (!itemId) {
    return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
  }
  if (!studentAnswers || !studentAnswers.trim()) {
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
          submission: { text: studentAnswers },
          language,
          modelName,
          comprehension: comprehension === true,
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
