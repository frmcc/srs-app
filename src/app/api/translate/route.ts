import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";
import { generateContentWithRetry } from "@/lib/gemini-retry";

export const maxDuration = 60;

/**
 * Translates an item's feedback brief into the UI language (German/English).
 * Called by the feedback modal when the stored brief doesn't match the
 * selected language; the client caches the result in localStorage, so each
 * brief is translated at most once per language.
 */
export async function POST(req: NextRequest) {
  let body: { itemId?: string; logId?: string; target?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { itemId, logId, target } = body;
  if ((!itemId && !logId) || (target !== "german" && target !== "english")) {
    return NextResponse.json({ error: "itemId or logId, and target ('german'|'english') are required" }, { status: 400 });
  }

  // Either the item's latest brief or one specific history entry (ReviewLog).
  let feedback: string | null = null;
  if (logId) {
    const log = await prisma.reviewLog.findUnique({ where: { id: logId }, select: { feedback: true } });
    feedback = log?.feedback ?? null;
  } else if (itemId) {
    const item = await prisma.sRSItem.findUnique({ where: { id: itemId }, select: { lastFeedback: true } });
    feedback = item?.lastFeedback ?? null;
  }
  if (!feedback) {
    return NextResponse.json({ error: "No feedback stored for this entry." }, { status: 404 });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("[translate] GEMINI_API_KEY is not configured");
    return NextResponse.json({ error: "Translation is not available." }, { status: 503 });
  }

  const targetName = target === "german" ? "German" : "English";
  // The model call and its failure modes must be caught: without this, a thrown
  // error (network, upstream failure) became an unhandled 500 with a generic body
  // instead of the intended graceful 502.
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await generateContentWithRetry(ai, "gemini-3.1-flash-lite", {
      contents: [{ role: "user", parts: [{ text: feedback }] }],
      config: {
        systemInstruction:
          `Translate the following study-feedback brief into ${targetName}. ` +
          `Preserve the exact structure: headings, bullet points, line breaks, PASS/REPEAT keywords and numbers stay as they are. ` +
          `If the text is already entirely in ${targetName}, return it unchanged. Output ONLY the translated text — no preamble.`,
      },
    }, () => {}, "Feedback Translation", false);

    const translated = (res.text ?? "").trim();
    if (!translated) {
      return NextResponse.json({ error: "Translation failed." }, { status: 502 });
    }
    return NextResponse.json({ translated });
  } catch (e) {
    console.error("[translate] generation failed:", e);
    return NextResponse.json({ error: "Translation failed." }, { status: 502 });
  }
}
