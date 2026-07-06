export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { runComprehensionQuizGeneration } from "@/lib/comprehension-quiz";

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

  const { itemId, language, modelName } = body;
  if (!itemId) {
    return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
  }

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
