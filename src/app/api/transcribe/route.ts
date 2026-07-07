import { NextRequest } from "next/server";
import { v2 } from "@google-cloud/speech";

export const maxDuration = 30;

// Initialize the SpeechClient. On Cloud Run, it uses the default service account automatically.
// Locally, ensure you have run `gcloud auth application-default login`.
const speechClient = new v2.SpeechClient({
  apiEndpoint: 'europe-west4-speech.googleapis.com',
});

export async function POST(req: NextRequest) {
  const lang = new URL(req.url).searchParams.get("lang") || "German";
  const languageCode = lang.toLowerCase().startsWith("english") ? "en-US" : "de-DE";

  let buf: Buffer;
  try {
    buf = Buffer.from(await req.arrayBuffer());
  } catch {
    return Response.json({ text: "", error: "Invalid body" }, { status: 400 });
  }

  if (buf.length === 0) {
    return Response.json({ text: "" });
  }
  // The Speech v2 sync API caps inline audio at ~10 MB / ~1 min; reject oversized
  // clips up front instead of buffering + round-tripping them to be rejected.
  if (buf.length > 10 * 1024 * 1024) {
    return Response.json({ text: "", error: "Audio too large" }, { status: 413 });
  }

  try {
    // Resolve the GCP project from the environment/ADC. Do NOT bake a specific
    // project id in as a fallback — a wrong one silently mis-routes recognition.
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      (await speechClient.getProjectId().catch(() => ""));
    if (!projectId) {
      console.error("[transcribe] could not resolve GCP project id");
      return Response.json({ text: "", error: "Transcription unavailable" }, { status: 503 });
    }

    const [response] = await speechClient.recognize({
      // We use the europe-west4 location because the "chirp" model is not available in global
      recognizer: `projects/${projectId}/locations/europe-west4/recognizers/_`,
      config: {
        autoDecodingConfig: {},
        model: "chirp",
        languageCodes: [languageCode],
      },
      content: buf, // v2 Speech API accepts Uint8Array directly for content
    });

    let transcribedText = "";
    if (response.results) {
      for (const result of response.results) {
        if (result.alternatives && result.alternatives.length > 0) {
          transcribedText += (result.alternatives[0].transcript || "") + " ";
        }
      }
    }

    return Response.json({ text: transcribedText.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[transcribe] failed:", msg);
    return Response.json({ text: "", error: msg }, { status: 502 });
  }
}
