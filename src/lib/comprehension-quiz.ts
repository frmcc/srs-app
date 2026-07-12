import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { GRADE_PROMPTS } from "@/app/api/grade/prompts";
import { generateContentWithRetry, normalizeFileTransport } from "@/lib/gemini-retry";
import { wrapperOnForModule } from "@/lib/wrapper-modules";
import { buildSourceMaterialParts } from "@/lib/grading-pipeline";
import { extractSectionOr, formatPrompt } from "@/lib/markers";
import { countTasks, intervalLabelFor } from "@/lib/srs";

/**
 * Verständnis-Check quiz generation (library button).
 *
 * Builds a diagnostic quiz from the lecture's FULL assessment record: source
 * material, blueprint, coverage ledger, the chronological grader briefs
 * (ReviewLog), per-level fail stats and the previous comprehension feedback.
 * The result lands ONLY in `comprehensionQuizText` — the SRS schedule, levels,
 * quiz slots and logs are never touched. Each run overwrites the previous quiz.
 *
 * Grading happens through the normal pipeline with `comprehension: true`
 * (see grading-pipeline.ts), which stores score/pass/date/feedback the same
 * overwrite-per-run way.
 */

const DEFAULT_MODEL = "gemini-3.5-flash";

type Part = Record<string, unknown>;

/** Grader briefs can be huge — clip each so 8 of them still fit comfortably. */
function clip(text: string, max = 4000): string {
  return text.length > max ? text.slice(0, max) + "\n[... gekürzt ...]" : text;
}

