export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";
import { currentQuizText } from "@/lib/srs";
import { extractSectionOr } from "@/lib/markers";

/**
 * Live-Tutor chat next to the quiz. The web twin of the Cloud Run audio tutor:
 * same per-module system prompt (tutorPromptContent), same socratic pedagogy,
 * same client-held session memory — but text-streamed instead of TTS-chunked,
 * and instead of an iPad screenshot the tutor sees the ACTUAL quiz tasks plus
 * the student's current draft answers.
 *
 * Auth: POST under /api/tutor/* is covered by the middleware fail-closed rule.
 */

const DEFAULT_MODEL = process.env.TUTOR_CHAT_MODEL || "gemini-3.5-flash";
const MAX_TURNS = 24; // history cap (12 exchanges) — the client also caps
const MAX_MSG_CHARS = 6000;
const MAX_DRAFT_CHARS = 12000;

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

interface ChatRequestBody {
  itemId?: string;
  messages?: ChatMessage[];
  /** Formatted current draft answers (client-built, optional). */
  drafts?: string;
  language?: string;
  /** Set when the chat was opened from ONE task's Tutor button — the tutor is
   *  told to concentrate on it, and its question + draft (+ grader assessment
   *  when opened from the task-by-task review) are attached. */
  focusedTask?: { label?: string; questionText?: string; draft?: string; assessment?: string };
  /** Base64 PNG (no data: prefix) of the scribbled answer for the focused task,
   *  sent once at the start of a per-task thread. */
  focusedSketch?: string;
}

