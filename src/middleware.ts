import { NextRequest, NextResponse } from "next/server";

/**
 * App auth. Two credential mechanisms:
 *
 * 1. HTTP Basic Auth — protects the WHOLE app (pages + API):
 *      BASIC_AUTH_USER=frank
 *      BASIC_AUTH_PASSWORD=<long random string>
 *    Browsers prompt natively; iPhone Shortcuts add the Authorization header.
 *
 * 2. SHORTCUT_TOKEN — machine credential, accepted ANYWHERE as an alternative
 *    to Basic (so Shortcuts don't need user:pass baked in):
 *      SHORTCUT_TOKEN=<long random string>
 *    Sent as `x-shortcut-token: <token>` or `Authorization: Bearer <token>`.
 *
 * FAIL-CLOSED RULE (fixes H3 from CODE_REVIEW_2026-06-25):
 * Previously, deploying without BASIC_AUTH_* left every AI endpoint public —
 * anyone with the URL could burn Gemini/Drive/NotebookLM quota. Now, when
 * Basic Auth is NOT configured and NODE_ENV is production, all expensive or
 * mutating API endpoints are blocked unless a valid SHORTCUT_TOKEN is sent.
 * Pages and read-only GETs stay reachable (the app isn't bricked), but the
 * wallet is closed. Development behavior is unchanged.
 */

/** Endpoints that cost real money — never public in production. */
const EXPENSIVE_API = /^\/api\/(quiz|grade|podcast|transcribe|tts)(\/|$)/;

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  const shortcutToken = process.env.SHORTCUT_TOKEN;
  const basicConfigured = !!(user && password);

  // A valid shortcut token authenticates any request, in any mode.
  if (shortcutToken && hasValidToken(req, shortcutToken)) {
    return NextResponse.next();
  }

  if (basicConfigured) {
    // Basic Auth protects everything (previous behavior).
    const header = req.headers.get("authorization") || "";
    if (header.startsWith("Basic ")) {
      try {
        const [givenUser, ...rest] = atob(header.slice(6)).split(":");
        const givenPass = rest.join(":");
        if (timingSafeEqual(givenUser, user!) && timingSafeEqual(givenPass, password!)) {
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

  // ---- No Basic Auth configured --------------------------------------------
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isMutation = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  if (isApi && (EXPENSIVE_API.test(pathname) || isMutation)) {
    console.warn(`[auth] Blocked unauthenticated ${req.method} ${pathname} — configure BASIC_AUTH_USER/BASIC_AUTH_PASSWORD (and optionally SHORTCUT_TOKEN for Shortcuts).`);
    return NextResponse.json(
      { error: "Auth ist nicht konfiguriert — dieser Endpoint ist gesperrt. Setze BASIC_AUTH_USER/BASIC_AUTH_PASSWORD (Web) bzw. SHORTCUT_TOKEN (Shortcuts) in den Umgebungsvariablen." },
      { status: 503 }
    );
  }
  return NextResponse.next();
}

function hasValidToken(req: NextRequest, token: string): boolean {
  const headerToken = req.headers.get("x-shortcut-token") || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return (
    (headerToken.length > 0 && timingSafeEqual(headerToken, token)) ||
    (bearerToken.length > 0 && timingSafeEqual(bearerToken, token))
  );
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
