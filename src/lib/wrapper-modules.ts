/**
 * Per-module AI-Studio-wrapper toggles.
 *
 * AppConfig.wrapperModules is a JSON map `{ "<module name>": true }`. A module
 * toggled on routes its Gemini calls through the wrapper (proxy-first, with the
 * official API as fallback); a module that is absent or false uses the official
 * Gemini API. Replaces the old global 3-way wrapperMode.
 *
 * The native File API upload still runs on any official/fallback call (the
 * transport layer in gemini-retry always adapts inline bytes → native upload for
 * the "official" backend), so fallback works regardless of these toggles.
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

/** True when the wrapper is toggled ON for this module (by exact name). */
export function wrapperOnForModule(json: string | null | undefined, moduleName: string | null | undefined): boolean {
  if (!moduleName) return false;
  return parseWrapperModules(json)[moduleName.trim()] === true;
}
