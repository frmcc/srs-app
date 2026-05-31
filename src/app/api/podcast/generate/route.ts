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
        await generatePodcastWorker(itemId, podcastType);
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
