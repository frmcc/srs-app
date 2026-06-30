import { NextRequest } from "next/server";
import { v2 } from "@google-cloud/speech";

export const maxDuration = 30;

// Initialize the SpeechClient. On Cloud Run, it uses the default service account automatically.
// Locally, ensure you have run `gcloud auth application-default login`.
const speechClient = new v2.SpeechClient();

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

  try {
    // We dynamically get the project ID that the SpeechClient resolves from its environment.
    const projectId = await speechClient.getProjectId().catch(() => "auto-drive-494409");

    const [response] = await speechClient.recognize({
      // We use the global recognizer for the project
      recognizer: `projects/${projectId}/locations/global/recognizers/_`,
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
