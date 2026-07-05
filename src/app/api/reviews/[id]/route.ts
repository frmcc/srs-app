import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

/** Full item detail (everything the slim list omits). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const item = await prisma.sRSItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (err) {
    console.error("Failed to fetch review:", err);
    return NextResponse.json({ error: "Failed to fetch review" }, { status: 500 });
  }
}

/**
 * Snooze: manually push the next review OUT by N days. Body: { days: 1 | 3 | 7 | 14 }.
 *
 * Base date = the LATER of (now, current due date). A due/overdue item moves
 * to now+N ("ask me again in N days"); a review scheduled far in the future
 * moves to dueDate+N. Snooze must never PULL a review closer — computing from
 * "now" alone would have collapsed a Tag-60 schedule to next week with one tap.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { days?: number; restoreDate?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Undo path (CRAFT.md §8): restore the exact pre-snooze due date.
    if (body.restoreDate !== undefined) {
      const restore = new Date(body.restoreDate);
      if (isNaN(restore.getTime())) {
        return NextResponse.json({ error: "restoreDate must be a valid date" }, { status: 400 });
      }
      const item = await prisma.sRSItem.update({
        where: { id },
        data: { nextReviewDate: restore },
        select: { id: true, nextReviewDate: true, currentLevel: true },
      });
      return NextResponse.json(item);
    }

    const ALLOWED_DAYS = [1, 3, 7, 14];
    const days = Number(body.days);
    if (!ALLOWED_DAYS.includes(days)) {
      return NextResponse.json({ error: "days must be one of 1, 3, 7, 14" }, { status: 400 });
    }

    const existing = await prisma.sRSItem.findUnique({
      where: { id },
      select: { nextReviewDate: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const now = new Date();
    const base = existing.nextReviewDate > now ? new Date(existing.nextReviewDate) : now;
    base.setDate(base.getDate() + days);

    const item = await prisma.sRSItem.update({
      where: { id },
      data: { nextReviewDate: base },
      select: { id: true, nextReviewDate: true, currentLevel: true },
    });
    return NextResponse.json(item);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    console.error("Failed to snooze review:", err);
    return NextResponse.json({ error: "Failed to snooze review" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.sRSItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    // P2025 = record not found — a 404, not a server error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    console.error("Failed to delete review:", err);
    return NextResponse.json({ error: "Failed to delete review" }, { status: 500 });
  }
}
