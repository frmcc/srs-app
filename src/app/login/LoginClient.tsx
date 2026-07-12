"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { motion, MotionConfig } from "framer-motion";
import { riseChild, staggerContainer, EASE_OUT, DUR } from "@/lib/motion";
import BrandLogo from "../components/BrandLogo";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";

/** Human-readable messages for NextAuth's ?error= codes (MC-5: bilingual). */
const ERROR_MESSAGES: Record<string, { de: string; en: string }> = {
  AccessDenied: {
    de: "Dieses Google-Konto ist für diesen privaten Lernbereich nicht freigeschaltet.",
    en: "This Google account isn't approved for this private study space.",
  },
  OAuthAccountNotLinked: {
    de: "Diese E-Mail ist bereits mit einer anderen Anmeldemethode verknüpft.",
    en: "This email is already linked to a different sign-in method.",
  },
  OAuthSignin: {
    de: "Die Anmeldung bei Google konnte nicht gestartet werden. Bitte erneut versuchen.",
    en: "Sign-in with Google couldn't be started. Please try again.",
  },
  OAuthCallback: {
    de: "Google hat die Anmeldung abgebrochen. Bitte erneut versuchen.",
    en: "Google cancelled the sign-in. Please try again.",
  },
  Configuration: {
    de: "Anmeldung derzeit nicht verfügbar. Bitte später erneut versuchen.",
    en: "Sign-in is currently unavailable. Please try again later.",
  },
  Default: {
    de: "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
    en: "Sign-in failed. Please try again.",
  },
};

/** Official multi-colour Google "G" mark. */
function GoogleMark() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

