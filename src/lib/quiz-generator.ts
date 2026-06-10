import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { PROMPTS, podcast_prompts } from "../app/api/quiz/prompts";
import { sendPushNotification } from "./push";
import { generatePodcastWorker, createNotebook } from "./notebooklm";
import { generateContentWithRetry } from "./gemini-retry";
import { createDriveFolder, getOrCreateDriveFolder, uploadToDrive, createGoogleDoc } from "./google-drive";
import fs from "fs/promises";
import path from "path";


const extractSection = (text: string | undefined, startMarker: string, endMarker: string) => {
  if (!text) return "";
  
  // Escape markers for regex, but allow optional spaces around the equal signs
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeStart = escapeRegExp(startMarker).replace(/===/g, '={3,}');
  const safeEnd = escapeRegExp(endMarker).replace(/===/g, '={3,}');
  
  // Tolerant regex: allows spaces inside the marker blocks, and handles formatting typos
  const regex = new RegExp(`[\\s\\S]*?${safeStart}\\s*([\\s\\S]*?)\\s*${safeEnd}`, "i");
  const match = text.match(regex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // SAFE FALLBACK: Never return the raw unparsed text if extraction fails.
  // Returning the entire unparsed text would cause a catastrophic prompt-injection loop.
  console.warn(`[WARNING] Failed to extract section between ${startMarker} and ${endMarker}. Returning empty fallback to prevent context flooding.`);
  return "";
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
  const modelName = "gemini-3.5-flash";
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
    const geminiFileParts: { fileData: { fileUri: string, mimeType: string } }[] = [];
    for (const fileInfo of filePaths) {
      try {
        const uploadResult = await ai.files.upload({
          file: fileInfo.path,
          config: { mimeType: fileInfo.mimeType },
        });
        geminiFileParts.push({
          fileData: { fileUri: uploadResult.uri as string, mimeType: uploadResult.mimeType as string },
        });
      } catch (err: unknown) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        console.error(`Error uploading file to Gemini:`, errObj);
      }
    }

    const masterContextParts: Array<{ text: string } | { fileData: { fileUri: string, mimeType: string } }> = [...geminiFileParts];
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
      contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain} - ${subjectSub}` }, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
      config: { systemInstruction: PROMPTS.blueprint },
    }, (msg) => progress(1, msg), "Blueprint");
    const blueprint = blueprintRes.text;

    // Step 2: Quiz 1 Only (dynamically generate others later)
    const quizPrompts = [PROMPTS.quiz_tag_1];
    const quizResults: string[] = [];
    let lastQuiz = "";
    let lastLedger = "";

    for (let i = 0; i < quizPrompts.length; i++) {
      progress(2 + i, `Generating Quiz ${i + 1}...`);
      
      const userParts = [...masterContextParts];
      userParts.push({ text: `Modul/Vorlesungsthema:\n${subjectMain}` });
      if (blueprint) userParts.push({ text: `Didaktischer Blueprint:\n${blueprint}` });
      if (lastQuiz) userParts.push({ text: `Vorheriger Quiz-Agent-Output:\n${lastQuiz}` });
      if (lastLedger) userParts.push({ text: `Bisheriges Coverage Ledger:\n${lastLedger}` });
      userParts.push({ text: "Hier sind die Materialien und der bisherige Kontext. Bitte führe deine System-Instruktionen präzise aus." });

      const res = await generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: userParts }],
        config: { systemInstruction: quizPrompts[i] },
      }, (msg) => progress(2 + i, msg), `Quiz ${i + 1}`);
      const text = res.text;
      quizResults.push(text || "");
      lastQuiz = extractSection(text, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===");
      lastLedger = extractSection(text, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");
    }

    // Step 7: Tutor Prompt
    progress(7, "Generating Tutor Prompt System...");
    const tutorRes = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain}` }, { text: `Didaktischer Blueprint:\n${blueprint}` }, { text: "Bitte generiere den Tutor-Prompt basierend auf dem bereitgestellten Blueprint." }] }],
      config: { systemInstruction: PROMPTS.tutor_prompt },
    }, (msg) => progress(7, msg), "Tutor Prompt");
    const tutorPrompt = tutorRes.text;

    // Step 8: Podcast Prompts
    progress(8, "Generating Podcast Prompts...");
    const podcastRes = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain}` }, { text: `Didaktischer Blueprint:\n${blueprint}` }, { text: "Bitte generiere die zwei Regieanweisungen basierend auf dem bereitgestellten Blueprint." }] }],
      config: { systemInstruction: podcast_prompts },
    }, (msg) => progress(8, msg), "Podcast Prompts");
    const podcastOutput = podcastRes.text;
    const prePodcastPrompt = extractSection(podcastOutput, "===PRE_PODCAST_START===", "===PRE_PODCAST_END===");
    const postPodcastPrompt = extractSection(podcastOutput, "===POST_PODCAST_START===", "===POST_PODCAST_END===");

    // Step 9: Create NotebookLM Notebooks
    progress(9, "Creating NotebookLM Podcasts...");
    let preNotebookId = "";
    let postNotebookId = "";
    try {
      const preTitle = `Pre - ${subjectMain}`.substring(0, 50);
      const postTitle = `Post - ${subjectMain}`.substring(0, 50);
      const [preId, postId] = await Promise.all([
        createNotebook(preTitle),
        createNotebook(postTitle)
      ]);
      if (preId) preNotebookId = preId;
      if (postId) postNotebookId = postId;
    } catch (e) {
      console.error("NotebookLM creation failed:", e);
    }

    // Step 10: Save to Google Drive
    progress(10, "Uploading to Google Drive...");
    
    const appConfig = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const currentSemester = appConfig?.currentSemester || 1;

    let folderId = "";
    let mainPdfId = "";
    try {
      // Build the hierarchy: Root -> Semester X -> Module -> Topic
      const semesterFolderName = `Semester ${currentSemester}`;
      const semesterFolderId = await getOrCreateDriveFolder(semesterFolderName);
      
      const moduleFolderId = await getOrCreateDriveFolder(subjectMain, semesterFolderId);
      
      folderId = await getOrCreateDriveFolder(subjectSub, moduleFolderId);
      
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

      // Create Docs for Quiz 1 and Tutor Prompt
      await Promise.allSettled([
        createGoogleDoc("Quiz 1 (Tag 1)", quizResults[0] || "", folderId),
        createGoogleDoc("Tutor Prompt", tutorPrompt || "", folderId)
      ]);
    } catch (e) {
      console.error("Google Drive upload failed:", e);
      // Fallback: Continue saving to DB even if Drive fails
    }

    // Step 11: Save to DB
    progress(11, "Saving records to database...");
    const createdItem = await prisma.sRSItem.create({
      data: {
        subjectMain,
        subjectSub,
        currentLevel: 0,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        quiz1DocId: quizResults[0] || null,
        quiz2DocId: null,
        quiz3DocId: null,
        quiz4DocId: null,
        quiz5DocId: null,
        blueprint: blueprint,
        coverageLedger: lastLedger,
        tutorPromptContent: tutorPrompt,
        tutorPromptDocId: "pending",
        prePodcastUrl: preNotebookId ? `https://notebooklm.google.com/notebook/${preNotebookId}` : null,
        postPodcastUrl: postNotebookId ? `https://notebooklm.google.com/notebook/${postNotebookId}` : null,
        sourceMaterialContent: JSON.stringify({ driveFileId: mainPdfId, driveFolderId: folderId }),
      },
    });

    // Set tutorPromptDocId to the item's own ID
    await prisma.sRSItem.update({
      where: { id: createdItem.id },
      data: { tutorPromptDocId: createdItem.id }
    });

    // Automatically trigger podcast generation in the background with in-memory files
    try {
      const uploadTasks = [];
      if (preNotebookId) {
        uploadTasks.push(generatePodcastWorker(createdItem.id, "pre", preNotebookId, textContent, filePaths));
      }
      if (postNotebookId) {
        uploadTasks.push(generatePodcastWorker(createdItem.id, "post", postNotebookId, textContent, filePaths));
      }
      Promise.allSettled(uploadTasks).catch(e => console.error("Error starting background tasks:", e));
    } catch (e) {
      console.error("Error in background podcast worker:", e);
    }

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

    // (Podcast generation was already triggered above)

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
