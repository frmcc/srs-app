/**
 * Appearance (theme + accent) — client helpers.
 *
 * The real work happens in the inline <head> script in layout.tsx, which sets
 * `data-theme` / `data-accent` on <html> BEFORE first paint (no flash), keeps
 * "auto" in sync with the OS, and exposes `window.__srsAppearance`. These
 * typed wrappers are what React components (the Settings UI) talk to.
 * Per-device preference — stored in localStorage, like macOS appearance.
 */

export type AppearanceMode = "paper" | "ink" | "auto";
export type AppearanceAccent = "amber" | "slate" | "eucalyptus" | "heather" | "graphite";
export interface AppearancePref { mode: AppearanceMode; accent: AppearanceAccent }

export const APPEARANCE_ACCENTS: AppearanceAccent[] = ["amber", "slate", "eucalyptus", "heather", "graphite"];

interface AppearanceBridge {
  get: () => AppearancePref;
  set: (patch: Partial<AppearancePref>) => void;
  resolve: (mode: AppearanceMode) => "paper" | "ink";
}

declare global {
  interface Window { __srsAppearance?: AppearanceBridge }
}

export function getAppearance(): AppearancePref {
  if (typeof window !== "undefined" && window.__srsAppearance) return window.__srsAppearance.get();
  return { mode: "paper", accent: "amber" };
}

/** Persists + applies instantly (with the 400ms crossfade). */
export function setAppearance(patch: Partial<AppearancePref>): AppearancePref {
  if (typeof window !== "undefined" && window.__srsAppearance) window.__srsAppearance.set(patch);
  return getAppearance();
}
