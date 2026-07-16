export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { AnswerSnapshot } from "@/lib/grading-pipeline";

/**
 * Answered-quiz snapshot for the revisit view: the quiz text as it was
 * answered, the student's per-task answers/sketches, and the matching
 * assessment. Latest attempt only (that is all the pipeline keeps).
 * ?mode=comprehension returns the comprehension-check snapshot instead.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const comprehension = req.nextUrl.searchParams.get("mode") === "comprehension";

    // Two typed queries (not one ternary select) so Prisma's result types stay
    // exact; only the requested snapshot column is pulled off the row.
    let raw: string | null;
    let feedback: string | null;
    if (comprehension) {
      const item = await prisma.sRSItem.findUnique({
        where: { id },
        select: { comprehensionAnswersJson: true, comprehensionFeedback: true },
      });
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      raw = item.comprehensionAnswersJson;
      feedback = item.comprehensionFeedback;
    } else {
      const item = await prisma.sRSItem.findUnique({
        where: { id },
        select: { lastAnswersJson: true, lastFeedback: true },
      });
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      raw = item.lastAnswersJson;
      feedback = item.lastFeedback;
    }

    if (!raw) {
      // Graded before the snapshot feature existed (or never graded) — the
      // client shows its "answers not stored for this attempt" state.
      return NextResponse.json({ snapshot: null, feedback: null });
    }

    let snapshot: AnswerSnapshot;
    try {
      snapshot = JSON.parse(raw) as AnswerSnapshot;
    } catch {
      console.error(`[answers] Corrupt snapshot JSON on item ${id}`);
      return NextResponse.json({ snapshot: null, feedback: null });
    }

    // `feedback` is the assessment written in the same transaction as the
    // snapshot, so the pair always describes the same attempt.
    return NextResponse.json({ snapshot, feedback });
  } catch (err) {
    console.error("[answers] Failed to load answer snapshot:", err);
    return NextResponse.json({ error: "Failed to load answers" }, { status: 500 });
  }
}
