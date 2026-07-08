/**
 * Application feature flags (personal app).
 *
 * Pure compile-time constants / helpers with no server-only imports, so they
 * can be read from both server code (API routes, the server page) and client
 * components.
 */

/**
 * Scribble answers — a handwriting canvas in the quiz answer boxes (Apple
 * Pencil / finger / mouse). The sketches travel to the grading pipeline as
 * inline images pinned under the task they belong to.
 *
 * GLOBAL KILL-SWITCH (kept `false`): image parts cost extra Gemini tokens on
 * every grading call, so the feature stays allowlist-only.
 *
 * PER-USER ALLOWLIST: `SCRIBBLE_ALLOWED_EMAILS` — comma-separated Google-login
 * emails. Ported from the SaaS; the personal app is already login-gated by
 * ALLOWED_LOGIN_EMAILS, so in practice this just scopes the feature to the
 * owner account(s) that are meant to have it.
 */
export const SCRIBBLE_ENABLED = false;

/** Pure check: global switch OR email on the scribble allowlist (case-insensitive).
 *  Separator-tolerant (`,`, `;`, `|`) so a deploy pipeline that rewrites
 *  delimiters can't silently break the allowlist. */
export function isScribbleAllowed(email: string | null | undefined, allowlistCsv: string | null | undefined): boolean {
  if (SCRIBBLE_ENABLED) return true;
  if (!email || !allowlistCsv) return false;
  const normalized = email.trim().toLowerCase();
  return allowlistCsv
    .split(/[,|;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

/**
 * Server-side convenience: reads SCRIBBLE_ALLOWED_EMAILS from the environment.
 * Safe to import in client bundles (env undefined there → global switch).
 */
export function scribbleEnabledForEmail(email: string | null | undefined): boolean {
  return isScribbleAllowed(email, process.env.SCRIBBLE_ALLOWED_EMAILS);
}
