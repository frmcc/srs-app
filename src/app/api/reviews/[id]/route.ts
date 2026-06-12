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
