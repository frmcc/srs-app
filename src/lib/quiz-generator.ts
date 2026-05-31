import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { PROMPTS, podcast_prompts } from "../app/api/quiz/prompts";
import { sendPushNotification } from "./push";
import { generatePodcastWorker } from "./notebooklm";
import { generateContentWithRetry } from "./gemini-retry";
import { createDriveFolder, uploadToDrive, createGoogleDoc } from "./google-drive";
import fs from "fs/promises";
import path from "path";


const extractSection = (text: string | undefined, startMarker: string, endMarker: string) => {
  if (!text) return "";
  const regex = new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`);
  const match = text.match(regex);
  return match ? match[1].trim() : text.trim();
};

/**
 * Shared quiz generation logic used by both:
 * - /api/quiz (streaming, for web UI)
 * - /api/quiz/submit (fire-and-forget, for iPhone Shortcut)
 */
export async function runQuizGeneration(params: {
  subjectMain: string;
  subjectSub: string;
  textContent: string;
  filePaths: { name?: string; path: string; mimeType: string; base64?: string }[];
  onProgress?: (step: number, message: string) => void;
  jobId?: string;
}) {
  const { subjectMain, subjectSub, textContent, filePaths, onProgress, jobId } = params;
  const modelName = "gemini-3.1-flash-lite";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const progress = onProgress || (() => {});

  // Update job status if tracking
  if (jobId) {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: "processing" },
    });
  }

  try {
    // Upload files to Gemini
    const geminiFileParts: any[] = [];
    for (const fileInfo of filePaths) {
      try {
        const uploadResult = await ai.files.upload({
          file: fileInfo.path,
          config: { mimeType: fileInfo.mimeType },
        });
        geminiFileParts.push({
          fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType },
        });
      } catch (err: unknown) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        console.error(`Error uploading file to Gemini:`, errObj);
      }
    }

    const masterContextParts = [...geminiFileParts];
    if (textContent.trim()) {
      masterContextParts.push({ text: `\n\nZusätzliches Textmaterial:\n${textContent}` });
    }

    const dbFilesData = filePaths.map(f => ({
      name: f.name || path.basename(f.path),
      mimeType: f.mimeType,
      base64: f.base64 || ""
    }));

    // Step 1: Blueprint
    progress(1, "Analyzing material & Generating Blueprint...");
    const blueprintRes = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
      config: { systemInstruction: PROMPTS.blueprint + `\n\nModul/Vorlesungsthema:\n${subjectMain} - ${subjectSub}` },
    }, (msg) => progress(1, msg), "Blueprint");
    const blueprint = blueprintRes.text;

    // Steps 2-6: Quiz 1-5
    const quizPrompts = [PROMPTS.quiz_tag_1, PROMPTS.quiz_tag_3, PROMPTS.quiz_tag_7, PROMPTS.quiz_tag_21, PROMPTS.quiz_tag_60];
    const quizResults: string[] = [];
    let lastQuiz = "";
    let lastLedger = "";

    for (let i = 0; i < quizPrompts.length; i++) {
      progress(2 + i, `Generating Quiz ${i + 1}...`);
      const res = await generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
        config: { systemInstruction: quizPrompts[i] + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}\n\nVorheriger Quiz-Agent-Output:\n${lastQuiz}\n\nBisheriges Coverage Ledger:\n${lastLedger}` },
      }, (msg) => progress(2 + i, msg), `Quiz ${i + 1}`);
      const text = res.text;
      quizResults.push(text || "");
      lastQuiz = extractSection(text, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===");
      lastLedger = extractSection(text, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");
    }

    // Step 7: Tutor Prompt
    progress(7, "Generating Tutor Prompt System...");
    const tutorRes = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: "Bitte generiere den Tutor-Prompt basierend auf dem bereitgestellten Blueprint." }] }],
      config: { systemInstruction: PROMPTS.tutor_prompt + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` },
    }, (msg) => progress(7, msg), "Tutor Prompt");
    const tutorPrompt = tutorRes.text;

    // Step 8: Podcast Prompts
    progress(8, "Generating Podcast Prompts...");
    const podcastRes = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: "Bitte generiere die zwei Regieanweisungen basierend auf dem bereitgestellten Blueprint." }] }],
      config: { systemInstruction: podcast_prompts + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` },
    }, (msg) => progress(8, msg), "Podcast Prompts");
    const podcastOutput = podcastRes.text;
    const prePodcastPrompt = extractSection(podcastOutput, "===PRE_PODCAST_START===", "===PRE_PODCAST_END===");
    const postPodcastPrompt = extractSection(podcastOutput, "===POST_PODCAST_START===", "===POST_PODCAST_END===");

    // Step 9: Save to Google Drive
    progress(9, "Uploading to Google Drive...");
    let folderId = "";
    let mainPdfId = "";
    try {
      const folderName = `${subjectMain} - ${subjectSub}`;
      folderId = await createDriveFolder(folderName);
      
      // Upload PDF if present
      if (filePaths.length > 0) {
        const firstFile = filePaths[0];
        mainPdfId = await uploadToDrive(
          firstFile.name || "Vorlesungsmaterial.pdf",
          firstFile.mimeType,
          firstFile.base64 ? Buffer.from(firstFile.base64, "base64") : Buffer.from(""),
          folderId
        );
      } else if (textContent) {
        // If no file but text content, create a doc for it
        mainPdfId = await createGoogleDoc("Vorlesungsmaterial", textContent, folderId);
      }

      // Create Docs for Quizzes and Tutor Prompt
      await Promise.allSettled([
        createGoogleDoc("Quiz 1 (Tag 1)", quizResults[0] || "", folderId),
        createGoogleDoc("Quiz 2 (Tag 3)", quizResults[1] || "", folderId),
        createGoogleDoc("Quiz 3 (Tag 7)", quizResults[2] || "", folderId),
        createGoogleDoc("Quiz 4 (Tag 21)", quizResults[3] || "", folderId),
        createGoogleDoc("Quiz 5 (Tag 60)", quizResults[4] || "", folderId),
        createGoogleDoc("Tutor Prompt", tutorPrompt, folderId)
      ]);
    } catch (e) {
      console.error("Google Drive upload failed:", e);
      // Fallback: Continue saving to DB even if Drive fails
    }

    // Step 10: Save to DB
    progress(10, "Saving records to database...");
    const createdItem = await prisma.sRSItem.create({
      data: {
        subjectMain,
        subjectSub,
        currentLevel: 0,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        quiz1DocId: quizResults[0],
        quiz2DocId: quizResults[1],
        quiz3DocId: quizResults[2],
        quiz4DocId: quizResults[3],
        quiz5DocId: quizResults[4],
        tutorPromptContent: tutorPrompt,
        tutorPromptDocId: "pending",
        prePodcastPrompt: prePodcastPrompt || null,
        postPodcastPrompt: postPodcastPrompt || null,
        sourceMaterialContent: JSON.stringify({ driveFileId: mainPdfId, driveFolderId: folderId }),
      },
    });

    // Set tutorPromptDocId to the item's own ID
    await prisma.sRSItem.update({
      where: { id: createdItem.id },
      data: { tutorPromptDocId: createdItem.id }
    });

    // Mark job done
    if (jobId) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: "done", completedAt: new Date(), itemId: createdItem.id },
      });
    }

    // Send push notification
    await sendPushNotification({
      title: "✅ Quiz fertig generiert!",
      body: `${subjectMain} - ${subjectSub}: 5 Quizze + Tutor-Prompt erstellt.`,
      tag: `quiz-done-${createdItem.id}`,
      url: "/",
    }).catch((e) => console.error("Push notification failed:", e));

    // Automatically trigger podcast generation in the background
    await Promise.allSettled([
      generatePodcastWorker(createdItem.id, "pre"),
      generatePodcastWorker(createdItem.id, "post")
    ]);

    return createdItem;
  } catch (error: unknown) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    if (jobId) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: "error", error: errObj.message, completedAt: new Date() },
      });
    }

    // Send error push notification
    await sendPushNotification({
      title: "❌ Quiz-Generierung fehlgeschlagen",
      body: `${subjectMain}: ${errObj.message}`,
      tag: `quiz-error-${jobId}`,
    }).catch(() => {});

    throw errObj;
  } finally {
    for (const fileInfo of filePaths) {
      try {
        await fs.unlink(fileInfo.path);
      } catch (e) {
        console.error("Failed to delete temp file:", fileInfo.path, e);
      }
    }
  }
}