export default function LoginClient({ error, callbackUrl = "/" }: { error?: string; callbackUrl?: string }) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  // MC-5: pre-auth there is no stored AppConfig language, so infer it from the
  // browser with the app's German default. Applied after mount so the SSR
  // markup (German) always matches the first client render.
  const [de, setDe] = useState(true);

  useEffect(() => {
    if ((navigator.language || "").toLowerCase().startsWith("en")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser locale only exists after mount
      setDe(false);
    }
  }, []);

  const handleSignIn = () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    // NextAuth redirects the browser — the state only resets if it fails.
    signIn("google", { callbackUrl }).catch(() => setIsSigningIn(false));
  };

  const errorEntry = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default) : null;
  const errorMessage = errorEntry ? (de ? errorEntry.de : errorEntry.en) : null;

  return (
    <MotionConfig reducedMotion="user">
    <main className="min-h-[100dvh] flex flex-col bg-transparent relative overflow-x-clip">
      {/* ONE static lamp wash, top-left — no drifting orbs, no noise */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        aria-hidden="true"
        style={{ background: "radial-gradient(1000px 640px at 12% -8%, var(--a-lamp), transparent 62%)" }}
      />

      <div className="flex-1 flex items-center justify-center px-5 py-12 lg:px-16 relative z-10">
        <div className="w-full max-w-[1040px] grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 lg:gap-24 items-center">

          {/* Brand panel */}
          <motion.section
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="flex flex-col items-center lg:items-start text-center lg:text-left"
          >

            <motion.div variants={riseChild} className="flex items-center gap-3">
              <BrandLogo className="w-10 h-10 rounded-[11px]" />
              <h1 className="text-base font-bold tracking-[-0.01em] leading-none text-ink-900 font-sans">SRS <span className="font-display italic text-(--accent-text)" style={{ fontWeight: 560 }}>Master</span></h1>
            </motion.div>

            <motion.h2 variants={riseChild} className="font-display text-4xl sm:text-[54px] tracking-[-0.022em] text-ink-900 leading-[1.06] mt-11" style={{ fontWeight: 460 }}>
              {de ? <>Lerne weniger.<br />Behalte <em className="font-display italic text-(--accent-text)">mehr</em>.</>
                  : <>Study less.<br />Retain <em className="font-display italic text-(--accent-text)">more</em>.</>}
            </motion.h2>
            <motion.p variants={riseChild} className="text-ink-600 text-[15px] sm:text-base leading-[1.6] max-w-[440px] mt-5">
              {de
                ? "Lade deine Vorlesungsunterlagen hoch — die KI schreibt deine Quizze, brieft deinen Tutor, nimmt dein Audio auf und plant jede Wiederholung genau dann, wenn dein Gedächtnis sie braucht."
                : "Upload your lecture materials — the AI writes your quizzes, briefs your tutor, records your audio, and schedules every review exactly when your memory needs it."}
            </motion.p>

            <motion.ul variants={riseChild} className="flex flex-col gap-3.5 text-sm text-ink-900 mt-9">
              <li className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-(--a-g2) shrink-0"></span>
                {de ? "Quizze, generiert aus deinen eigenen Unterlagen" : "Quizzes generated from your own materials"}
              </li>
              <li className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-(--a-g2) shrink-0"></span>
                {de ? "Wiederholungen über Monate verteilt, mit Kalender-Sync" : "Reviews spread across months, with calendar sync"}
              </li>
              <li className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-(--a-g2) shrink-0"></span>
                {de ? "Tutor und Audio-Begleiter neben jedem Quiz" : "A tutor and audio companion beside every quiz"}
              </li>
            </motion.ul>
          </motion.section>

          {/* Auth card */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.gentle, ease: EASE_OUT, delay: 0.2 }}
            className="w-full max-w-[420px] mx-auto lg:mx-0 lg:justify-self-end"
          >
            {/* EL-18: card-glass pairs with --line-soft everywhere else (all
                in-app modals); LS-17: p-9 on both axes, not px-[34px]/py-9. */}
            <div className="card-glass p-9 border border-(--line-soft)">
              <p className="caps-label tracking-[0.13em]">{de ? "Willkommen zurück" : "Welcome back"}</p>
              <h3 className="font-display text-[26px] tracking-[-0.015em] text-ink-900 mt-2.5" style={{ fontWeight: 480 }}>
                {de ? "In dein Studienarchiv" : "Into your study archive"}
              </h3>
              <p className="text-sm text-ink-600 leading-[1.55] mt-2">
                {de
                  ? "Melde dich mit Google an, um deine Module, Quizze und deinen Zeitplan zu öffnen."
                  : "Sign in with Google to open your modules, quizzes, and schedule."}
              </p>

              {errorMessage && (
                <div className="mt-6 p-4 rounded-xl bg-(--grade-fail-wash) border border-(--grade-fail-border) text-(--grade-fail-text) text-[13px] flex items-start gap-2.5 leading-relaxed">
                  <ExclamationTriangleIcon className="w-[18px] h-[18px] shrink-0 mt-0.5 text-(--grade-fail-accent)" strokeWidth={1.6} />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="group relative w-full h-[50px] mt-[26px] bg-paper-1 hover:bg-(--paper-hover) text-ink-900 font-semibold rounded-[14px] px-5 flex items-center justify-center gap-[11px] text-sm cursor-pointer border border-(--line) shadow-(--shadow-e1) hover:-translate-y-px active:translate-y-0 active:scale-[0.99] disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
              >
                {/* Pre-rendered hover shadow, cross-faded via opacity — box-shadow itself
                    never animates (motion law, same recipe as .card-surface-elevated). */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-px rounded-[14px] shadow-(--shadow-lift) opacity-0 transition-opacity duration-200 ease-(--ease-cinematic) group-enabled:group-hover:opacity-100"
                />
                {isSigningIn ? (
                  <>
                    <ArrowPathIcon className="w-[19px] h-[19px] animate-spin text-ink-400" strokeWidth={1.6} />
                    {de ? "Verbinde mit Google…" : "Connecting to Google…"}
                  </>
                ) : (
                  <>
                    <GoogleMark />
                    {error === "AccessDenied"
                      ? (de ? "Mit anderem Konto versuchen" : "Try a different account")
                      : (de ? "Mit Google anmelden" : "Sign in with Google")}
                  </>
                )}
              </button>

              <div className="flex items-center gap-3 my-7">
                <div className="flex-1 h-px bg-(--hairline-card)"></div>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">{de ? "Privat" : "Private"}</span>
                <div className="flex-1 h-px bg-(--hairline-card)"></div>
              </div>

              <p className="text-xs text-ink-600 leading-relaxed flex items-start gap-2">
                <LockClosedIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-(--accent-text)" strokeWidth={1.7} />
                <span>
                  {de
                    ? "Privater Lernbereich — nur freigeschaltete Google-Konten können sich anmelden. Google bestätigt deine Identität, mehr nicht."
                    : "A private study space — only approved Google accounts can sign in. Google confirms your identity, nothing more."}
                </span>
              </p>
            </div>
          </motion.section>
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-ink-400 relative z-10">
        © {new Date().getFullYear()} SRS Master · {de ? "Für ernsthafte Studierende gebaut" : "Built for serious students"}
      </footer>
    </main>
    </MotionConfig>
  );
}
