/**
 * Single source of truth for parsing the ===MARKER=== contracts in LLM output.
 *
 * Every extraction in this app MUST go through these helpers. Never write a
 * local fallback that returns the full unparsed text — that causes
 * catastrophic prompt-injection loops (full multi-section outputs get stored
 * as quizzes and fed back into later prompts).
 */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Tolerant marker regex: allows `={3,}` and stray whitespace. */
function markerRegex(startMarker: string, endMarker: string): RegExp {
  const safeStart = escapeRegExp(startMarker).replace(/===/g, "={3,}");
  const safeEnd = escapeRegExp(endMarker).replace(/===/g, "={3,}");
  return new RegExp(`[\\s\\S]*?${safeStart}\\s*([\\s\\S]*?)\\s*${safeEnd}`, "i");
}

/**
 * Extract the content between two markers.
 * SAFE FALLBACK: returns "" if the markers are missing.
 */
export function extractSection(text: string | undefined | null, startMarker: string, endMarker: string): string {
  if (!text) return "";
  const match = text.match(markerRegex(startMarker, endMarker));
  if (match && match[1]) return match[1].trim();
  console.warn(`[markers] Failed to extract ${startMarker}…${endMarker}. Returning empty fallback to prevent context flooding.`);
  return "";
}

/**
 * Like extractSection, but with an explicit fallback for cases where falling
 * back is *intentional* (e.g. legacy quizzes stored without markers).
 */
export function extractSectionOr(text: string | undefined | null, startMarker: string, endMarker: string, fallback: string): string {
  if (!text) return fallback;
  const match = text.match(markerRegex(startMarker, endMarker));
  return match && match[1] ? match[1].trim() : fallback;
}

/** Replace {KEY} placeholders in a prompt template. */
export function formatPrompt(template: string, vars: Record<string, string | number>): string {
  let formatted = template;
  for (const [key, val] of Object.entries(vars)) {
    formatted = formatted.replace(new RegExp(`\\{${key}\\}`, "g"), String(val));
  }
  return formatted;
}

/**
 * Parse the MATCH/MISMATCH verdict. The prompt demands a single word, so we
 * anchor at the start instead of substring-matching (".includes('MISMATCH')"
 * false-positives on verbose replies like "KEIN MISMATCH" and fails open on
 * garbage).
 *
 * Returns: true = mismatch, false = match, null = ambiguous (treat as match
 * but log — aborting a grading run over an unreadable verdict is worse).
 */
export function parseMismatchVerdict(text: string | undefined | null): boolean | null {
  const verdict = (text || "").trim().toUpperCase();
  if (/^MISMATCH\b/.test(verdict)) return true;
  if (/^MATCH\b/.test(verdict)) return false;
  // Tolerate light wrapping ("**MATCH**", "Antwort: MATCH") — look for a
  // standalone word, mismatch wins only if MATCH doesn't appear on its own.
  const hasMismatch = /\bMISMATCH\b/.test(verdict);
  const hasMatch = /\bMATCH\b/.test(verdict.replace(/MISMATCH/g, ""));
  if (hasMismatch && !hasMatch) return true;
  if (hasMatch && !hasMismatch) return false;
  return null;
}

export class DecisionParseError extends Error {
  constructor(rawOutput: string) {
    super("Chef-Prüfer Entscheidung konnte nicht gelesen werden. Bitte Bewertung erneut starten.");
    this.name = "DecisionParseError";
    console.error("[markers] Unparseable assessment decision. Raw head:", rawOutput.slice(0, 200));
  }
}

/**
 * Parse PASS/REPEAT from the Chief Assessor output.
 * 1. the ===ASSESSMENT_DECISION=== block
 * 2. fallback: "Entscheidung: PASS/REPEAT" inside the summary
 * 3. otherwise throw — silently defaulting to REPEAT demotes the student
 *    because of a parsing miss, which is worse than asking for a re-run.
 */
export function parseAssessmentDecision(chefFeedback: string): boolean {
  const block = extractSection(chefFeedback, "===ASSESSMENT_DECISION_START===", "===ASSESSMENT_DECISION_END===").toUpperCase();
  if (/\bPASS(ED)?\b/.test(block)) return true;
  if (/\bREPEAT\b/.test(block)) return false;
  const inline = chefFeedback.match(/Entscheidung:\s*\**\s*(PASS|REPEAT)/i);
  if (inline) return inline[1].toUpperCase() === "PASS";
  throw new DecisionParseError(chefFeedback);
}
