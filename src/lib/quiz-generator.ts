import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { PROMPTS } from "../app/api/quiz/prompts";
import { sendPushNotification } from "./push";
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
  const modelName = "gemini-3.0-flash";
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
    const blueprintRes = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
      config: { systemInstruction: PROMPTS.blueprint + `\n\nModul/Vorlesungsthema:\n${subjectMain} - ${subjectSub}` },
    });
    const blueprint = blueprintRes.text;

    // Steps 2-6: Quiz 1-5
    const quizPrompts = [PROMPTS.quiz_tag_1, PROMPTS.quiz_tag_3, PROMPTS.quiz_tag_7, PROMPTS.quiz_tag_21, PROMPTS.quiz_tag_60];
    const quizResults: string[] = [];
    let lastQuiz = "";
    let lastLedger = "";

    for (let i = 0; i < quizPrompts.length; i++) {
      progress(2 + i, `Generating Quiz ${i + 1}...`);
      const res = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
        config: { systemInstruction: quizPrompts[i] + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}\n\nVorheriger Quiz-Agent-Output:\n${lastQuiz}\n\nBisheriges Coverage Ledger:\n${lastLedger}` },
      });
      const text = res.text;
      quizResults.push(text || "");
      lastQuiz = extractSection(text, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===");
      lastLedger = extractSection(text, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");
    }

    // Step 7: Tutor Prompt
    progress(7, "Generating Tutor Prompt System...");
    const tutorRes = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
      config: { systemInstruction: PROMPTS.tutor_prompt + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` },
    });
    const tutorPrompt = tutorRes.text;

    // Step 8: Save to DB
    progress(8, "Saving records to database...");
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
        tutorPromptDocId: tutorPrompt,
        sourceMaterialContent: sourceMaterialContentPayload,
      },
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
