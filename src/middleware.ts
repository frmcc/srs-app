import { NextRequest, NextResponse } from "next/server";

/**
 * Opt-in HTTP Basic Auth for the whole app (pages + API).
 *
 * Enable by setting BOTH env vars:
 *   BASIC_AUTH_USER=frank
 *   BASIC_AUTH_PASSWORD=<long random string>
 *
 * Left unset, the app behaves exactly as before (no auth) — so existing
 * iPhone Shortcuts keep working until you add the Authorization header
 * to them (Shortcuts → "Headers" → Authorization: Basic base64(user:pass)).
 */
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const [givenUser, ...rest] = atob(header.slice(6)).split(":");
      const givenPass = rest.join(":");
      if (timingSafeEqual(givenUser, user) && timingSafeEqual(givenPass, password)) {
        return NextResponse.next();
      }
    } catch {
      /* malformed base64 — fall through to 401 */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SRS", charset="UTF-8"' },
  });
}

/** Constant-time-ish comparison to avoid trivially leaking prefix matches. */
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const config = {
  // Everything except Next internals, static assets, and the PWA plumbing
  // (service worker + manifest must load before credentials are entered).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|icons/).*)"],
};
