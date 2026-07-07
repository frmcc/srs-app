import { NextRequest } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";

export const maxDuration = 60;

// Confirmed against the Gemini TTS docs (gemini-3.1-flash-tts-preview, voice
// "Charon", PCM 24 kHz / mono / 16-bit). The "Director's Notes" block is the
// documented way to steer style/pace/accent.
// Overridable via env so a renamed/retired preview model is an .env fix, not a
// deploy: run `node scripts/check-tts.mjs` to find a working model name.
const TTS_MODEL = process.env.TTS_MODEL || "gemini-3.1-flash-tts-preview";
const VOICE_NAME = process.env.TTS_VOICE || "Charon";

/** Errors that no amount of retrying will fix — fail fast instead of backoff. */
const PERMANENT_ERROR_RE = /not[_ ]found|does not exist|is not supported|permission|api key|invalid argument|unauthenticated/i;

/**
 * Build the TTS prompt. The docs warn that bare text can make the model read the
 * director's notes aloud or trip the PROHIBITED_CONTENT classifier, so we add a
 * clear synthesis preamble and explicitly label where the spoken transcript begins.
 */
function buildTtsPrompt(text: string): string {
  return [
    'You are a text-to-speech engine. Speak ONLY the text under "### TRANSCRIPT" as natural spoken audio.',
    "Do not read these instructions or the director's notes out loud.",
    "",
    "### DIRECTOR'S NOTES",
    "Style: neutral, professional newscaster.",
    "Pace: neutral.",
    "Accent: neutral.",
    "",
    "### TRANSCRIPT",
    text,
  ].join("\n");
}

/** Wrap raw little-endian PCM (24 kHz, mono, 16-bit) in a 44-byte WAV header. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return new Response("Missing GEMINI_API_KEY", { status: 500 });
  }

  let text = "";
  try {
    const body = await req.json();
    text = String(body?.text ?? "").trim();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!text) return new Response("Missing text", { status: 400 });
  if (text.length > 4000) text = text.slice(0, 4000); // keep audio short & within limits

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = buildTtsPrompt(text);

  // The TTS model has two documented transient failures: 503 overload, and
  // "occasionally returns text tokens instead of audio" (empty audio / 500).
  // Both are fixed by retrying, so retry a few times before failing.
  const MAX_ATTEMPTS = 3;
  let lastError = "no audio returned";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
        },
      });
      const parts = res.candidates?.[0]?.content?.parts ?? [];
      const audioData = parts.find((p) => p?.inlineData?.data)?.inlineData?.data;
      if (!audioData) {
        lastError = "model returned text instead of audio";
        console.warn(`[tts] attempt ${attempt}/${MAX_ATTEMPTS}: ${lastError}`);
        // Brief pause before retrying — without it this path fired up to 3 paid
        // generations back-to-back within ~2s.
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      const wav = pcmToWav(Buffer.from(audioData, "base64"));
      return new Response(new Uint8Array(wav), {
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": String(wav.length),
          "Cache-Control": "private, max-age=600",
        },
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[tts] attempt ${attempt}/${MAX_ATTEMPTS} failed (model=${TTS_MODEL}): ${lastError}`);
      // A missing/renamed model or key problem won't heal in 700ms — surface it
      // immediately so the client can log the real cause instead of timing out.
      if (PERMANENT_ERROR_RE.test(lastError)) break;
      // Rate limits need a real pause (RPM windows), transient 503s only a nudge.
      // Kept short enough that 3 attempts stay inside the client's 25s budget.
      const isRateLimit = /429|quota|rate|exhaust|overload/i.test(lastError);
      await new Promise((r) => setTimeout(r, (isRateLimit ? 3000 : 700) * attempt));
    }
  }
  // Log the raw upstream reason server-side, but return a generic message —
  // don't echo provider internals (quota/model details) to the client.
  console.error(`[tts] giving up (model=${TTS_MODEL}, voice=${VOICE_NAME}):`, lastError);
  return new Response("TTS failed. Please try again.", { status: 502 });
}
