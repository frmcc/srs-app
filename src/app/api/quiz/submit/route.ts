import { prisma } from "@/lib/db";
import { NextRequest, NextResponse, after } from "next/server";
import { runQuizGeneration } from "@/lib/quiz-generator";
import { sendPushNotification } from "@/lib/push";
import fs from "fs/promises";
import path from "path";
import os from "os";

export const maxDuration = 300; // 5 minutes max for background processing

/** Jobs stuck in pending/processing longer than this are considered dead. */
const STALE_JOB_MS = 10 * 60 * 1000;

/**
 * Fire-and-forget quiz generation endpoint for iPhone Shortcuts.
 * Accepts multipart form data, saves files, creates a background job,
 * and returns immediately. Quiz generation runs via after().
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
  }

  // ONE array — a shadowed inner declaration here used to leak temp files,
  // because the failure cleanup in `finally` only saw the empty outer one.
  const savedFiles: { name: string; path: string; mimeType: string }[] = [];
  let backgroundWorkerScheduled = false;

  try {
    const formData = await req.formData();
    // Course name + lecture topic from the Shortcut — trimmed so stray spaces
    // don't break the title, with a sensible fallback for the topic.
    const subjectMain = ((formData.get("subjectMain") as string) || "").trim();
    const subjectSub = ((formData.get("subjectSub") as string) || "").trim() || "Modul";
    const textContent = (formData.get("content") as string) || "";
    const files = formData.getAll("files") as File[];

    if (!subjectMain) {
      return NextResponse.json({ error: "subjectMain is required" }, { status: 400 });
    }
    if (!textContent && files.length === 0) {
      return NextResponse.json({ error: "No content or files provided" }, { status: 400 });
    }

    const uploadsDir = path.join(os.tmpdir(), "srs-uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    for (const file of files) {
      if (file.size === 0) continue;
      const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const localFilePath = path.join(uploadsDir, uniqueFileName);
      await fs.writeFile(localFilePath, Buffer.from(await file.arrayBuffer()));
      // No base64 copy — the generator reads from disk; keeping a second copy
      // of every PDF in memory just bloated the request.
      savedFiles.push({ name: file.name, path: localFilePath, mimeType: file.type || "application/octet-stream" });
    }

    const job = await prisma.backgroundJob.create({
      data: {
        type: "quiz_generation",
        status: "pending",
        subjectMain,
        subjectSub,
      },
    });

    after(async () => {
      // Let the user know the upload landed and is being processed. The "done"
      // (and error) push is sent later by runQuizGeneration.
      sendPushNotification({
        title: "📤 Vorlesung wird verarbeitet",
        body: `„${subjectMain} – ${subjectSub}" wird hochgeladen und generiert …`,
        tag: `upload-start-${job.id}`,
        url: "/",
      }).catch((e) => console.error("Upload-start push failed:", e));

      try {
        await runQuizGeneration({
          subjectMain,
          subjectSub,
          textContent,
          filePaths: savedFiles,
          jobId: job.id,
        });
      } catch (err) {
        // runQuizGeneration already marked the job as errored + pushed a notification.
        console.error("Background quiz generation failed:", err);
      }
    });
    backgroundWorkerScheduled = true;

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: `Quiz-Generierung gestartet für "${subjectMain}". Du erhältst eine Benachrichtigung wenn es fertig ist.`,
    });
  } catch (err) {
    console.error("Submit error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  } finally {
    if (!backgroundWorkerScheduled) {
      for (const fileInfo of savedFiles) {
        await fs.unlink(fileInfo.path).catch((e) => console.error("Failed to delete temp file during failure cleanup:", fileInfo.path, e));
      }
    }
  }
}

/**
 * GET endpoint for job-status polling (iPhone Shortcut loop).
 * Auto-fails jobs that have been silent for >10 minutes so the
 * Shortcut's polling loop terminates instead of spinning forever.
 */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  let job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const isActive = job.status === "pending" || job.status === "processing";
  // updatedAt was added 2026-06 — fall back to createdAt for pre-migration rows.
  const lastHeartbeat = (job as typeof job & { updatedAt?: Date }).updatedAt ?? job.createdAt;
  if (isActive && Date.now() - lastHeartbeat.getTime() > STALE_JOB_MS) {
    job = await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        error: "Job timed out (no progress for 10 minutes). The server may have restarted — please retry.",
        completedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ job });
}