function defaultTutorRole(subject: string): string {
  return [
    "Rolle:",
    `Du bist ein ruhiger, geduldiger Tutor für das Modul "${subject}".`,
    "Du hilfst Schritt für Schritt, knapp und konkret, mit Hilfe zur Selbsthilfe statt Fertiglösungen.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY." }, { status: 500 });
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { itemId } = body;
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = rawMessages
    .filter((m): m is ChatMessage => !!m && (m.role === "user" || m.role === "model") && typeof m.text === "string" && !!m.text.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_MSG_CHARS) }));

  // After trimming to the last MAX_TURNS, the window can start with a `model`
  // turn — some Gemini API versions reject a history that doesn't start with a
  // user turn. Drop any leading model turns so it always begins with `user`.
  while (messages.length && messages[0].role === "model") messages.shift();

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user." }, { status: 400 });
  }

  const item = await prisma.sRSItem.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const subject = `${item.subjectMain} — ${item.subjectSub}`;
  const language = body.language === "english" ? "english" : "german";

  // Per-module tutor role (the same prompt the iPad audio tutor fetches).
  const storedRole = (item.tutorPromptContent || "").trim();
  const baseRole = storedRole.startsWith("Rolle:") ? storedRole : defaultTutorRole(subject);

  // The student-facing quiz for the CURRENT level (marker-extracted; legacy
  // quizzes without markers fall back to the full stored text).
  const fullQuiz = currentQuizText(item);
  const studentQuiz = extractSectionOr(fullQuiz, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===", fullQuiz).trim();

  const technical = [
    "WEB-CHAT KONTEXT (überschreibt widersprechende Regeln deiner Rolle):",
    `- Du chattest als TEXT-Chat im Lernsystem, direkt neben dem aktiven Quiz zu "${subject}".`,
    "- Es gibt KEINE Sprachausgabe-Pipeline: Ignoriere alle Regeln deiner Rolle zu Chunk-0/„nahtloser Sprachanschluss“, TTS, Diktierfehlern und Screenshots. Begrüße nicht, steige direkt inhaltlich ein.",
    "- Unten stehen die AKTUELLEN QUIZAUFGABEN des Studenten. In der Nachricht können zusätzlich seine aktuellen Antwort-Entwürfe mitkommen.",
    "- Hilfe zur Selbsthilfe: Führe mit gezielten Hinweisen, Zwischenfragen und Ankern zum Ziel. Die komplette Lösung einer Quizaufgabe nennst du nur, wenn der Student ausdrücklich danach fragt — dann mit kurzer Begründung.",
    "- Du bewertest nicht endgültig (das macht der Prüfer nach der Abgabe), aber du darfst Entwürfe kommentieren und konkret verbessern helfen.",
    "- Antworte kompakt (Richtwert: unter 8 Sätze, außer der Student bittet um mehr). Kurze Absätze; einfache Listen sind erlaubt, kein übertriebenes Markdown, keine Überschriften.",
    "",
    "AKTUELLE QUIZAUFGABEN DES STUDENTEN:",
    studentQuiz || "(Für dieses Modul liegt gerade kein Quiztext vor — hilf anhand deiner Rolle und des Gesprächs.)",
  ].join("\n");

  const languageInstruction = `\n\nCRITICAL: Antworte ausschließlich auf ${language === "english" ? "ENGLISCH" : "DEUTSCH"}.`;
  const systemInstruction = `${baseRole}\n\n${technical}${languageInstruction}`;

  // Attach current drafts (and, for a per-task chat, the focused task + its
  // scribble) to the LAST user turn — this context changes every message.
  const drafts = (body.drafts || "").trim().slice(0, MAX_DRAFT_CHARS);
  const focused = body.focusedTask;
  const focusSketch =
    typeof body.focusedSketch === "string" && body.focusedSketch.length < 8_000_000
      ? body.focusedSketch
      : "";
  type Part = { text: string } | { inlineData: { data: string; mimeType: string } };
  const contents = messages.map((m, idx) => {
    const parts: Part[] = [];
    const isLast = idx === messages.length - 1;
    if (isLast && focused && (focused.label || focused.questionText)) {
      const q = (focused.questionText || "").trim();
      const d = (focused.draft || "").trim().slice(0, MAX_DRAFT_CHARS);
      const a = (focused.assessment || "").trim().slice(0, MAX_DRAFT_CHARS);
      parts.push({
        text:
          "FOKUS-AUFGABE — der Student fragt gezielt zu DIESER Aufgabe. Bleib bei ihr, außer er wechselt selbst das Thema.\n" +
          `${focused.label || ""}${q ? `\n${q}` : ""}` +
          (d ? `\n\nAktueller Antwort-Entwurf des Studenten zu dieser Aufgabe:\n${d}` : "") +
          (a ? `\n\nBewertung des Prüfers zu dieser Aufgabe (nutze sie, um gezielt an den Lücken zu arbeiten):\n${a}` : ""),
      });
      if (focusSketch) {
        parts.push({ text: "Handschriftliche/gescribbelte Antwort des Studenten zu dieser Aufgabe (Bild):" });
        parts.push({ inlineData: { data: focusSketch, mimeType: "image/png" } });
      }
    }
    if (isLast && drafts) {
      parts.push({ text: `AKTUELLE ANTWORT-ENTWÜRFE DES STUDENTEN (Kontext, nur bei Bedarf nutzen):\n${drafts}` });
    }
    parts.push({ text: m.text });
    return { role: m.role, parts };
  });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const result = await ai.models.generateContentStream({
          model: DEFAULT_MODEL,
          contents,
          config: { systemInstruction, temperature: 0.4 },
        });
        let sentAnything = false;
        for await (const chunk of result) {
          const text = chunk.text;
          if (text) {
            sentAnything = true;
            controller.enqueue(encoder.encode(text));
          }
        }
        if (!sentAnything) {
          controller.enqueue(encoder.encode(language === "english"
            ? "Sorry — the model returned an empty answer. Please try again."
            : "Entschuldige — das Modell hat eine leere Antwort geliefert. Bitte versuch es noch einmal."));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[tutor-chat] stream failed:", msg);
        // The stream may already be partially sent — append a readable marker
        // instead of a broken connection.
        controller.enqueue(encoder.encode(language === "english"
          ? `\n\n⚠️ Connection to the tutor failed (${msg.slice(0, 120)}). Please send your message again.`
          : `\n\n⚠️ Verbindung zum Tutor abgebrochen (${msg.slice(0, 120)}). Bitte schick deine Nachricht noch einmal.`));
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
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
