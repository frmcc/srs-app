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

/** One scribbled answer box (allowlist feature; see SCRIBBLE_ALLOWED_EMAILS). */
export interface GradingSketch {
  /** Task heading the sketch belongs to, verbatim from the sheet (e.g. "Aufgabe 3"). */
  label: string;
  /** Raw base64 image data (no data:-URL prefix). */
  data: string;
  /** image/png, image/jpeg or image/webp (validated by the route). */
  mimeType: string;
}

export interface GradingSubmission {
  /** Typed answers (web) or extracted scan text (shortcut fallback). */
  text?: string;
  /** Scanned submission PDF (shortcut). */
  pdf?: { base64: string; mimeType: string };
  /**
   * Handwritten/scribbled answer boxes from the web UI (Apple Pencil canvas).
   * Sent to Gemini as inline images directly under the typed answers so the
   * examiners grade what was actually drawn instead of a lossy transcription.
   */
  sketches?: GradingSketch[];
}

export interface GradingResult {
  updatedItem: SRSItem;
  isPass: boolean;
  cleanFeedback: string;
  subject: string;
  interval: string;
  /** Only set in comprehension mode: the assessor's mastery percentage (0–100). */
  comprehensionScore?: number | null;
  /**
   * Deferred side effects (Drive doc uploads + NotebookLM video worker).
   * Web route passes this to after(); the shortcut route awaits it directly.
   * Kept out of the hot path so the user-facing result isn't blocked on Drive.
   */
  postActions: () => Promise<void>;
}

type Part = Record<string, unknown>;

/**
 * Pull the assessor's overall mastery percentage out of the summary. Pass ONLY
 * the summary/brief text here — NOT the appended per-task block, whose
 * "Beherrschung dieser Aufgabe: N %" lines would otherwise be grabbed as the
 * overall score. The no-match fallback for a PASS is the prompt's own ≥80%
 * threshold (a passing check must not render as a failing-looking 75%).
 */
function parseComprehensionScore(feedback: string, isPass: boolean): number {
  const head = feedback.slice(0, 1500);
  const labelled = head.match(/(?:Gesamtbeherrschung|Beherrschung|mastery|comprehension|Verständnis)[^\d%]{0,40}?(\d{1,3})\s*%/i);
  const anyPct = head.match(/(\d{1,3})\s*%/);
  const raw = labelled ? parseInt(labelled[1], 10) : anyPct ? parseInt(anyPct[1], 10) : isPass ? 80 : 45;
  return Math.max(0, Math.min(100, raw));
}

