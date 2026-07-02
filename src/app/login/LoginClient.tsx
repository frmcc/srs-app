"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { motion, MotionConfig } from "framer-motion";
import { riseChild, staggerContainer, EASE_OUT, DUR } from "@/lib/motion";
import {
  CpuChipIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";

/** Human-readable messages for NextAuth's ?error= codes. */
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Dieses Google-Konto ist für diesen privaten Lernbereich nicht freigeschaltet.",
  OAuthAccountNotLinked: "Diese E-Mail ist bereits mit einer anderen Anmeldemethode verknüpft.",
  OAuthSignin: "Die Anmeldung bei Google konnte nicht gestartet werden. Bitte erneut versuchen.",
  OAuthCallback: "Google hat die Anmeldung abgebrochen. Bitte erneut versuchen.",
  Configuration: "Anmeldung derzeit nicht verfügbar. Bitte später erneut versuchen.",
  Default: "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
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

  const handleSignIn = () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    // NextAuth redirects the browser — the state only resets if it fails.
    signIn("google", { callbackUrl }).catch(() => setIsSigningIn(false));
  };

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default) : null;

  return (
    <MotionConfig reducedMotion="user">
    <main className="min-h-[100dvh] flex flex-col bg-transparent relative overflow-x-clip">
      {/* Slowly drifting ambient orbs — fixed to viewport so nothing clips them */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        <div
          className="ambient-drift-slow absolute rounded-full"
          style={{
            width: "700px", height: "700px",
            background: "radial-gradient(circle, rgba(245,158,11,0.13) 0%, transparent 65%)",
            top: "-15%", left: "-10%",
          }}
        />
        <div
          className="ambient-drift-slower absolute rounded-full"
          style={{
            width: "420px", height: "420px",
            background: "radial-gradient(circle, rgba(253,211,141,0.07) 0%, transparent 65%)",
            bottom: "5%", right: "5%",
          }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-5 py-12 relative z-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">

          {/* Brand panel */}
          <motion.section
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="flex flex-col items-center lg:items-start text-center lg:text-left"
          >

            <motion.div variants={riseChild} className="flex items-center gap-3.5 mb-10">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_6px_20px_-6px_rgba(245,158,11,0.65)] ring-1 ring-amber-200/40">
                <CpuChipIcon className="text-stone-950 w-5 h-5" strokeWidth={2} />
              </div>
              <h1 className="font-display text-[22px] font-medium tracking-tight leading-none text-white">SRS<span className="text-gradient italic">Master</span></h1>
            </motion.div>

            <motion.p variants={riseChild} className="eyebrow mb-4">Spaced Repetition System</motion.p>
            <motion.h2 variants={riseChild} className="font-display text-3xl sm:text-[2.75rem] font-medium tracking-tight text-white leading-[1.08] mb-5">
              Lerne weniger.<br />
              Behalte <em className="text-gradient not-italic font-display italic">mehr</em>.
            </motion.h2>
            <motion.p variants={riseChild} className="text-white/45 text-sm sm:text-base leading-relaxed max-w-md mb-10">
              Lade deine Vorlesungsunterlagen hoch — die KI erstellt Quizze, Tutor-Prompts
              und Podcasts und plant deine Wiederholungen genau dann, wenn dein Gehirn sie braucht.
            </motion.p>

            <motion.ul variants={riseChild} className="space-y-3.5 text-sm text-white/55">
              <li className="flex items-center gap-3">
                <span className="ember-dot w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"></span>
                KI-generierte Quizze aus deinen eigenen Unterlagen
              </li>
              <li className="flex items-center gap-3">
                <span className="ember-dot w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"></span>
                Intelligente Wiederholungsplanung mit Kalender-Sync
              </li>
              <li className="flex items-center gap-3">
                <span className="ember-dot w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"></span>
                Audio-Podcasts &amp; KI-Tutor zu jedem Modul
              </li>
            </motion.ul>
          </motion.section>

          {/* Auth card */}
          <motion.section
            initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: DUR.slow, ease: EASE_OUT, delay: 0.35 }}
            className="w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end"
          >
            <div className="card-glass gradient-border p-8 md:p-10 border border-white/[0.1]">
              <p className="eyebrow mb-3">Willkommen zurück</p>
              <h3 className="font-display text-2xl font-medium tracking-tight text-white mb-2">
                In dein <em className="text-gradient not-italic font-display italic">Studienarchiv</em>
              </h3>
              <p className="text-sm text-white/45 leading-relaxed mb-8">
                Melde dich mit deinem Google-Konto an, um deine Module, Quizze und Wiederholungen zu öffnen.
              </p>

              {errorMessage && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/[0.07] border border-rose-400/20 text-rose-200 text-sm flex items-start gap-2.5 leading-relaxed">
                  <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5 text-rose-300" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="w-full bg-white hover:bg-amber-50 text-stone-900 font-medium rounded-xl py-3.5 px-5 flex items-center justify-center gap-3 text-sm transition-all cursor-pointer border border-white/80 shadow-[0_8px_24px_-8px_rgba(255,255,255,0.25)] hover:-translate-y-px hover:shadow-[0_12px_30px_-8px_rgba(255,255,255,0.3)] active:translate-y-0 disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
              >
                {isSigningIn ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin text-stone-500" />
                    Verbinde mit Google…
                  </>
                ) : (
                  <>
                    <GoogleMark />
                    Mit Google anmelden
                  </>
                )}
              </button>

              <div className="flex items-center gap-3 my-7">
                <div className="flex-1 h-px bg-white/[0.07]"></div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25">Sicher</span>
                <div className="flex-1 h-px bg-white/[0.07]"></div>
              </div>

              <p className="text-xs text-white/35 leading-relaxed flex items-start gap-2">
                <LockClosedIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300/70" />
                <span>
                  Privater Lernbereich — nur freigeschaltete Google-Konten können sich anmelden.
                  Google bestätigt deine Identität, mehr nicht.
                </span>
              </p>
            </div>
          </motion.section>
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-white/20 relative z-10">
        © {new Date().getFullYear()} SRS Master · Built for serious students
      </footer>
    </main>
    </MotionConfig>
  );
}
