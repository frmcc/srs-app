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
 * Count tasks in a quiz sheet. The generation prompts enforce "Aufgabe N"
 * (German) / "Task N" (English mode translates everything) at line starts.
 * Anchoring at the line start also stops cross-references inside question
 * text ("vergleiche mit Aufgabe 2") from inflating the count.
 *
 * The German-only, unanchored predecessor made EVERY English quiz count as
 * zero → fallback 10 → the Co-Prüfer were told to grade tasks that didn't
 * exist (mirrors the Task|Aufgabe fix already in the UI's parseQuizTasks).
 */
export function countTasks(quizSheet: string, fallback = 10): number {
  return (quizSheet.match(/^[ \t]*(?:Aufgabe|Task)\s+\d+/gim) || []).length || fallback;
}
