import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 30;

// Flash is plenty for verbatim transcription and cheap (~$0.001/min of audio).
const MODEL = "gemini-3.5-flash";

/**
 * Speech-to-text for interactive mode. The browser records the spoken answer and
 * POSTs the (growing) audio clip here; Gemini transcribes it verbatim. Used by the
 * "smart hybrid" dictation: the client polls this every couple of seconds so the
 * answer box fills and the "nächste Aufgabe" command is detected — reliably on
 * iOS, where the browser's own Web Speech API is flaky.
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ text: "", error: "Missing GEMINI_API_KEY" }, { status: 500 });
  }

  const lang = new URL(req.url).searchParams.get("lang") || "German";
  // MediaRecorder sends e.g. "audio/mp4" (iOS) or "audio/webm" (Chrome); strip codecs.
  let mimeType = (req.headers.get("content-type") || "audio/webm").split(";")[0].trim();
  if (!mimeType.startsWith("audio/")) mimeType = "audio/webm";

  let buf: Buffer;
  try {
    buf = Buffer.from(await req.arrayBuffer());
  } catch {
    return Response.json({ text: "", error: "Invalid body" }, { status: 400 });
  }
  if (buf.length === 0) return Response.json({ text: "" });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: buf.toString("base64") } },
            {
              text:
                `Transcribe the spoken audio VERBATIM in ${lang}. ` +
                "Output ONLY the exact words spoken — no labels, quotation marks, timestamps, translations or commentary. " +
                "If there is no intelligible speech, output nothing at all.",
            },
          ],
        },
      ],
    });
    return Response.json({ text: (res.text || "").trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[transcribe] failed:", msg);
    return Response.json({ text: "", error: msg }, { status: 502 });
  }
}
