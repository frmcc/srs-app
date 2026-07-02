import { NextResponse } from "next/server";

/**
 * RETIRED: the password login was replaced by Google sign-in (NextAuth).
 * Old PWA installs or bookmarks that still POST here get a clear pointer
 * instead of a silent failure.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Der Passwort-Login wurde durch die Google-Anmeldung ersetzt. Bitte öffne /login und melde dich mit Google an." },
    { status: 410 }
  );
}
