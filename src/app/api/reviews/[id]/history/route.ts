export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * Feedback history for one module: every graded review with its stored brief.
 * Matches on itemId (new logs) and falls back to the subject pair so logs
 * written before the itemId column existed still show up.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const item = await prisma.sRSItem.findUnique({
      where: { id },
      select: { id: true, subjectMain: true, subjectSub: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const logs = await prisma.reviewLog.findMany({
      where: {
        OR: [
          { itemId: item.id },
          { itemId: null, subjectMain: item.subjectMain, subjectSub: item.subjectSub },
        ],
      },
      orderBy: { completedAt: "desc" },
      take: 50,
      select: {
        id: true,
        completedAt: true,
        level: true,
        passed: true,
        feedback: true,
      },
    });

    return NextResponse.json(logs);
  } catch (err) {
    console.error("[history] Failed to load review history:", err);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
