export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const item = await prisma.sRSItem.findUnique({ where: { id } });

    if (!item || !item.tutorPromptContent) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(item.tutorPromptContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err: any) {
    return new Response(err.message || "Internal Server Error", { status: 500 });
  }
}
