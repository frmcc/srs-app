/**
 * Per-STEP AI-Studio-wrapper toggles.
 *
 * AppConfig.wrapperModules is a JSON map `{ "<step key>": true }`. A step toggled
 * on routes THAT Gemini pipeline call (blueprint, quiz, the tutor-prompt
 * generators, the co-examiners, the chief assessor, …) through the wrapper
 * (proxy-first, official fallback); a step that is absent or false uses the
 * official Gemini API. The keys are the pipeline STEPS below — not university
 * modules. (The column keeps its historical name for migration safety.)
 *
 * The native File API upload still runs on any official/fallback call, so
 * fallback works regardless of these toggles.
 */
export function parseWrapperModules(json: string | null | undefined): Record<string, boolean> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed)) out[k] = v === true;
      return out;
    }
  } catch {
    /* corrupt column → treat as all-off */
  }
  return {};
}

/** True when the wrapper is toggled ON for this Gemini pipeline step. */
export function wrapperOnForStep(json: string | null | undefined, step: string | null | undefined): boolean {
  if (!step) return false;
  return parseWrapperModules(json)[step.trim()] === true;
}

/**
 * The Gemini pipeline steps that can individually route through the wrapper,
 * in run order. `key` is the stable identifier stored in wrapperModules; de/en
 * are the toggle labels shown in Settings.
 */
export const WRAPPER_STEPS: { key: string; de: string; en: string }[] = [
  { key: "blueprint",        de: "Blueprint",                en: "Blueprint" },
  { key: "quiz",             de: "Quiz-Generierung",         en: "Quiz generation" },
  { key: "tutor_quiz",       de: "Tutor-Prompt (Quiz)",      en: "Tutor prompt (quiz)" },
  { key: "tutor_assessment", de: "Tutor-Prompt (Bewertung)", en: "Tutor prompt (assessment)" },
  { key: "podcast",          de: "Podcast-Prompts",          en: "Podcast prompts" },
  { key: "mismatch",         de: "Abgabe-Check",             en: "Submission check" },
  { key: "copruefer",        de: "Co-Prüfer 1 & 2",          en: "Co-examiners 1 & 2" },
  { key: "chief_assessor",   de: "Chef-Prüfer (Benotung)",   en: "Chief assessor (grading)" },
  { key: "video_prompts",    de: "Video-Prompts",            en: "Video prompts" },
  { key: "next_quiz",        de: "Nächstes Quiz",            en: "Next quiz" },
  { key: "comprehension",    de: "Verständnis-Quiz",         en: "Comprehension quiz" },
];

/**
 * Per-step model overrides. AppConfig.stepModels is a JSON map
 * { "<step key>": "<model id>" }; a step not listed uses the default model.
 */
export function parseStepModels(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) if (typeof v === "string" && v) out[k] = v;
      return out;
    }
  } catch {
    /* corrupt column → no overrides */
  }
  return {};
}

/** The model for a Gemini step: per-step override, else the default model. */
export function modelForStep(json: string | null | undefined, step: string, defaultModel: string): string {
  return parseStepModels(json)[step] || defaultModel;
}
