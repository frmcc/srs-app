export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let item = await prisma.sRSItem.findUnique({ where: { id } });
    
    if (!item) {
      // Fallback for legacy items where the Google Doc ID is stored in tutorPromptDocId
      item = await prisma.sRSItem.findFirst({ where: { tutorPromptDocId: id } });
    }

    if (!item || !item.tutorPromptContent) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(item.tutorPromptContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // This is auth-gated content — must NOT be stored in a shared cache and
        // then served to a different client. (Was "public"; source/[id] uses
        // "private" correctly.)
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[tutor] failed to fetch content:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
