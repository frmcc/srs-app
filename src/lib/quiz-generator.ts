import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { STUDENT_CONTEXT, PROMPTS, podcast_prompts } from "../app/api/quiz/prompts";
import { sendPushNotification } from "./push";
import { generatePodcastWorker, createNotebook } from "./notebooklm";
import { wrapperOnForStep } from "./wrapper-modules";
import { generateContentWithRetry, normalizeFileTransport } from "./gemini-retry";
import { getOrCreateDriveFolder, uploadToDrive, createGoogleDoc } from "./google-drive";
import { extractSection } from "./markers";
import type { SRSItem } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const DEFAULT_MODEL = "gemini-3.5-flash";

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

  // Touch the job's updatedAt at each major step. Generation can legitimately
  // run several minutes; without a heartbeat the GET poller's stale detector
  // (10-min updatedAt age) could falsely flip a healthy run to "error", the user
  // would resubmit, and a duplicate module would be created.
  const heartbeat = jobId
    ? () => prisma.backgroundJob.update({ where: { id: jobId }, data: { status: "processing" } }).catch(() => {})
    : () => Promise.resolve();

  try {
    const appConfig = await prisma.appConfig.findUnique({ where: { id: 1 } });
    // Per-module wrapper: this module's generation goes through the proxy only
    // when its box is ticked; otherwise the official Gemini API. The native File
    // API upload still runs on any official/fallback call, so fallback works.
    const stepWrapper = (step: string) => wrapperOnForStep(appConfig?.wrapperModules, step);
    const fileTransport = normalizeFileTransport(appConfig?.fileTransport);
    const currentSemester = appConfig?.currentSemester || 1;
    const language = appConfig?.language || "german";
    const languageInstruction = `\n\nCRITICAL: You must generate ALL text, output, and responses strictly in ${language.toUpperCase()}. This applies to every section of the generated content.`;

    // ---- Prepare source material ----
    // Files travel as inlineData; gemini-retry's transport layer decides per
    // backend whether they stay inline or go through the File API, and its
    // FileDropped tripwire + official-API fallback cover delivery failures.
    // Each document gets a filename caption directly before its bytes —
    // inlineData carries no name, and the caption is what lets the model tell
    // multiple sources apart. NO text-extraction ride-along: sending the same
    // PDF twice (bytes + extracted text) wasted context and left the model two
    // "sources" it was never told were the same document.
    const masterContextParts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

    for (const fileInfo of filePaths) {
      try {
        const buffer = await fs.readFile(fileInfo.path);
        const name = fileInfo.name || path.basename(fileInfo.path);
        masterContextParts.push({ text: `Quellmaterial „${name}“:` });
        masterContextParts.push({
          inlineData: { data: buffer.toString("base64"), mimeType: fileInfo.mimeType },
        });
      } catch (err) {
        console.error(`[quiz-gen] Error reading file ${fileInfo.path}:`, err);
      }
    }

    if (textContent.trim()) {
      masterContextParts.push({ text: `Zusätzliches Textmaterial (vom Nutzer eingegeben):\n${textContent}` });
    }

    // ---- Step 1: Blueprint ----
    progress(1, "Analyzing material & Generating Blueprint...");
    const blueprintRes = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain} - ${subjectSub}` }, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
      config: { systemInstruction: PROMPTS.blueprint + STUDENT_CONTEXT + languageInstruction },
    }, (msg) => progress(1, msg), "Blueprint", stepWrapper("blueprint"), fileTransport);
    const blueprint = blueprintRes.text;

    // ---- Step 2: Quiz 1 (later quizzes are generated on-demand after grading) ----
    await heartbeat();
    progress(2, "Generating Quiz 1...");
    const quiz1Res = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
      config: { systemInstruction: PROMPTS.quiz_tag_1 + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` + STUDENT_CONTEXT + languageInstruction },
    }, (msg) => progress(2, msg), "Quiz 1", stepWrapper("quiz"), fileTransport);

    const quiz1Text = quiz1Res.text || "";
    // A module with an empty Quiz 1 is unusable: the student opens it to no quiz
    // and can never advance (currentQuizText falls back to an empty quiz1DocId).
    // Fail before the tutor/podcast calls and before persisting.
    if (!quiz1Text.trim()) {
      throw new Error("Quiz 1 wurde leer generiert — es wurde nichts gespeichert. Bitte versuche es erneut.");
    }

    const quiz1Ledger = extractSection(quiz1Text, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");

    // ---- Step 3+4: Tutor prompts & podcast prompts in parallel (independent) ----
    // Two tutor prompts per module: the quiz-phase tutor (pre-grading, guards
    // the assessment) and the assessment-phase tutor (post-grading, works from
    // the examiner's per-task assessment toward deep understanding).
    await heartbeat();
    progress(3, "Generating Tutor Prompts & Podcast Prompts...");
    const [tutorQuizRes, tutorAssessRes, podcastRes] = await Promise.all([
      generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain}` }, { text: `Didaktischer Blueprint:\n${blueprint}` }, { text: "Bitte generiere den Tutor-Prompt basierend auf dem bereitgestellten Blueprint." }] }],
        config: { systemInstruction: PROMPTS.tutor_prompt_quiz + languageInstruction },
      }, (msg) => progress(3, msg), "Tutor Prompt (Quiz)", stepWrapper("tutor_quiz"), fileTransport),
      generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain}` }, { text: `Didaktischer Blueprint:\n${blueprint}` }, { text: "Bitte generiere den Tutor-Prompt basierend auf dem bereitgestellten Blueprint." }] }],
        config: { systemInstruction: PROMPTS.tutor_prompt_assessment + languageInstruction },
      }, (msg) => progress(3, msg), "Tutor Prompt (Assessment)", stepWrapper("tutor_assessment"), fileTransport),
      generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: [...masterContextParts, { text: `Modul/Vorlesungsthema:\n${subjectMain}` }, { text: `Didaktischer Blueprint:\n${blueprint}` }, { text: "Bitte generiere die zwei Regieanweisungen basierend auf dem bereitgestellten Blueprint." }] }],
        config: { systemInstruction: podcast_prompts + languageInstruction },
      }, (msg) => progress(3, msg), "Podcast Prompts", stepWrapper("podcast"), fileTransport),
    ]);
    const tutorPrompt = tutorQuizRes.text;
    const tutorAssessmentPrompt = tutorAssessRes.text;
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
    await heartbeat();
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
        createGoogleDoc("Quiz 1 (Tag 1)", quiz1Text, folderId),
        createGoogleDoc("Tutor Prompt (Quiz)", tutorPrompt || "", folderId),
        createGoogleDoc("Tutor Prompt (Assessment)", tutorAssessmentPrompt || "", folderId),
      ]);
    } catch (e) {
      console.error("[quiz-gen] Google Drive upload failed (continuing with DB save):", e);
    }

    // ---- Step 7: Persist ----
    await heartbeat();
    progress(7, "Saving records to database...");
    // Create + set tutorPromptDocId to the item's own id ATOMICALLY. The old
    // two-step (create with "pending", then update) could crash between the
    // writes and leave tutorPromptDocId="pending" forever → a broken /tutor link.
    const finalItem = await prisma.$transaction(async (tx) => {
      const created = await tx.sRSItem.create({
        data: {
          subjectMain,
          subjectSub,
          semester: currentSemester,
          currentLevel: 0,
          nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          quiz1DocId: quiz1Text,
          blueprint,
          coverageLedger: quiz1Ledger,
          tutorPromptContent: tutorPrompt,
          tutorPromptAssessmentContent: tutorAssessmentPrompt,
          tutorPromptDocId: "pending",
          prePodcastPrompt: prePodcastPrompt || null,
          postPodcastPrompt: postPodcastPrompt || null,
          prePodcastUrl: preNotebookId ? `https://notebooklm.google.com/notebook/${preNotebookId}` : null,
          postPodcastUrl: postNotebookId ? `https://notebooklm.google.com/notebook/${postNotebookId}` : null,
          sourceMaterialContent: JSON.stringify({ driveFileId: mainPdfId, driveFolderId: folderId }),
        },
      });
      return tx.sRSItem.update({
        where: { id: created.id },
        data: { tutorPromptDocId: created.id },
      });
    });
    const createdItem = finalItem;

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
        // Only user-typed text goes to NotebookLM as "Vorlesungsskript" — the
        // worker uploads the actual files itself, so extracted PDF text would
        // just duplicate a source in the notebook.
        await generatePodcastWorker(createdItem.id, "pre", preNotebookId, textContent, filePaths);
      } catch (e) {
        console.error("[quiz-gen] Pre podcast worker failed:", e);
      }
    }
    if (postNotebookId) {
      try {
        await generatePodcastWorker(createdItem.id, "post", postNotebookId, textContent, filePaths);
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