export async function runComprehensionQuizGeneration(opts: {
  itemId: string;
  language?: string;
  modelName?: string;
  onProgress?: (step: number, message: string) => void;
}): Promise<{ quizText: string }> {
  const { itemId } = opts;
  const modelName = opts.modelName || DEFAULT_MODEL;
  const progress = opts.onProgress || (() => {});
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const srsItem = await prisma.sRSItem.findUnique({ where: { id: itemId } });
  if (!srsItem) throw new Error("SRS item not found");

  const appConfig = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const useAiWrapper = wrapperOnForModule(appConfig?.wrapperModules, srsItem.subjectMain);
  const fileTransport = normalizeFileTransport(appConfig?.fileTransport);
  const language = opts.language || appConfig?.language || "german";
  const languageInstruction = `\n\nCRITICAL: You must generate ALL text, output, and responses strictly in ${language.toUpperCase()}. This applies to every section of the generated content.`;

  // ---- Step 0: assessment record -------------------------------------------
  progress(0, language === "english" ? "Collecting assessment history..." : "Assessment-Historie wird gesammelt...");

  // Last 8 graded reviews, presented chronologically (the briefs carry the
  // misconceptions the quiz is supposed to attack).
  const logsDesc = await prisma.reviewLog.findMany({
    where: { itemId },
    orderBy: { completedAt: "desc" },
    take: 8,
  });
  const logs = [...logsDesc].reverse();

  const failRows = await prisma.reviewLog.groupBy({
    by: ["level"],
    where: { itemId, passed: false },
    _count: { _all: true },
  });

  // Previous comprehension run (feeds rule 6: don't repeat its questions).
  const prevComp = {
    comprehensionScore: srsItem.comprehensionScore,
    comprehensionPassed: srsItem.comprehensionPassed,
    comprehensionAt: srsItem.comprehensionAt,
    comprehensionFeedback: srsItem.comprehensionFeedback,
  };

  // ---- Step 1: lecture material --------------------------------------------
  progress(1, language === "english" ? "Loading lecture material..." : "Vorlesungsmaterial wird geladen...");
  const sourceMaterialParts = await buildSourceMaterialParts(srsItem);
  const subject = `${srsItem.subjectMain} - ${srsItem.subjectSub}`;

  const userParts: Part[] = [...sourceMaterialParts];
  userParts.push({ text: `Modul/Vorlesungsthema:\n${subject}` });
  if (srsItem.blueprint) userParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
  if (srsItem.coverageLedger) userParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });

  // Stats line: level + fails per level, compact and unambiguous.
  const failSummary = failRows.length
    ? failRows
        .sort((a, b) => a.level - b.level)
        .map((f) => `Level ${f.level + 1} (${intervalLabelFor(f.level)}): ${f._count._all} Fehlversuch(e)`)
        .join("; ")
    : "keine Fehlversuche";
  userParts.push({
    text: `Aktueller SRS-Stand des Studenten:\nAktuelles Level: ${srsItem.currentLevel + 1} (${intervalLabelFor(srsItem.currentLevel)})\nFehlversuche pro Level: ${failSummary}\nAnzahl bewerteter Reviews: ${logs.length === 8 ? "8 (letzte 8 von mehr)" : logs.length}`,
  });

  if (logs.length > 0) {
    const historyText = logs
      .map((log, i) => {
        const when = log.completedAt instanceof Date ? log.completedAt.toISOString().slice(0, 10) : String(log.completedAt).slice(0, 10);
        const head = `--- Review ${i + 1}/${logs.length} · ${when} · Level ${log.level + 1} (${intervalLabelFor(log.level)}) · ${log.passed ? "PASS" : "REPEAT"} ---`;
        return `${head}\n${clip(log.feedback || "(kein Feedback gespeichert)")}`;
      })
      .join("\n\n");
    userParts.push({ text: `Assessment-Historie (chronologisch, Prüfer-Briefs):\n${historyText}` });
  } else {
    userParts.push({ text: "Assessment-Historie: KEINE — es liegen noch keine bewerteten Reviews vor (Regel 3 anwenden)." });
  }

  if (prevComp?.comprehensionFeedback) {
    const when = prevComp.comprehensionAt instanceof Date
      ? prevComp.comprehensionAt.toISOString().slice(0, 10)
      : "unbekannt";
    userParts.push({
      text: `Letzter Verständnis-Check (${when}, Ergebnis: ${prevComp.comprehensionScore ?? "?"} % · ${prevComp.comprehensionPassed ? "PASS" : "REPEAT"}):\n${clip(prevComp.comprehensionFeedback)}`,
    });
  }

  userParts.push({ text: "Hier sind die Materialien und der bisherige Kontext. Bitte führe deine System-Instruktionen präzise aus." });

  // ---- Step 2: generate ------------------------------------------------------
  progress(2, language === "english" ? "Generating comprehension quiz..." : "Verständnis-Quiz wird generiert...");
  const res = await generateContentWithRetry(ai, modelName, {
    contents: [{ role: "user", parts: userParts as never }],
    config: { systemInstruction: formatPrompt(GRADE_PROMPTS.comprehension_quiz, { SUBJECT: subject }) + languageInstruction },
  }, (msg) => progress(2, msg), "Verständnis-Quiz", useAiWrapper, fileTransport);

  const quizText = res.text || "";
  // A quiz the grader can't count tasks in is unusable — fail BEFORE saving so
  // the previous comprehension quiz (if any) survives a bad generation.
  const studentQuiz = extractSectionOr(quizText, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===", quizText);
  if (!studentQuiz.trim() || countTasks(studentQuiz, 0) === 0) {
    throw new Error(
      language === "english"
        ? "The comprehension quiz came back empty — nothing was saved. Please try again."
        : "Das Verständnis-Quiz wurde leer generiert — es wurde nichts gespeichert. Bitte erneut versuchen."
    );
  }

  // ---- Step 3: persist (overwrite per run) -----------------------------------
  // ONLY the quiz column. Score/pass/date/feedback stay until the NEXT graded
  // run overwrites them — an abandoned quiz must not blank the library rating.
  progress(3, language === "english" ? "Saving quiz..." : "Quiz wird gespeichert...");
  await prisma.sRSItem.update({
    where: { id: itemId },
    data: { comprehensionQuizText: quizText },
  });

  return { quizText };
}
