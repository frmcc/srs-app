import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { generatePodcastWorker } from "@/lib/notebooklm";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { itemId?: string; podcastType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { itemId, podcastType } = body;
  if (!itemId || (podcastType !== "pre" && podcastType !== "post")) {
    return NextResponse.json({ error: "itemId and podcastType ('pre'|'post') are required" }, { status: 400 });
  }

  // Validate BEFORE responding so the UI gets a real error instead of a
  // fire-and-forget success for a notebook that doesn't exist.
  const item = await prisma.sRSItem.findUnique({
    where: { id: itemId },
    select: { id: true, subjectMain: true, prePodcastUrl: true, postPodcastUrl: true, sourceMaterialContent: true },
  });
  if (!item) {
    return NextResponse.json({ error: "SRS item not found" }, { status: 404 });
  }

  const url = podcastType === "pre" ? item.prePodcastUrl : item.postPodcastUrl;
  const notebookId = url?.split("/notebook/")[1] || "";
  if (!notebookId) {
    return NextResponse.json({ error: "Kein NotebookLM-Notebook für dieses Item vorhanden." }, { status: 400 });
  }

  // In-flight guard: concurrent generations drive the SAME NotebookLM session and
  // the second askChat silently drops. Reject a second request while one is still
  // running for this item+type (recorded as a BackgroundJob).
  const jobType = `podcast_${podcastType}`;
  const RECENT_MS = 15 * 60 * 1000;
  const inFlight = await prisma.backgroundJob.findFirst({
    where: {
      itemId,
      type: jobType,
      status: { in: ["pending", "processing"] },
      createdAt: { gte: new Date(Date.now() - RECENT_MS) },
    },
  });
  if (inFlight) {
    return NextResponse.json({ error: "Für dieses Item läuft bereits eine Podcast-Generierung." }, { status: 409 });
  }
  const job = await prisma.backgroundJob.create({
    data: { type: jobType, status: "processing", subjectMain: item.subjectMain, itemId },
  });

  after(async () => {
    try {
      let source: { text?: string; files?: { name?: string; base64?: string; mimeType: string; path?: string }[] } = {};
      try {
        source = item.sourceMaterialContent ? JSON.parse(item.sourceMaterialContent) : {};
      } catch {
        /* legacy plain-text column — worker falls back to Drive */
      }
      await generatePodcastWorker(itemId, podcastType, notebookId, source.text, source.files);
      await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: "done", completedAt: new Date() } });
    } catch (err) {
      console.error("[Background Worker Error]", err);
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "error", error: String(err), completedAt: new Date() },
      }).catch(() => {});
    }
  });

  return NextResponse.json({ success: true, message: "Podcast generation started in the background" });
}
