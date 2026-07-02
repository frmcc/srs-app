import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { calendarTokenFor } from "@/lib/auth-token";

/**
 * App auth — Google sign-in via NextAuth (same flow as the SaaS), plus the
 * machine credentials the personal app has always supported. Checked in order:
 *
 * 1. SHORTCUT_TOKEN — machine credential (iPhone Shortcuts, backend fetches):
 *      `x-shortcut-token: <token>` or `Authorization: Bearer <token>`.
 * 2. NextAuth session (JWT cookie) — THE way browsers authenticate now.
 *    Set by the Google login on /login; lives ~180 days per device.
 * 3. Calendar feeds only: GET /api/calendar* accepts `?token=<calendarToken>`
 *    (read-only derived token), because calendar clients can't log in.
 *    Still derived from BASIC_AUTH_USER/PASSWORD so EXISTING calendar
 *    subscriptions keep working — keep those two env vars set.
 *
 * The old password form + `srs_session` cookie are gone, and so is the
 * `WWW-Authenticate: Basic` challenge that made iPhones pop the ugly native
 * username/password dialog. Unauthenticated HTML navigations are redirected
 * to /login; API requests get a plain 401 JSON.
 *
 * FAIL-CLOSED RULE (H3): when NO auth is configured at all and NODE_ENV is
 * production, every expensive or mutating API endpoint is blocked so a public
 * deployment can't burn Gemini/Drive/NotebookLM quota. Dev stays open.
 */

/** Endpoints that cost real money — never public in production. */
const EXPENSIVE_API = /^\/api\/(quiz|grade|podcast|transcribe|tts|tutor\/chat)(\/|$)/;

export async function middleware(req: NextRequest) {
  const shortcutToken = process.env.SHORTCUT_TOKEN;
  const authConfigured = !!process.env.NEXTAUTH_SECRET;
  const { pathname, search } = req.nextUrl;

  // The login screen and NextAuth's own endpoints must stay reachable,
  // or nobody can ever log in.
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // 1) Machine token authenticates any request, in any mode.
  if (shortcutToken && hasValidToken(req, shortcutToken)) {
    return NextResponse.next();
  }

  if (authConfigured) {
    // 2) NextAuth session (Google login).
    const session = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (session) return NextResponse.next();

    // 3) Calendar feeds: read-only derived token in the URL (Apple/Google
    //    calendar clients can neither log in nor send custom headers).
    if (req.method === "GET" && pathname.startsWith("/api/calendar")) {
      const user = process.env.BASIC_AUTH_USER;
      const password = process.env.BASIC_AUTH_PASSWORD;
      const urlToken = req.nextUrl.searchParams.get("token") || "";
      if (urlToken && user && password) {
        const expected = await calendarTokenFor(user, password);
        if (timingSafeEqual(urlToken, expected)) return NextResponse.next();
      }
    }

    // Unauthenticated. Browsers navigating to a page → Google login screen.
    const wantsHtml = (req.headers.get("accept") || "").includes("text/html");
    if (wantsHtml && (req.method === "GET" || req.method === "HEAD") && !pathname.startsWith("/api/")) {
      const loginUrl = new URL("/login", req.url);
      const nextPath = pathname + search;
      if (nextPath && nextPath !== "/") loginUrl.searchParams.set("callbackUrl", nextPath);
      return NextResponse.redirect(loginUrl);
    }

    // APIs/tools → plain 401. Deliberately NO WWW-Authenticate header: the
    // Basic challenge is what made phones show the native password dialog.
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // ---- No auth configured ----------------------------------------------------
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  const isMutation = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  if (isApi && (EXPENSIVE_API.test(pathname) || isMutation)) {
    console.warn(`[auth] Blocked unauthenticated ${req.method} ${pathname} — configure NEXTAUTH_SECRET (+ AUTH_GOOGLE_CLIENT_ID/SECRET) and optionally SHORTCUT_TOKEN for Shortcuts.`);
    return NextResponse.json(
      { error: "Auth ist nicht konfiguriert — dieser Endpoint ist gesperrt. Setze NEXTAUTH_SECRET und AUTH_GOOGLE_CLIENT_ID/AUTH_GOOGLE_CLIENT_SECRET (Web) bzw. SHORTCUT_TOKEN (Shortcuts) in den Umgebungsvariablen." },
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
