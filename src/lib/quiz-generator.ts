import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { PROMPTS, podcast_prompts } from "../app/api/quiz/prompts";
import { sendPushNotification } from "./push";
import { generatePodcastWorker, createNotebook } from "./notebooklm";
import { generateContentWithRetry } from "./gemini-retry";
import { getOrCreateDriveFolder, uploadToDrive, createGoogleDoc } from "./google-drive";
import { extractSection } from "./markers";
import { pdfToText } from "./pdf-text";
import type { SRSItem } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";

/**
 * THE quiz generation pipeline. Used by both:
 * - /api/quiz         (streaming, web UI)
 * - /api/quiz/submit  (fire-and-forget, iPhone Shortcut)
 *
 * Lifecycle contract:
 * - `onCreated` fires as soon as the SRSItem row exists — the web UI can show
 *   the finished quiz while podcasts still upload in the background.
 * - Temp files are deleted ONLY after the podcast workers finish (they read
 *   the files from disk), fixing the delete-while-uploading race.
 */
export async function runQuizGeneration(params: {
  subjectMain: string;
  subjectSub: string;
  textContent: string;
  filePaths: { name?: string; path: string; mimeType: string; base64?: string }[];
  onProgress?: (step: number, message: string) => void;
  onCreated?: (item: SRSItem) => void;
  jobId?: string;
  modelName?: string;
}) {
  const { subjectMain, subjectSub, textContent, filePaths, onProgress, onCreated, jobId } = params;
  const modelName = params.modelName || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const progress = onProgress || (() => {});

  if (jobId) {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: "processing" },
    }).catch((e) => console.error("[quiz-gen] Failed to mark job processing:", e));
  }

  try {
    const appConfig = await prisma.appConfig.findUnique({ where: { id: 1 } });
    const wrapperMode = appConfig?.wrapperMode || "all";
    const useAiWrapper = wrapperMode === "all" || wrapperMode === "generation_only";
    const agentMode = appConfig?.agentMode || false;
    const currentSemester = appConfig?.currentSemester || 1;
    const language = appConfig?.language || "german";
    const languageInstruction = `\n\nCRITICAL: You must generate ALL text, output, and responses strictly in ${language.toUpperCase()}. This applies to every section of the generated content.`;

    // ---- Prepare source material: Gemini upload + text extraction fallback ----
    const geminiFileParts: { fileData: { fileUri: string; mimeType: string } }[] = [];
    let dynamicTextContent = textContent;

    for (const fileInfo of filePaths) {
      try {
        const uploadResult = await ai.files.upload({
          file: fileInfo.path,
          config: { mimeType: fileInfo.mimeType },
        });
        geminiFileParts.push({
          fileData: { fileUri: uploadResult.uri as string, mimeType: uploadResult.mimeType as string },
        });
      } catch (err) {
        console.error("[quiz-gen] Error uploading file to Gemini:", err instanceof Error ? err.message : err);
      }

      try {
        const buffer = await fs.readFile(fileInfo.path);
        const name = fileInfo.name || path.basename(fileInfo.path);
        if (fileInfo.mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
          dynamicTextContent += `\n\n--- Inhalt von ${name} ---\n${await pdfToText(buffer)}`;
        } else if (fileInfo.mimeType.startsWith("text/")) {
          dynamicTextContent += `\n\n--- Inhalt von ${name} ---\n${buffer.toString("utf-8")}`;
        }
      } catch (err) {
        console.error(`[quiz-gen] Error parsing file ${fileInfo.path}:`, err);
      }
    }

    const masterContextParts: Array<{ text: string } | { fileData: { fileUri: string; mimeType: string } }> = [...geminiFileParts];
    if (dynamicTextContent.trim()) {
      masterContextParts.push({ text: `\n\nZusätzliches Textmaterial:\n${dynamicTextContent}` });
    }

    // ---- Step 1: Blueprint ----
    progress(1, "Analyzing material & Generating Blueprint...");
    const blueprintRes = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain} - ${subjectSub}` }, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
      config: { systemInstruction: PROMPTS.blueprint + languageInstruction },
    }, (msg) => progress(1, msg), "Blueprint", useAiWrapper);
    const blueprint = blueprintRes.text;

    // ---- Step 2: Quiz 1 (later quizzes are generated on-demand after grading) ----
    progress(2, "Generating Quiz 1...");
    const quiz1Res = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
      config: { systemInstruction: PROMPTS.quiz_tag_1 + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` + languageInstruction },
    }, (msg) => progress(2, msg), "Quiz 1", useAiWrapper);

    const quiz1Text = quiz1Res.text || "";
    // A module with an empty Quiz 1 is unusable: the student opens it to no quiz
    // and can never advance (currentQuizText falls back to an empty quiz1DocId).
    // Fail here — before the tutor/podcast calls and before persisting — so the
    // error path cleans up and the user simply retries, instead of saving a
    // broken module. Mirrors the grading-pipeline guard against empty next-quizzes.
    if (!quiz1Text.trim()) {
      throw new Error("Quiz 1 wurde leer generiert — es wurde nichts gespeichert. Bitte versuche es erneut.");
    }
    
    let finalQuiz1Text = quiz1Text;
    if (agentMode) {
      progress(2.5, "Agent Mode: Reflecting on draft and self-correcting...");
      const agentRes = await generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: [{ text: `Original Draft:\n${quiz1Text}\n\nBlueprint:\n${blueprint}\n\nPlease critically review your drafted quiz. Check if the wrong answers are plausible but strictly incorrect, if the difficulty is appropriate for university level, and if the concepts from the blueprint are deeply covered. Fix any flaws and output your result in the EXACT SAME FORMAT as the original draft. Keep all markdown formatting, all ===MARKER=== blocks, and exact text structures exactly as they were in the draft. Do not convert the quiz to JSON.` }] }],
        config: { systemInstruction: `You are an expert educational agent. Your task is to critique and refine the drafted quiz. Maintain the exact formatting rules of the original draft, including all section markers (===...===). Do NOT output JSON.` + languageInstruction },
      }, (msg) => progress(2.5, msg), "Quiz 1 Agent Reflection", useAiWrapper);
      
      if (agentRes.text?.trim()) {
        finalQuiz1Text = agentRes.text;
      } else {
        console.warn("[quiz-gen] Agent reflection returned empty. Falling back to draft.");
      }
    }
    const quiz1Ledger = extractSection(finalQuiz1Text, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");

    // ---- Step 3+4: Tutor prompt & podcast prompts in parallel (independent) ----
    progress(3, "Generating Tutor Prompt & Podcast Prompts...");
    const [tutorRes, podcastRes] = await Promise.all([
      generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain}` }, { text: `Didaktischer Blueprint:\n${blueprint}` }, { text: "Bitte generiere den Tutor-Prompt basierend auf dem bereitgestellten Blueprint." }] }],
        config: { systemInstruction: PROMPTS.tutor_prompt + languageInstruction },
      }, (msg) => progress(3, msg), "Tutor Prompt", useAiWrapper),
      generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain}` }, { text: `Didaktischer Blueprint:\n${blueprint}` }, { text: "Bitte generiere die zwei Regieanweisungen basierend auf dem bereitgestellten Blueprint." }] }],
        config: { systemInstruction: podcast_prompts + languageInstruction },
      }, (msg) => progress(3, msg), "Podcast Prompts", useAiWrapper),
    ]);
    const tutorPrompt = tutorRes.text;
    const podcastOutput = podcastRes.text;
    const prePodcastPrompt = extractSection(podcastOutput, "===PRE_PODCAST_START===", "===PRE_PODCAST_END===");
    const postPodcastPrompt = extractSection(podcastOutput, "===POST_PODCAST_START===", "===POST_PODCAST_END===");

    // ---- Step 5: NotebookLM notebooks ----
    progress(5, "Creating NotebookLM Podcasts...");
    let preNotebookId = "";
    let postNotebookId = "";
    try {
      const [preId, postId] = await Promise.all([
        createNotebook(`Pre - ${subjectMain}`.substring(0, 50)),
        createNotebook(`Post - ${subjectMain}`.substring(0, 50)),
      ]);
      if (preId) preNotebookId = preId;
      if (postId) postNotebookId = postId;
    } catch (e) {
      console.error("[quiz-gen] NotebookLM creation failed:", e);
    }

    // ---- Step 6: Google Drive (Semester X / Module / Topic) ----
    progress(6, "Uploading to Google Drive...");
    let folderId = "";
    let mainPdfId = "";
    try {
      const semesterFolderId = await getOrCreateDriveFolder(`Semester ${currentSemester}`);
      const moduleFolderId = await getOrCreateDriveFolder(subjectMain, semesterFolderId);
      folderId = await getOrCreateDriveFolder(subjectSub, moduleFolderId);

      if (filePaths.length > 0) {
        const firstFile = filePaths[0];
        // Read from disk when no base64 is provided — uploading Buffer.from("")
        // silently created 0-byte files that poisoned every later grading run.
        const fileBuffer = firstFile.base64
          ? Buffer.from(firstFile.base64, "base64")
          : await fs.readFile(firstFile.path);
        if (fileBuffer.length === 0) {
          console.warn("[quiz-gen] Source file is empty — skipping Drive upload to avoid a corrupt driveFileId.");
        } else {
          mainPdfId = await uploadToDrive(
            firstFile.name || "Vorlesungsmaterial.pdf",
            firstFile.mimeType,
            fileBuffer,
            folderId
          );
        }
      } else if (textContent) {
        mainPdfId = await createGoogleDoc("Vorlesungsmaterial", textContent, folderId);
      }

      await Promise.allSettled([
        createGoogleDoc("Quiz 1 (Tag 1)", finalQuiz1Text, folderId),
        createGoogleDoc("Tutor Prompt", tutorPrompt || "", folderId),
      ]);
    } catch (e) {
      console.error("[quiz-gen] Google Drive upload failed (continuing with DB save):", e);
    }

    // ---- Step 7: Persist ----
    progress(7, "Saving records to database...");
    const createdItem = await prisma.sRSItem.create({
      data: {
        subjectMain,
        subjectSub,
        semester: currentSemester,
        currentLevel: 0,
        nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        quiz1DocId: finalQuiz1Text,
        blueprint,
        coverageLedger: quiz1Ledger,
        tutorPromptContent: tutorPrompt,
        tutorPromptDocId: "pending",
        prePodcastPrompt: prePodcastPrompt || null,
        postPodcastPrompt: postPodcastPrompt || null,
        prePodcastUrl: preNotebookId ? `https://notebooklm.google.com/notebook/${preNotebookId}` : null,
        postPodcastUrl: postNotebookId ? `https://notebooklm.google.com/notebook/${postNotebookId}` : null,
        sourceMaterialContent: JSON.stringify({ driveFileId: mainPdfId, driveFolderId: folderId }),
      },
    });

    const finalItem = await prisma.sRSItem.update({
      where: { id: createdItem.id },
      data: { tutorPromptDocId: createdItem.id },
    });

    if (jobId) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: "done", completedAt: new Date(), itemId: createdItem.id },
      }).catch((e) => console.error("[quiz-gen] Failed to mark job done:", e));
    }

    // The item is fully usable now — let the caller show it immediately.
    onCreated?.(finalItem);

    sendPushNotification({
      title: "✅ Quiz fertig generiert!",
      body: `${subjectMain} - ${subjectSub}: Quiz 1 + Tutor-Prompt erstellt.`,
      tag: `quiz-done-${createdItem.id}`,
      url: "/",
    }).catch((e) => console.error("Push notification failed:", e));

    // ---- Step 8: Podcast uploads (workers read filePaths from disk) ----
    // MUST finish before the finally-block deletes the temp files.
    progress(8, "Uploading sources to NotebookLM podcasts...");
    // Run the two podcast workers SEQUENTIALLY — never in parallel. The NotebookLM
    // automation drives a single browser session, so asking two notebooks at the
    // same time makes the second "ask" (post) collide with the first and silently
    // drop: the notebook + source get created, but no podcast is ever triggered.
    // Pre must fully finish (upload → index wait → ask → save) before post starts.
    if (preNotebookId) {
      try {
        await generatePodcastWorker(createdItem.id, "pre", preNotebookId, dynamicTextContent, filePaths);
      } catch (e) {
        console.error("[quiz-gen] Pre podcast worker failed:", e);
      }
    }
    if (postNotebookId) {
      try {
        await generatePodcastWorker(createdItem.id, "post", postNotebookId, dynamicTextContent, filePaths);
      } catch (e) {
        console.error("[quiz-gen] Post podcast worker failed:", e);
      }
    }

    return finalItem;
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    if (jobId) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: "error", error: errObj.message, completedAt: new Date() },
      }).catch((e) => console.error("[quiz-gen] Failed to mark job errored:", e));
    }

    sendPushNotification({
      title: "❌ Quiz-Generierung fehlgeschlagen",
      body: `${subjectMain}: ${errObj.message}`,
      tag: `quiz-error-${jobId || subjectMain}`,
    }).catch(() => {});

    throw errObj;
  } finally {
    // Safe now: podcast workers have already consumed the files.
    for (const fileInfo of filePaths) {
      await fs.unlink(fileInfo.path).catch((e) => console.error("Failed to delete temp file:", fileInfo.path, e));
    }
  }
}
