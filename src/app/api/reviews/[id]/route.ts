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
 * Snooze: manually push the next review. Body: { days: 1 | 3 | 7 | 14 }.
 * The new date is computed from NOW (not from the old due date) — snooze
 * means "I can't do this today, ask me again in N days".
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { days?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const ALLOWED_DAYS = [1, 3, 7, 14];
    const days = Number(body.days);
    if (!ALLOWED_DAYS.includes(days)) {
      return NextResponse.json({ error: "days must be one of 1, 3, 7, 14" }, { status: 400 });
    }

    const next = new Date();
    next.setDate(next.getDate() + days);

    const item = await prisma.sRSItem.update({
      where: { id },
      data: { nextReviewDate: next },
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
