import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * Google sign-in for the PERSONAL app — same look & flow as the SaaS, but
 * WITHOUT a database adapter: sessions live in a signed JWT cookie, so no
 * Account/Session tables (and no migration) are needed. The app stays
 * single-user; auth only answers "is this MY Google account?".
 *
 * Access control: only the emails in ALLOWED_LOGIN_EMAILS (comma-separated,
 * defaults to the owner's account) may sign in. Everyone else gets
 * NextAuth's AccessDenied error on the login screen.
 *
 * Env:
 * - AUTH_GOOGLE_CLIENT_ID / AUTH_GOOGLE_CLIENT_SECRET — the WEB OAuth client
 *   (shared with the SaaS). Falls back to GOOGLE_CLIENT_ID/SECRET, but those
 *   belong to the Drive integration and may be a Desktop-type client that
 *   cannot do browser redirects — prefer the AUTH_* pair.
 * - NEXTAUTH_SECRET / NEXTAUTH_URL — standard NextAuth configuration.
 */

const DEFAULT_ALLOWED = "frankmccarthy25@gmail.com";

function allowedEmails(): string[] {
  return (process.env.ALLOWED_LOGIN_EMAILS || DEFAULT_ALLOWED)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: {
    strategy: "jwt",
    // ~180 days — matches the old "log in once per device" cookie lifetime.
    maxAge: 60 * 60 * 24 * 180,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = (user.email || "").toLowerCase();
      if (allowedEmails().includes(email)) return true;
      console.warn(`[auth] Sign-in rejected for non-allowlisted account: ${email || "<no email>"}`);
      return false; // → ?error=AccessDenied on /login
    },
  },
};
