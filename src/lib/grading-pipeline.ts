import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { GRADE_PROMPTS } from "@/app/api/grade/prompts";
import { PROMPTS } from "@/app/api/quiz/prompts";
import { downloadFromDrive, createGoogleDoc } from "@/lib/google-drive";
import { sendPushNotification } from "@/lib/push";
import { generateContentWithRetry } from "@/lib/gemini-retry";
import { generateVideoPromptsWorker } from "@/lib/notebooklm";
import { extractSection, extractSectionOr, formatPrompt, parseMismatchVerdict, parseAssessmentDecision, DecisionParseError } from "@/lib/markers";
import { countTasks, currentQuizText, intervalLabelFor, nextReviewDateAfter, quizFieldForLevel, INTERVAL_LABELS } from "@/lib/srs";
import { pdfToText } from "@/lib/pdf-text";
import type { SRSItem } from "@prisma/client";
import fs from "fs/promises";

/**
 * THE grading pipeline. Used by both:
 *  - /api/grade           (web UI, typed answers, streams progress)
 *  - /api/grade/shortcut  (iPhone Shortcut, scanned PDF, runs in after())
 *
 * Any change to grading behavior happens HERE, exactly once.
 */

const DEFAULT_MODEL = "gemini-3.5-flash";

export class GradingMismatchError extends Error {
  constructor() {
    super("Falsches Quiz hochgeladen. Bitte überprüfe deine Einreichung.");
    this.name = "GradingMismatchError";
  }
}

export class ConcurrentGradingError extends Error {
  constructor() {
    super("Dieses Modul wurde gerade parallel bewertet. Bitte Dashboard aktualisieren.");
    this.name = "ConcurrentGradingError";
  }
}

export interface GradingSubmission {
  /** Typed answers (web) or extracted scan text (shortcut fallback). */
  text?: string;
  /** Scanned submission PDF (shortcut). */
  pdf?: { base64: string; mimeType: string };
}

export interface GradingResult {
  updatedItem: SRSItem;
  isPass: boolean;
  cleanFeedback: string;
  subject: string;
  interval: string;
  /**
   * Deferred side effects (Drive doc uploads + NotebookLM video worker).
   * Web route passes this to after(); the shortcut route awaits it directly.
   * Kept out of the hot path so the user-facing result isn't blocked on Drive.
   */
  postActions: () => Promise<void>;
}

type Part = Record<string, unknown>;

/** Re-hydrate the lecture material for the graders (Drive download + text fallback for the proxy). */
async function buildSourceMaterialParts(item: SRSItem, ai: GoogleGenAI): Promise<Part[]> {
  const parts: Part[] = [];
  if (!item.sourceMaterialContent) return parts;

  try {
    const parsed = JSON.parse(item.sourceMaterialContent);

    if (parsed.driveFileId) {
      try {
        const buffer = await downloadFromDrive(parsed.driveFileId);
        if (buffer.length === 0) {
          console.warn(`[grading] Drive file ${parsed.driveFileId} is EMPTY — item ${item.id} has corrupt source material.`);
        } else {
          parts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } });
          try {
            parts.push({ text: `Vorlesungsmaterial (Text):\n${await pdfToText(buffer)}` });
          } catch (e) {
            console.error("[grading] PDF parse failed:", e);
          }
        }
      } catch (err) {
        console.error("[grading] Could not download source material from Drive:", err instanceof Error ? err.message : err);
      }
    } else if (Array.isArray(parsed.files)) {
      // Legacy items: base64 or local file path
      for (const fileInfo of parsed.files) {
        try {
          if (fileInfo.base64) {
            parts.push({ inlineData: { data: fileInfo.base64, mimeType: fileInfo.mimeType } });
          } else if (fileInfo.path) {
            await fs.access(fileInfo.path);
            const uploadResult = await ai.files.upload({ file: fileInfo.path, config: { mimeType: fileInfo.mimeType } });
            parts.push({ fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } });
          }
        } catch (fileErr) {
          console.error(`[grading] Could not use legacy file ${fileInfo.name || fileInfo.path}:`, fileErr instanceof Error ? fileErr.message : fileErr);
        }
      }
    }

    if (parsed.text && String(parsed.text).trim()) {
      parts.push({ text: `Vorlesungsmaterial (Text):\n${parsed.text}` });
    }
  } catch {
    // Oldest legacy shape: plain text in the column
    parts.push({ text: `Vorlesungsmaterial:\n${item.sourceMaterialContent}` });
  }

  return parts;
}

