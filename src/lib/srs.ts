import type { SRSItem } from "@prisma/client";

/**
 * Single source of truth for the spaced-repetition leveling system.
 * Levels 0–4 are the standard intervals, 5+ is the mastery loop.
 * NOTE: the quizNDocId columns historically store the FULL quiz text,
 * not Google Doc IDs.
 */

export const INTERVAL_LABELS = ["Tag 1", "Tag 3", "Tag 7", "Tag 21", "Tag 60", "Tag 180", "Tag 365"] as const;

const PASS_INTERVAL_DAYS = [3, 7, 21, 60, 180] as const; // index = currentLevel; 5+ ⇒ 365
const FAIL_INTERVAL_DAYS = [1, 3] as const; //              index = currentLevel; 2+ ⇒ 7

export type QuizField = "quiz1DocId" | "quiz2DocId" | "quiz3DocId" | "quiz4DocId" | "quiz5DocId" | "quiz6DocId" | "quiz7DocId";

const QUIZ_FIELDS: QuizField[] = ["quiz1DocId", "quiz2DocId", "quiz3DocId", "quiz4DocId", "quiz5DocId", "quiz6DocId", "quiz7DocId"];

/** Human label for the interval a given level sits at ("Tag 365" for 6+). */
export function intervalLabelFor(level: number): string {
  return INTERVAL_LABELS[Math.min(level, INTERVAL_LABELS.length - 1)] || "Tag 1";
}

/** The quiz column an item at `level` should be quizzed FROM (mastery 6+ rolls over in quiz7). */
export function quizFieldForLevel(level: number): QuizField {
  return QUIZ_FIELDS[Math.min(Math.max(level, 0), QUIZ_FIELDS.length - 1)];
}

/** The stored quiz text for the item's current level, falling back to quiz 1. */
export function currentQuizText(item: Pick<SRSItem, QuizField | "currentLevel">): string {
  return item[quizFieldForLevel(item.currentLevel)] || item.quiz1DocId || "";
}

/** Days until the next review given the level the student was graded AT. */
export function intervalDaysAfter(currentLevel: number, isPass: boolean): number {
  if (isPass) return PASS_INTERVAL_DAYS[currentLevel] ?? 365;
  return FAIL_INTERVAL_DAYS[currentLevel] ?? 7;
}

export function nextReviewDateAfter(currentLevel: number, isPass: boolean): Date {
  const d = new Date();
  d.setDate(d.getDate() + intervalDaysAfter(currentLevel, isPass));
  return d;
}

/**
 * Heading words that a generated quiz may use to label a task, at the start of
 * a line. German ("Aufgabe"/"Frage") plus the English synonyms a model actually
 * emits when told to "translate everything" (nothing pins it to "Task"):
 * Task / Question / Exercise / Problem / Item. Matching a broad set stops the
 * language of the quiz from silently zeroing the count.
 */
const TASK_HEADING_RE = /^[ \t]*(?:Aufgabe|Frage|Task|Question|Exercise|Problem|Item)\s+\d+/gim;

/**
 * Count tasks in a quiz sheet. Anchored at line start so cross-references inside
 * question text ("vergleiche mit Aufgabe 2") don't inflate the count.
 *
 * Returns the real count; if nothing matches it returns `fallback`. Callers that
 * need to distinguish "genuinely zero" from "couldn't parse" should pass
 * `fallback = 0` and check for 0 explicitly (see grading-pipeline's split math).
 */
export function countTasks(quizSheet: string, fallback = 10): number {
  return (quizSheet.match(TASK_HEADING_RE) || []).length || fallback;
}
