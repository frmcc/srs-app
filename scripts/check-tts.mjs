/**
 * TTS-Diagnose: findet heraus, warum /api/tts fehlschlägt.
 *
 * Ausführen (auf deinem Mac, im Projektordner):
 *   node scripts/check-tts.mjs
 *
 * Das Skript:
 *  1. listet alle Modelle deines API-Keys und zeigt die TTS-fähigen,
 *  2. testet das aktuell konfigurierte Modell (TTS_MODEL bzw. Default),
 *  3. testet jedes gefundene TTS-Modell mit einem kurzen Satz,
 *  4. schreibt funktionierende Audios nach /tmp/tts-check-<modell>.wav,
 *  5. sagt dir am Ende, welche Zeile du in .env / .env.yaml setzen sollst.
 */
import { GoogleGenAI } from "@google/genai";
import { writeFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config();

const CONFIGURED_MODEL = process.env.TTS_MODEL || "gemini-3.1-flash-tts-preview";
const CONFIGURED_VOICE = process.env.TTS_VOICE || "Charon";
const SAMPLE = "Dies ist ein kurzer Test der Sprachausgabe.";

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY fehlt in .env");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function pcmToWav(pcm, sampleRate = 24000, channels = 1, bits = 16) {
  const blockAlign = (channels * bits) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function tryTts(model, voice) {
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: `Sprich den folgenden Text: ${SAMPLE}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    const parts = res.candidates?.[0]?.content?.parts ?? [];
    const audio = parts.find((p) => p?.inlineData?.data)?.inlineData?.data;
    if (!audio) {
      const textInstead = parts.map((p) => p?.text).filter(Boolean).join(" ").slice(0, 120);
      return { ok: false, reason: `kein Audio zurückgegeben${textInstead ? ` (Text stattdessen: "${textInstead}")` : ""}` };
    }
    const wav = pcmToWav(Buffer.from(audio, "base64"));
    const file = `/tmp/tts-check-${model.replace(/[^a-z0-9.-]/gi, "_")}.wav`;
    writeFileSync(file, wav);
    return { ok: true, file, bytes: wav.length };
  } catch (e) {
    return { ok: false, reason: `${e?.status ?? ""} ${e?.message ?? e}`.trim() };
  }
}

async function run() {
  console.log(`\n— Konfiguriert: TTS_MODEL=${CONFIGURED_MODEL}  TTS_VOICE=${CONFIGURED_VOICE}\n`);

  // 1) Modelle auflisten
  const ttsModels = [];
  try {
    const pager = await ai.models.list();
    console.log("Verfügbare Modelle mit »tts« im Namen:");
    for await (const m of pager) {
      const name = (m.name || "").replace(/^models\//, "");
      if (/tts/i.test(name)) {
        ttsModels.push(name);
        console.log(`  • ${name}${m.description ? ` — ${String(m.description).slice(0, 70)}` : ""}`);
      }
    }
    if (!ttsModels.length) console.log("  (keins gefunden — dein Key sieht evtl. keine TTS-Modelle)");
  } catch (e) {
    console.log("Modell-Liste fehlgeschlagen:", e?.message ?? e);
  }

  // 2) Konfiguriertes Modell testen
  console.log(`\nTest 1 — konfiguriertes Modell "${CONFIGURED_MODEL}" mit Stimme "${CONFIGURED_VOICE}":`);
  const configured = await tryTts(CONFIGURED_MODEL, CONFIGURED_VOICE);
  console.log(configured.ok ? `  ✓ OK → ${configured.file} (${configured.bytes} Bytes) — anhören: afplay ${configured.file}` : `  ✗ FEHLER: ${configured.reason}`);

  // 3) Alle gefundenen TTS-Modelle testen
  const working = configured.ok ? [CONFIGURED_MODEL] : [];
  for (const model of ttsModels.filter((m) => m !== CONFIGURED_MODEL)) {
    console.log(`\nTest — "${model}":`);
    const r = await tryTts(model, CONFIGURED_VOICE);
    console.log(r.ok ? `  ✓ OK → ${r.file} — anhören: afplay ${r.file}` : `  ✗ ${r.reason}`);
    if (r.ok) working.push(model);
  }

  // 4) Empfehlung
  console.log("\n————————————————————————————————");
  if (configured.ok) {
    console.log("Das konfigurierte Modell funktioniert. Wenn die App trotzdem die Roboterstimme nutzt,");
    console.log("schau in die Browser-Konsole (der TTS-Fehler wird jetzt dort geloggt) bzw. in die Cloud-Run-Logs ([tts] …).");
  } else if (working.length) {
    console.log(`FIX: Setze in .env UND .env.yaml:\n\n  TTS_MODEL=${working[0]}\n`);
    console.log("Danach Server neu starten / neu deployen.");
  } else {
    console.log("Kein TTS-Modell funktioniert mit diesem Key. Prüfe, ob der Key TTS-Zugriff hat");
    console.log("(AI Studio → API-Key-Berechtigungen) oder ob eine andere Stimme nötig ist (TTS_VOICE).");
  }
}
run();