function driveFolderIdFor(item: SRSItem): string {
  let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  if (item.sourceMaterialContent) {
    try {
      const parsed = JSON.parse(item.sourceMaterialContent);
      if (parsed.driveFolderId) folderId = parsed.driveFolderId;
    } catch { /* legacy plain text */ }
  }
  return folderId;
}

export async function runGradingPipeline(opts: {
  itemId: string;
  submission: GradingSubmission;
  language?: string;
  modelName?: string;
  onProgress?: (step: number, message: string) => void;
}): Promise<GradingResult> {
  const { itemId, submission } = opts;
  const modelName = opts.modelName || DEFAULT_MODEL;
  const progress = opts.onProgress || (() => {});
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const srsItem = await prisma.sRSItem.findUnique({ where: { id: itemId } });
  if (!srsItem) throw new Error("SRS item not found");

  const appConfig = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const useAiWrapper = (appConfig?.wrapperMode || "all") === "all";
  const agentMode = appConfig?.agentMode || false;

  const language = opts.language || appConfig?.language || "german";
  const languageInstruction = `\n\nCRITICAL: You must generate ALL text, output, and responses strictly in ${language.toUpperCase()}. This applies to every section of the generated content.`;

  // ---- Submission parts (the student's actual answers) -------------------
  const answerParts: Part[] = [];
  let submissionText = submission.text || "";
  if (submission.pdf) {
    answerParts.push({ text: "Beantwortetes Quiz des Studenten (handschriftlich gescannt):" });
    answerParts.push({ inlineData: { data: submission.pdf.base64, mimeType: submission.pdf.mimeType } });
    if (!submissionText) {
      try {
        submissionText = await pdfToText(Buffer.from(submission.pdf.base64, "base64"));
      } catch (e) {
        console.error("[grading] Student PDF parse failed:", e);
      }
    }
    if (submissionText.trim()) answerParts.push({ text: `(Zusätzlicher extrahierter Text vom Scan):\n${submissionText}` });
  } else {
    answerParts.push({ text: `Beantwortetes Quiz des Studenten:\n${submissionText}` });
  }

  // ---- Context ------------------------------------------------------------
  const sourceMaterialParts = await buildSourceMaterialParts(srsItem, ai);
  const quizQuestions = currentQuizText(srsItem);
  // Older quizzes were stored without markers — falling back to the full text is intentional here.
  const studentQuizText = extractSectionOr(quizQuestions, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===", quizQuestions);

  const totalTasks = countTasks(studentQuizText);
  const splitPoint = Math.max(1, Math.floor(totalTasks / 2));
  const startIdx2 = splitPoint + 1;
  const subject = `${srsItem.subjectMain} - ${srsItem.subjectSub}`;
  const interval = intervalLabelFor(srsItem.currentLevel);

  // ---- Step 0: MATCH/MISMATCH gate ----------------------------------------
  progress(0, "Verifying submission (MATCH/MISMATCH check)...");
  const mismatchCheckRes = await generateContentWithRetry(ai, modelName, {
    contents: [{ role: "user", parts: answerParts as never }],
    config: { systemInstruction: formatPrompt(GRADE_PROMPTS.mismatch_check, { QUIZ_QUESTIONS: studentQuizText }) + languageInstruction },
  }, (msg) => progress(0, msg), "Submission Check", useAiWrapper);

  const verdict = parseMismatchVerdict(mismatchCheckRes.text);
  if (verdict === true) throw new GradingMismatchError();
  if (verdict === null) console.warn("[grading] Ambiguous MATCH/MISMATCH verdict — proceeding:", (mismatchCheckRes.text || "").slice(0, 120));

  // ---- Step 1: Co-Prüfer in parallel --------------------------------------
  progress(1, "Parallel Grading: Co-Prüfer 1 & 2 evaluating answers...");
  const coUserParts: Part[] = [...sourceMaterialParts];
  if (srsItem.blueprint) coUserParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
  coUserParts.push({ text: `Original-Quizfragen:\n${studentQuizText}` });
  coUserParts.push(...answerParts);
  coUserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

  const [res1, res2] = await Promise.all([
    generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: coUserParts as never }],
      config: { systemInstruction: formatPrompt(GRADE_PROMPTS.co_pruefer_1, { TOTAL_TASKS: totalTasks, SPLIT_POINT: splitPoint, SUBJECT: subject, INTERVAL: interval }) + languageInstruction },
    }, (msg) => progress(1, msg), "Co-Prüfer 1", useAiWrapper),
    generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: coUserParts as never }],
      config: { systemInstruction: formatPrompt(GRADE_PROMPTS.co_pruefer_2, { TOTAL_TASKS: totalTasks, START_INDEX: startIdx2, SUBJECT: subject, INTERVAL: interval }) + languageInstruction },
    }, (msg) => progress(1, msg), "Co-Prüfer 2", useAiWrapper),
  ]);

  // ---- Step 2: Chief Assessor ----------------------------------------------
  progress(2, "Chief Assessor: Consolidating final decision & generating brief...");
  const chefUserParts: Part[] = [...sourceMaterialParts];
  chefUserParts.push({ text: `Bewertung der ersten Quiz-Hälfte (von Co-Prüfer 1):\n${res1.text || ""}` });
  chefUserParts.push({ text: `Bewertung der zweiten Quiz-Hälfte (von Co-Prüfer 2):\n${res2.text || ""}` });
  chefUserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

  const chefRes = await generateContentWithRetry(ai, modelName, {
    contents: [{ role: "user", parts: chefUserParts as never }],
    config: { systemInstruction: formatPrompt(GRADE_PROMPTS.chef_pruefer, { SUBJECT: subject, INTERVAL: interval }) + languageInstruction },
  }, (msg) => progress(2, msg), "Chief Assessor", useAiWrapper);

  let chefFeedback = chefRes.text || "";
  let isPass: boolean;
  try {
    isPass = parseAssessmentDecision(chefFeedback); // throws instead of silently demoting
  } catch (decisionErr) {
    if (!(decisionErr instanceof DecisionParseError)) throw decisionErr;
    // The PASS/REPEAT decision is the cheapest call to redo, and forcing a full
    // re-run after a long (60/180/365-day) wait is painful — so re-ask ONLY the
    // Chief Assessor once with a stricter decision-format instruction before
    // giving up. Same context, same wrapper flag; nothing is persisted yet.
    progress(2, "Chief Assessor: Entscheidung wird erneut angefordert...");
    const chefRetry = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: chefUserParts as never }],
      config: { systemInstruction: formatPrompt(GRADE_PROMPTS.chef_pruefer, { SUBJECT: subject, INTERVAL: interval })
        + languageInstruction
        + "\n\nWICHTIG: Gib am Ende zwingend einen klaren Entscheidungsblock aus:\n===ASSESSMENT_DECISION_START===\nPASS oder REPEAT\n===ASSESSMENT_DECISION_END===" },
    }, (msg) => progress(2, msg), "Chief Assessor (Retry)", useAiWrapper);
    chefFeedback = chefRetry.text || chefFeedback;
    isPass = parseAssessmentDecision(chefFeedback); // still unparseable ⇒ throws DecisionParseError
  }

  // ---- Step 3: Follow-up material -------------------------------------------
  progress(3, "Spacing Logic: Calculating intervals & generating follow-ups...");

  const lmUserParts: Part[] = [...sourceMaterialParts];
  if (srsItem.blueprint) lmUserParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
  lmUserParts.push({ text: `Original Quizfragen:\n${studentQuizText}` });
  lmUserParts.push(...answerParts); // the REAL answers — not the question sheet
  lmUserParts.push({ text: `Output des Assessment-Grader-AIs:\n${chefFeedback}` });
  lmUserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

  const lmPromptCall = generateContentWithRetry(ai, modelName, {
    contents: [{ role: "user", parts: lmUserParts as never }],
    config: { systemInstruction: formatPrompt(isPass ? GRADE_PROMPTS.video_pass : GRADE_PROMPTS.video_repeat, { SUBJECT: subject, INTERVAL: interval }) + languageInstruction },
  }, (msg) => progress(3, msg), "Video Prompts", useAiWrapper);

  let nextQuizText = "";
  let newLedgerText = "";
  let lmRes;

  // The level we GRADE at vs the level we move TO. Mastery (5+) keeps cycling quiz7.
  const nextLevel = srsItem.currentLevel + 1; // uncapped mastery counter
  const generationStage = Math.min(nextLevel, 6); // which prompt/quiz slot to use

  if (isPass) {
    let nextQuizParts: Part[] = [];
    let nextPrompt = "";
    let nextIntervalLabel = "";

    if (generationStage <= 4) {
      // Standard intervals: same context shape the quiz generator used originally
      nextQuizParts = [...sourceMaterialParts];
      nextQuizParts.push({ text: `Modul/Vorlesungsthema:\n${srsItem.subjectMain}` });
      if (srsItem.blueprint) nextQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
      if (studentQuizText) nextQuizParts.push({ text: `Vorheriger Quiz-Agent-Output:\n${studentQuizText}` });
      if (srsItem.coverageLedger) nextQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
      nextQuizParts.push({ text: "Hier sind die Materialien und der bisherige Kontext. Bitte führe deine System-Instruktionen präzise aus." });

      const stagePrompts: Record<number, { prompt: string; label: string }> = {
        1: { prompt: PROMPTS.quiz_tag_3, label: "Tag 3" },
        2: { prompt: PROMPTS.quiz_tag_7, label: "Tag 7" },
        3: { prompt: PROMPTS.quiz_tag_21, label: "Tag 21" },
        4: { prompt: PROMPTS.quiz_tag_60, label: "Tag 60" },
      };
      nextPrompt = stagePrompts[generationStage].prompt;
      nextIntervalLabel = stagePrompts[generationStage].label;
    } else {
      // Mastery loop (Tag 180 / Tag 365): include grader feedback + real answers
      nextQuizParts = [...sourceMaterialParts];
      if (srsItem.blueprint) nextQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
      if (srsItem.coverageLedger) nextQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
      nextQuizParts.push({ text: `Original Quizfragen:\n${studentQuizText}` });
      nextQuizParts.push(...answerParts);
      nextQuizParts.push({ text: `Output des Assessment-Grader-AIs:\n${chefFeedback}` });
      nextQuizParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

      nextPrompt = GRADE_PROMPTS.next_quiz_pass;
      nextIntervalLabel = generationStage === 5 ? "Tag 180" : "Tag 365";
    }

    const nextQuizCall = generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: nextQuizParts as never }],
      config: { systemInstruction: formatPrompt(nextPrompt, { SUBJECT: subject, NEXT_INTERVAL: nextIntervalLabel, NEXT_INTERVAL_LABEL: nextIntervalLabel }) + languageInstruction },
    }, (msg) => progress(3, msg), `Next Quiz (${nextIntervalLabel})`, useAiWrapper);

    const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
    lmRes = lmResult;
    nextQuizText = nextQuizRes.text || "";
  } else {
    // REPEAT: remedial quiz attacking the diagnosed misconceptions
    const remedialQuizParts: Part[] = [...sourceMaterialParts];
    if (srsItem.blueprint) remedialQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
    if (srsItem.coverageLedger) remedialQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
    remedialQuizParts.push({ text: `Original Quizfragen:\n${studentQuizText}` });
    remedialQuizParts.push(...answerParts);
    remedialQuizParts.push({ text: `Fehleranalyse des Graders:\n${chefFeedback}` });
    remedialQuizParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

    const nextQuizCall = generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: remedialQuizParts as never }],
      config: { systemInstruction: formatPrompt(GRADE_PROMPTS.retry_quiz_fail, { SUBJECT: subject, INTERVAL: interval }) + languageInstruction },
    }, (msg) => progress(3, msg), "Next Quiz (REPEAT)", useAiWrapper);

    const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
    lmRes = lmResult;
    nextQuizText = nextQuizRes.text || "";
  }

  if (agentMode && nextQuizText.trim()) {
    progress(3.5, "Agent Mode: Reflecting on draft and self-correcting...");
    const agentRes = await generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: [{ text: `Original Draft:\n${nextQuizText}\n\nBlueprint:\n${srsItem.blueprint || "N/A"}\n\nPlease critically review your drafted quiz. Check if the wrong answers are plausible but strictly incorrect, if the difficulty is appropriate for university level, and if the concepts from the blueprint are deeply covered. Fix any flaws and output ONLY the final perfected JSON Quiz (with the coverage ledger if present).` }] }],
      config: { systemInstruction: `You are an expert educational agent. Your task is to critique and refine the drafted quiz. Output ONLY the final perfected JSON exactly following the requested schema. Do not wrap in markdown code blocks if possible.` + languageInstruction },
    }, (msg) => progress(3.5, msg), "Next Quiz Agent Reflection", useAiWrapper);
    
    if (agentRes.text?.trim()) {
      nextQuizText = agentRes.text;
    } else {
      console.warn("[grading] Agent reflection returned empty. Falling back to draft.");
    }
  }

  if (isPass) {
    newLedgerText = extractSection(nextQuizText, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");
  }

  const videoPromptsText = lmRes.text || "";
  const lastVideoPrompt1 = extractSection(videoPromptsText, "===VIDEO_1_START===", "===VIDEO_1_END===");
  const lastVideoPrompt2 = extractSection(videoPromptsText, "===VIDEO_2_START===", "===VIDEO_2_END===");

  // ---- Feedback for the UI ---------------------------------------------------
  const summary = extractSection(chefFeedback, "===ASSESSMENT_SUMMARY_START===", "===ASSESSMENT_SUMMARY_END===");
  const brief = extractSection(chefFeedback, "===REMEDIATION_BRIEF_START===", "===REMEDIATION_BRIEF_END===");
  let cleanFeedback = "";
  if (summary) cleanFeedback += summary + "\n\n---\n\n";
  if (brief) cleanFeedback += brief;
  if (!cleanFeedback) cleanFeedback = chefFeedback;

  // A PASS must never advance the student over an EMPTY quiz slot. If it did,
  // currentQuizText() silently falls back to Quiz 1, the schedule has already
  // jumped to the long interval, and the regression stays invisible until the
  // next (possibly 60/180/365-day) review. Nothing has been written yet, so
  // throwing here is fully reversible — the item stays at its current level and
  // the user just re-runs grading. (REPEAT is unaffected: it keeps the current
  // level, and the `if (nextQuizText)` guard below already protects its slot.)
  if (isPass && !nextQuizText.trim()) {
    throw new Error("Das nächste Quiz wurde leer generiert — es wurde nichts gespeichert. Bitte starte die Bewertung erneut.");
  }

  // ---- Step 4: persist (with optimistic lock) ---------------------------------
  progress(4, "Saving records to database...");

  const updatePayload: Record<string, unknown> = {
    nextReviewDate: nextReviewDateAfter(srsItem.currentLevel, isPass),
    lastFeedback: cleanFeedback,
    lastVideoPrompt1,
    lastVideoPrompt2,
  };

  // On PASS the new quiz goes into the NEXT slot; on REPEAT it replaces the current one.
  const targetQuizField = isPass ? quizFieldForLevel(generationStage) : quizFieldForLevel(srsItem.currentLevel);
  if (isPass) {
    updatePayload.currentLevel = nextLevel;
    if (newLedgerText) updatePayload.coverageLedger = newLedgerText;
  }
  if (nextQuizText) updatePayload[targetQuizField] = nextQuizText;

  // Optimistic lock: only update if nobody else graded this item in the meantime.
  const updated = await prisma.sRSItem.updateMany({
    where: { id: itemId, currentLevel: srsItem.currentLevel },
    data: updatePayload,
  });
  if (updated.count === 0) throw new ConcurrentGradingError();

  const updatedItem = (await prisma.sRSItem.findUnique({ where: { id: itemId } }))!;

  try {
    await prisma.reviewLog.create({
      data: {
        subjectMain: srsItem.subjectMain,
        subjectSub: srsItem.subjectSub,
        level: srsItem.currentLevel,
        passed: isPass,
        userId: srsItem.userId,
      },
    });
  } catch (logError) {
    console.error("[grading] Failed to create review log:", logError);
  }

  sendPushNotification({
    title: `${isPass ? "✅" : "🔄"} Bewertung fertig: ${isPass ? "PASS" : "REPEAT"}`,
    body: `${subject} (${interval}) — ${isPass ? "Weiter zum nächsten Level!" : "Wiederholung nötig."}`,
    tag: `grade-done-${itemId}`,
    url: "/",
  }).catch((e) => console.error("Push notification failed:", e));

  // ---- Deferred side effects ----------------------------------------------------
  const postActions = async () => {
    if (nextQuizText) {
      const folderId = driveFolderIdFor(srsItem);
      const docName = isPass
        ? `Quiz ${generationStage + 1} (${nextLevel <= 6 ? INTERVAL_LABELS[generationStage] : "Tag 365+"})`
        : `Wiederholungs-Quiz (${interval})`;
      try {
        if (folderId) await createGoogleDoc(docName, nextQuizText, folderId);
      } catch (e) {
        console.error("[grading] Failed to upload quiz doc to Drive:", e);
      }
    }
    try {
      await generateVideoPromptsWorker(itemId, isPass, subject, lastVideoPrompt1, lastVideoPrompt2);
    } catch (e) {
      console.error("[grading] Video prompt worker failed:", e);
    }
  };

  return { updatedItem, isPass, cleanFeedback, subject, interval, postActions };
}
