import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runQuizGeneration } from "@/lib/quiz-generator";
import fs from "fs/promises";
import path from "path";


export const maxDuration = 300; // 5 minutes max for background processing on Vercel Hobby

/**
 * Fire-and-forget quiz generation endpoint for iPhone Shortcuts.
 * Accepts multipart form data, saves files, creates a background job,
 * and returns immediately. Quiz generation runs via after().
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const subjectMain = (formData.get("subjectMain") as string) || "";
    const subjectSub = (formData.get("subjectSub") as string) || "Module";
    const textContent = (formData.get("content") as string) || "";
    const files = formData.getAll("files") as File[];

    if (!subjectMain) {
      return NextResponse.json({ error: "subjectMain is required" }, { status: 400 });
    }

    if (!textContent && files.length === 0) {
      return NextResponse.json({ error: "No content or files provided" }, { status: 400 });
    }

    // Save files to disk immediately
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const savedFiles: { path: string; mimeType: string }[] = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const localFilePath = path.join(uploadsDir, uniqueFileName);
      await fs.writeFile(localFilePath, buffer);
      savedFiles.push({ path: localFilePath, mimeType: file.type || "application/octet-stream" });
    }

    // Create background job record
    const job = await prisma.backgroundJob.create({
      data: {
        type: "quiz_generation",
        status: "pending",
        subjectMain,
        subjectSub,
      },
    });

    // Schedule the quiz generation to run after the response is sent
    after(async () => {
      try {
        await runQuizGeneration({
          subjectMain,
          subjectSub,
          textContent,
          filePaths: savedFiles,
          jobId: job.id,
        });
      } catch (err) {
        console.error("Background quiz generation failed:", err);
      }
    });

    // Return immediately — the Shortcut gets a fast response
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: `Quiz-Generierung gestartet für "${subjectMain}". Du erhältst eine Benachrichtigung wenn es fertig ist.`,
    });
  } catch (err: any) {
    console.error("Submit error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET endpoint to check job status (optional, for polling)
 */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
