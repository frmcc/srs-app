export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { runComprehensionQuizGeneration } from "@/lib/comprehension-quiz";

/** Models a client is allowed to request; anything else falls back to default. */
const ALLOWED_MODELS = new Set([
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
]);

/**
 * Verständnis-Check quiz generation endpoint (library button). Thin wrapper
 * over runComprehensionQuizGeneration: validates input, streams NDJSON
 * progress, and ships the generated quiz text in `done` so the client can
 * open it immediately (the list payload never carries comprehensionQuizText).
 *
 * Progress step contract (DashboardClient renders the message):
 *   0 history · 1 material · 2 generate · 3 save
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY. Please set it in your .env file and restart the server." },
      { status: 400 }
    );
  }

  let body: { itemId?: string; language?: string; modelName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { itemId } = body;
  if (!itemId) {
    return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
  }
  // Whitelist client-supplied language and model. `language` is interpolated
  // into the LLM system prompt, and an arbitrary `modelName` would let a caller
  // pick (and bill) any model. Unknown values fall back to the server defaults
  // (undefined → the lib reads AppConfig / its own default).
  const language = body.language === "english" || body.language === "german" ? body.language : undefined;
  const modelName = body.modelName && ALLOWED_MODELS.has(body.modelName) ? body.modelName : undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ event, data }) + "\n"));
        } catch {
          // Client disconnected — generation continues, the quiz lands in the DB.
        }
      };

      try {
        const result = await runComprehensionQuizGeneration({
          itemId,
          language,
          modelName,
          onProgress: (step, message) => sendEvent("progress", { step, message }),
        });

        sendEvent("done", { success: true, quizText: result.quizText });
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : "Unbekannter Fehler bei der Quiz-Generierung.";
        console.error("[comprehension] Generation failed:", error);
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
