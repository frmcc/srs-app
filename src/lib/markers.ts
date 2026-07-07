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
    // Use a replacer FUNCTION so `$&`, `$'`, `` $` ``, `$1` etc. inside the
    // (model- or user-controlled) value are inserted literally instead of being
    // interpreted as replacement patterns, which would corrupt the prompt.
    const literal = String(val);
    formatted = formatted.replace(new RegExp(`\\{${key}\\}`, "g"), () => literal);
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
 * Decide PASS(true)/REPEAT(false) from a chunk of text, or null if it is
 * ambiguous / undecidable. Understands both the English tokens AND their German
 * translations, because the grading prompts run under a "generate ALL text in
 * GERMAN" instruction and a compliant model emits BESTANDEN / WIEDERHOLEN.
 *
 * Crucially, if BOTH a pass token and a repeat token appear (e.g. the model
 * echoed the template line "PASS oder REPEAT" instead of choosing), the result
 * is ambiguous → null. Returning PASS in that case silently promotes a student
 * who may have failed.
 */
function decidePassRepeat(raw: string): boolean | null {
  const s = raw.toUpperCase();
  // Strip "NICHT BESTANDEN" first so it doesn't count as a PASS token.
  const passCleaned = s.replace(/NICHT\s+BESTANDEN/g, " ");
  const pass = /\b(PASS(?:ED)?|BESTANDEN|BESTEHT)\b/.test(passCleaned);
  const repeat = /\b(REPEAT|WIEDERHOL\w*|DURCHGEFALLEN)\b/.test(s) || /NICHT\s+BESTANDEN/.test(s);
  if (pass && repeat) return null; // both present → ambiguous (template echo)
  if (pass) return true;
  if (repeat) return false;
  return null;
}

/**
 * Parse PASS/REPEAT from the Chief Assessor output.
 * 1. the ===ASSESSMENT_DECISION=== block
 * 2. fallback: "Entscheidung: …" inside the summary
 * 3. otherwise throw — silently defaulting to REPEAT demotes the student, and
 *    defaulting to PASS promotes a failing one; asking for a re-run is safest.
 */
export function parseAssessmentDecision(chefFeedback: string): boolean {
  const block = extractSection(chefFeedback, "===ASSESSMENT_DECISION_START===", "===ASSESSMENT_DECISION_END===");
  const fromBlock = decidePassRepeat(block);
  if (fromBlock !== null) return fromBlock;
  // Capture the WHOLE rest of the line so an echoed template ("Entscheidung:
  // PASS / REPEAT") is seen as ambiguous by decidePassRepeat instead of yielding
  // the first token.
  const inline = chefFeedback.match(/Entscheidung:\s*\**\s*([^\n]+)/i);
  if (inline) {
    const fromInline = decidePassRepeat(inline[1]);
    if (fromInline !== null) return fromInline;
  }
  throw new DecisionParseError(chefFeedback);
}
