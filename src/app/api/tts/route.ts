import { NextRequest } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";

export const maxDuration = 60;

// Confirmed against the Gemini TTS docs (gemini-3.1-flash-tts-preview, voice
// "Charon", PCM 24 kHz / mono / 16-bit). The "Director's Notes" block is the
// documented way to steer style/pace/accent.
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const VOICE_NAME = "Charon";

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
      console.warn(`[tts] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`);
      await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }
  console.error("[tts] giving up:", lastError);
  return new Response(`TTS failed: ${lastError}`, { status: 502 });
}
