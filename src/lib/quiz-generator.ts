import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { PROMPTS, podcast_prompts } from "../app/api/quiz/prompts";
import { sendPushNotification } from "./push";
import { generatePodcastWorker } from "./notebooklm";
import { generateContentWithRetry } from "./gemini-retry";
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
  filePaths: { path: string; mimeType: string }[];
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
      } catch (err: any) {
        console.error(`Error uploading file to Gemini:`, err);
      }
    }

    const masterContextParts = [...geminiFileParts];
    if (textContent.trim()) {
      masterContextParts.push({ text: `\n\nZusätzliches Textmaterial:\n${textContent}` });
    }

    const sourceMaterialContentPayload = JSON.stringify({
      text: textContent,
      files: filePaths,
    });

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

    // Step 9: Save to DB
    progress(9, "Saving records to database...");
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
        sourceMaterialContent: sourceMaterialContentPayload,
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
    generatePodcastWorker(createdItem.id, "pre").catch(console.error);
    generatePodcastWorker(createdItem.id, "post").catch(console.error);

    return createdItem;
  } catch (error: any) {
    if (jobId) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: "error", error: error.message, completedAt: new Date() },
      });
    }

    // Send error push notification
    await sendPushNotification({
      title: "❌ Quiz-Generierung fehlgeschlagen",
      body: `${subjectMain}: ${error.message}`,
      tag: `quiz-error-${jobId}`,
    }).catch(() => {});

    throw error;
  }
}
