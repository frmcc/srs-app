import { NextRequest, NextResponse } from "next/server";
import { generatePodcastWorker } from "@/lib/notebooklm";

export async function POST(req: NextRequest) {
  try {
    const { itemId, podcastType } = await req.json();
    
    if (!itemId || !podcastType) {
      return NextResponse.json({ error: "itemId and podcastType are required" }, { status: 400 });
    }

    // Fire and forget the background worker
    // Node.js will continue executing this promise in the background
    generatePodcastWorker(itemId, podcastType).catch(err => {
      console.error("[Background Worker Error]", err);
    });

    return NextResponse.json({ success: true, message: "Podcast generation started in the background" });
  } catch (error: any) {
    console.error("[Podcast Generate API Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