/** Re-hydrate the lecture material for the graders (Drive download + text fallback for the proxy). */
export async function buildSourceMaterialParts(item: SRSItem, ai: GoogleGenAI): Promise<Part[]> {
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
  /**
   * Comprehension mode ("Verständnis-Check"): identical examiner pipeline, but
   * the quiz comes from comprehensionQuizText, the outcome is ONLY the score
   * (+ pass/repeat color), and the SRS schedule/level/logs stay untouched.
   * Each run overwrites the previous score.
   */
  comprehension?: boolean;
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

  const language = opts.language || appConfig?.language || "german";
  const languageInstruction = `\n\nCRITICAL: You must generate ALL text, output, and responses strictly in ${language.toUpperCase()}. This applies to every section of the generated content.`
    // Pin the task-heading token so the task counter/split stays reliable across
    // languages (the counter keys on "Aufgabe N"/"Task N" at the start of a line).
    + `\n\nWhenever the output contains numbered tasks or questions, label each one at the very start of its own line as "${language === "english" ? "Task" : "Aufgabe"} N:" (N = the task number). Do not use a different word for the task headings.`;

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
  // Scribbled answer boxes: each image goes DIRECTLY under the typed answers,
  // pinned to its task heading, with a short handwriting disclaimer. The
  // examiners transcribe from the pixels themselves (Gemini is multimodal) — no
  // lossy pre-transcription step that could hallucinate content. answerParts is
  // reused by every grading step below, so the sketches reach all of them.
  if (submission.sketches?.length) {
    answerParts.push({
      text:
        `HINWEIS ZU GESCRIBBELTEN ANTWORTEN: Der Student hat ${submission.sketches.length === 1 ? "eine Antwort" : `${submission.sketches.length} Antworten`} ` +
        `handschriftlich gescribbelt (Stift/Touch). Die folgenden Bilder sind Teil seiner Antworten und gehören zu der jeweils genannten Aufgabe. ` +
        `Gescribbelte Handschrift und Skizzen können schwerer lesbar sein — transkribiere sorgfältig und wohlwollend, ` +
        `bewerte aber nur, was tatsächlich erkennbar ist, und erfinde nichts hinzu.`,
    });
    for (const sketch of submission.sketches) {
      answerParts.push({ text: `Gescribbelte Antwort des Studenten zu „${sketch.label}“ (Bild):` });
      answerParts.push({ inlineData: { data: sketch.data, mimeType: sketch.mimeType } });
    }
  }

  // ---- Context ------------------------------------------------------------
  const sourceMaterialParts = await buildSourceMaterialParts(srsItem, ai);
  // An item that CLAIMS to have source material but produced zero usable parts
  // (Drive download failed, 0-byte file, missing legacy file) must NOT be graded
  // — the examiners would reconstruct expected answers from nothing and persist
  // an arbitrary verdict. Abort so the user can retry; nothing has been written.
  if (srsItem.sourceMaterialContent && sourceMaterialParts.length === 0) {
    throw new Error("Vorlesungsmaterial konnte nicht geladen werden — Bewertung abgebrochen. Bitte erneut versuchen.");
  }

  let quizQuestions: string;
  if (opts.comprehension) {
    quizQuestions = srsItem.comprehensionQuizText || "";
    if (!quizQuestions.trim()) {
      throw new Error("Kein Verständnis-Quiz gefunden — bitte zuerst eines erstellen.");
    }
  } else {
    quizQuestions = currentQuizText(srsItem);
  }
  // Older quizzes were stored without markers — falling back to the full text is intentional here.
  const studentQuizText = extractSectionOr(quizQuestions, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===", quizQuestions);

  // Real count via the language-agnostic counter; if it genuinely finds no task
  // headings, treat the sheet as a single unit (grader 1 covers it, grader 2
  // no-ops) rather than fabricating 10 phantom tasks the graders would "fail".
  const totalTasks = countTasks(studentQuizText, 0) || 1;
  const splitPoint = Math.max(1, Math.floor(totalTasks / 2));
  const startIdx2 = splitPoint + 1;
  const subject = `${srsItem.subjectMain} - ${srsItem.subjectSub}`;
  const interval = opts.comprehension
    ? (language === "english" ? "Comprehension check" : "Verständnis-Check")
    : intervalLabelFor(srsItem.currentLevel);

  // ---- Step 0: MATCH/MISMATCH gate ----------------------------------------
  progress(0, "Verifying submission (MATCH/MISMATCH check)...");
  const mismatchCheckRes = await generateContentWithRetry(ai, modelName, {
    contents: [{ role: "user", parts: answerParts as never }],
    // Deliberately NO languageInstruction here: this step must emit the control
    // token MATCH/MISMATCH verbatim. Forcing German makes a compliant model
    // answer "ÜBEREINSTIMMUNG", which the parser can't read → the gate fails open.
    config: { systemInstruction: formatPrompt(GRADE_PROMPTS.mismatch_check, { QUIZ_QUESTIONS: studentQuizText }) },
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

  // Guard: if BOTH graders returned nothing (safety-blocked / empty candidates),
  // the Chief would "consolidate" two empty reports and invent a verdict on zero
  // evidence, which then gets persisted. Abort instead — nothing is written yet.
  if (!(res1.text || "").trim() && !(res2.text || "").trim()) {
    throw new Error("Die Bewertung durch die Co-Prüfer war leer (evtl. blockiert). Bitte Bewertung erneut starten.");
  }

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
        // Do NOT print both words together as an example — a model that echoes
        // the template would produce an ambiguous block. Ask for exactly one.
        + "\n\nWICHTIG: Beende deine Antwort mit einem Entscheidungsblock, der AUSSCHLIESSLICH dein Urteil enthält — entweder das Wort PASS oder das Wort REPEAT, niemals beide:\n===ASSESSMENT_DECISION_START===\n<hier NUR dein Urteil>\n===ASSESSMENT_DECISION_END===" },
    }, (msg) => progress(2, msg), "Chief Assessor (Retry)", useAiWrapper);
    chefFeedback = chefRetry.text || chefFeedback;
    isPass = parseAssessmentDecision(chefFeedback); // still unparseable ⇒ throws DecisionParseError
  }

  // ---- Comprehension mode: extract the score, save, stop -------------------
  // The schedule, level, quiz slots, ledger and review log are deliberately
  // never touched here — the check measures, it doesn't teach the planner.
  if (opts.comprehension) {
    progress(3, language === "english" ? "Extracting comprehension score..." : "Verständnis-Wert wird ermittelt...");

    const summaryC = extractSection(chefFeedback, "===ASSESSMENT_SUMMARY_START===", "===ASSESSMENT_SUMMARY_END===");
    const briefC = extractSection(chefFeedback, "===REMEDIATION_BRIEF_START===", "===REMEDIATION_BRIEF_END===");
    let compFeedback = "";
    if (summaryC) compFeedback += summaryC + "\n\n---\n\n";
    if (briefC) compFeedback += briefC;
    if (!compFeedback) {
      // Marker-miss fallback (mirrors the saas twin): keep the raw brief but
      // strip the machine-facing decision block so it never renders in the modal.
      compFeedback = chefFeedback
        .replace(/===ASSESSMENT_DECISION_START===[\s\S]*?===ASSESSMENT_DECISION_END===/g, "")
        .trim();
    }
    const perTaskC1 = extractSection(res1.text, "===QUESTION_ASSESSMENTS_PART_1_START===", "===QUESTION_ASSESSMENTS_PART_1_END===");
    const perTaskC2 = extractSection(res2.text, "===QUESTION_ASSESSMENTS_PART_2_START===", "===QUESTION_ASSESSMENTS_PART_2_END===");
    // Score the OVERALL mastery from the summary only, before the per-task block
    // is appended (per-task "Beherrschung dieser Aufgabe: N %" must not be read
    // as the overall score).
    const comprehensionScore = parseComprehensionScore(compFeedback, isPass);

    const perTaskC = [perTaskC1, perTaskC2].filter(Boolean).join("\n\n");
    if (perTaskC) {
      const headingC = language === "english" ? "# Per-Task Assessment" : "# Bewertung pro Aufgabe";
      compFeedback += `\n\n---\n\n${headingC}\n\n${perTaskC}`;
    }

    progress(4, language === "english" ? "Saving comprehension record..." : "Verständnis-Wert wird gespeichert...");
    const updatedItem = await prisma.sRSItem.update({
      where: { id: itemId },
      data: {
        comprehensionScore,
        comprehensionPassed: isPass,
        comprehensionAt: new Date(),
        comprehensionFeedback: compFeedback,
      },
    });

    return {
      updatedItem,
      isPass,
      cleanFeedback: compFeedback,
      subject,
      interval,
      comprehensionScore,
      postActions: async () => {},
    };
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
  // The follow-up quiz's system instruction (captured per branch, used below).
  let nextQuizInstruction = "";

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
      // Mastery loop (Tag 180 / Tag 365): include grader feedback + real answers.
      // Uses mastery_quiz (free recall + cold-recall anchors + synthesis) — the
      // old next_quiz_pass forced MC-only recognition and skipped everything
      // already mastered, which is backwards at the longest intervals.
      nextQuizParts = [...sourceMaterialParts];
      if (srsItem.blueprint) nextQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
      if (srsItem.coverageLedger) nextQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
      nextQuizParts.push({ text: `Original Quizfragen:\n${studentQuizText}` });
      nextQuizParts.push(...answerParts);
      nextQuizParts.push({ text: `Output des Assessment-Grader-AIs:\n${chefFeedback}` });
      nextQuizParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

      nextPrompt = GRADE_PROMPTS.mastery_quiz;
      nextIntervalLabel = generationStage === 5 ? "Tag 180" : "Tag 365";
    }

    nextQuizInstruction = formatPrompt(nextPrompt, { SUBJECT: subject, NEXT_INTERVAL: nextIntervalLabel, NEXT_INTERVAL_LABEL: nextIntervalLabel }) + languageInstruction;
    const nextQuizCall = generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: nextQuizParts as never }],
      config: { systemInstruction: nextQuizInstruction },
    }, (msg) => progress(3, msg), `Next Quiz (${nextIntervalLabel})`, useAiWrapper);

    const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
    lmRes = lmResult;
    nextQuizText = nextQuizRes.text || "";
    // Only the standard-stage prompts (quiz_tag_3/7/21/60) emit a coverage
    // ledger. mastery_quiz does not, so skip extraction there — attempting it
    // just logs a spurious "failed to extract marker" every mastery run and
    // leaves the ledger frozen (which is the intended behaviour at mastery).
    if (generationStage <= 4) {
      newLedgerText = extractSection(nextQuizText, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");
    }
  } else {
    // REPEAT: remedial quiz attacking the diagnosed misconceptions
    const remedialQuizParts: Part[] = [...sourceMaterialParts];
    if (srsItem.blueprint) remedialQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
    if (srsItem.coverageLedger) remedialQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
    remedialQuizParts.push({ text: `Original Quizfragen:\n${studentQuizText}` });
    remedialQuizParts.push(...answerParts);
    remedialQuizParts.push({ text: `Fehleranalyse des Graders:\n${chefFeedback}` });
    remedialQuizParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

    nextQuizInstruction = formatPrompt(GRADE_PROMPTS.retry_quiz_fail, { SUBJECT: subject, INTERVAL: interval }) + languageInstruction;
    const nextQuizCall = generateContentWithRetry(ai, modelName, {
      contents: [{ role: "user", parts: remedialQuizParts as never }],
      config: { systemInstruction: nextQuizInstruction },
    }, (msg) => progress(3, msg), "Next Quiz (REPEAT)", useAiWrapper);

    const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
    lmRes = lmResult;
    nextQuizText = nextQuizRes.text || "";
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

  // The Chief is told "das System fügt die Aufgabenbewertungen später automatisch
  // ein" — this is where that actually happens. The Co-Prüfer per-task blocks
  // ("Was eine gute Antwort zeigen müsste", "Fachliches Feedback an den
  // Studenten") are the most valuable corrective feedback in the whole run;
  // they used to be generated and then silently discarded. extractSection
  // returns "" on a marker miss, so a malformed grader reply degrades to
  // "no per-task section" instead of flooding the feedback with raw output.
  const perTaskPart1 = extractSection(res1.text, "===QUESTION_ASSESSMENTS_PART_1_START===", "===QUESTION_ASSESSMENTS_PART_1_END===");
  const perTaskPart2 = extractSection(res2.text, "===QUESTION_ASSESSMENTS_PART_2_START===", "===QUESTION_ASSESSMENTS_PART_2_END===");
  const perTaskFeedback = [perTaskPart1, perTaskPart2].filter(Boolean).join("\n\n");
  if (perTaskFeedback) {
    const heading = language === "english" ? "# Per-Task Assessment" : "# Bewertung pro Aufgabe";
    cleanFeedback += `\n\n---\n\n${heading}\n\n${perTaskFeedback}`;
  }

  // The follow-up quiz must be a REAL quiz (non-empty AND actually containing
  // tasks), for BOTH outcomes:
  //  - PASS over an empty/refusal quiz would advance the level while
  //    currentQuizText() silently falls back to Quiz 1, invisible for weeks; a
  //    non-empty refusal ("Ich kann kein Quiz erstellen…") would also slip past
  //    a mere emptiness check and then wedge the module behind the MISMATCH gate.
  //  - REPEAT over an empty remedial quiz would reschedule the student onto the
  //    exact quiz they just failed, with no signal that generation failed.
  // Nothing is persisted yet, so throwing is fully reversible — the user re-runs.
  const nextQuizBody = extractSectionOr(nextQuizText, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===", nextQuizText);
  if (!nextQuizBody.trim() || countTasks(nextQuizBody, 0) === 0) {
    throw new Error("Das nächste Quiz wurde leer oder ungültig generiert — es wurde nichts gespeichert. Bitte starte die Bewertung erneut.");
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
  // Bump the version so the optimistic lock below catches ANY concurrent grading
  // of this item — including REPEAT-vs-REPEAT, which leaves currentLevel unchanged.
  updatePayload.version = { increment: 1 };

  // Atomic: the optimistic-locked item update and the review-log insert either
  // both commit or neither does. Previously the log insert was a swallowed
  // best-effort call, so a failure (or an instance reclaim) could advance the
  // level with no log row — permanently under-counting stats/fail-history.
  const updatedItem = await prisma.$transaction(async (tx) => {
    const updated = await tx.sRSItem.updateMany({
      where: { id: itemId, version: srsItem.version },
      data: updatePayload,
    });
    if (updated.count === 0) throw new ConcurrentGradingError();

    await tx.reviewLog.create({
      data: {
        subjectMain: srsItem.subjectMain,
        subjectSub: srsItem.subjectSub,
        level: srsItem.currentLevel,
        passed: isPass,
        // Full brief per review — SRSItem.lastFeedback only keeps the latest,
        // the log preserves the whole learning trajectory per module.
        feedback: cleanFeedback || null,
        itemId: srsItem.id,
        userId: srsItem.userId,
      },
    });

    return (await tx.sRSItem.findUnique({ where: { id: itemId } }))!;
  });

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
