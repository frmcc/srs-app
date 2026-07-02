/**
 * Stateless auth tokens, derived from the Basic-Auth credentials via HMAC.
 * Web-Crypto only — this file is imported by the EDGE middleware, so no
 * Node `crypto` allowed. Changing the password invalidates every token.
 */

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Value of the `srs_session` cookie set by /api/login after a successful
 * password check. iOS PWAs (Home-Screen apps) never show the native Basic-Auth
 * dialog, so the app authenticates via this cookie instead.
 */
export function sessionTokenFor(user: string, password: string): Promise<string> {
  return hmacHex(`${user}:${password}`, "srs-session-v1");
}

/**
 * Read-only token accepted ONLY for the GET /api/calendar* feeds (as ?token=).
 * Calendar clients (Apple/Google) can't log in or send headers — this keeps
 * the ICS subscriptions working without exposing the full SHORTCUT_TOKEN in
 * calendar URLs.
 */
export function calendarTokenFor(user: string, password: string): Promise<string> {
  return hmacHex(`${user}:${password}`, "srs-calendar-v1");
}
