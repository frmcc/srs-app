import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/push";
import { runGradingPipeline } from "@/lib/grading-pipeline";

export const maxDuration = 600; // higher ceiling for opt-in Agent Mode (also raise the Cloud Run request timeout ≥ 600s)

/**
 * iPhone Shortcut grading endpoint.
 * Receives calendar notes (containing quizId=...) + a scanned PDF,
 * validates everything synchronously so the Shortcut gets real errors,
 * then runs the shared grading pipeline in after().
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const notes = formData.get("notes") as string | null;
  const file = formData.get("file") as File | null;

  if (!notes) {
    return NextResponse.json({ error: "Missing calendar notes" }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "Missing or empty PDF file" }, { status: 400 });
  }

  const match = notes.match(/quizId=([a-zA-Z0-9_-]+)/);
  if (!match) {
    return NextResponse.json({ error: "Could not find quizId in notes", notes }, { status: 400 });
  }
  const itemId = match[1];

  const srsItem = await prisma.sRSItem.findUnique({ where: { id: itemId }, select: { id: true, subjectMain: true, subjectSub: true } });
  if (!srsItem) {
    return NextResponse.json({ error: "SRS item not found for ID: " + itemId }, { status: 404 });
  }

  // Read the file BEFORE returning — the request body is gone once we respond.
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mimeType = file.type || "application/pdf";

  after(async () => {
    // Tell the user grading has started. The PASS/REPEAT (and failure) push is
    // sent later by runGradingPipeline.
    sendPushNotification({
      title: "📝 Bewertung läuft",
      body: `Dein Quiz „${srsItem.subjectMain} – ${srsItem.subjectSub}" wird ausgewertet …`,
      tag: `grade-start-${itemId}`,
      url: "/",
    }).catch((e) => console.error("Grade-start push failed:", e));

    try {
      console.log(`[Shortcut Grade] Starting background grading for item ${itemId}`);
      const result = await runGradingPipeline({
        itemId,
        submission: { pdf: { base64, mimeType } },
        onProgress: (step, message) => console.log(`[Shortcut Grade] [${step}] ${message}`),
      });
      // No streaming consumer here — run the deferred work inline.
      await result.postActions();
      console.log(`[Shortcut Grade] Finished grading item ${itemId} (${result.isPass ? "PASS" : "REPEAT"})`);
    } catch (e) {
      console.error("[Shortcut Grade] Error during background grading:", e);
      sendPushNotification({
        title: "❌ Shortcut Grading Failed",
        body: e instanceof Error ? e.message : `Fehler beim Auswerten von Item ${itemId}.`,
        tag: `grade-failed-${itemId}`,
        url: "/",
      }).catch((pushErr) => console.error("Push notification failed:", pushErr));
    }
  });

  return NextResponse.json({ success: true, message: "Grading started in the background" });
}
