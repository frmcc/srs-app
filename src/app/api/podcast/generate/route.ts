import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { generatePodcastWorker } from "@/lib/notebooklm";

export async function POST(req: NextRequest) {
  try {
    const { itemId, podcastType } = await req.json();
    
    if (!itemId || !podcastType) {
      return NextResponse.json({ error: "itemId and podcastType are required" }, { status: 400 });
    }

    // Fire and forget the background worker safely in Vercel
    after(async () => {
      try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        const item = await prisma.sRSItem.findUnique({ where: { id: itemId } });
        if (item) {
          const url = podcastType === "pre" ? item.prePodcastUrl : item.postPodcastUrl;
          const notebookId = url ? url.split("/notebook/")[1] : "";
          if (notebookId) {
            const source = item.sourceMaterialContent ? JSON.parse(item.sourceMaterialContent) : {};
            await generatePodcastWorker(itemId, podcastType as "pre"|"post", notebookId, source.text, source.files);
          } else {
            console.error("No notebook URL found for this item and type.");
          }
        }
      } catch (err) {
        console.error("[Background Worker Error]", err);
      }
    });

    return NextResponse.json({ success: true, message: "Podcast generation started in the background" });
  } catch (error: unknown) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    console.error("[Podcast Generate API Error]", errObj);
    return NextResponse.json({ error: errObj.message }, { status: 500 });
  }
}
