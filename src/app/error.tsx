"use client"; // Error boundaries must be Client Components

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./components/BrandLogo";

/**
 * Branded error boundary (EM-7) — a server crash no longer dead-ends on
 * Next's unstyled default screen. Renders inside the root layout, so the
 * paper ground, fonts and theme all apply.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // Pre-render there is no client language context here — infer from the
  // browser with the app's German default, like the login screen (MC-5).
  const [de, setDe] = useState(true);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if ((navigator.language || "").toLowerCase().startsWith("en")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser locale only exists after mount
      setDe(false);
    }
  }, []);

  return (
    <main className="flex-1 flex items-center justify-center px-5 py-16">
      <div className="card-surface-elevated w-full max-w-[440px] px-8 py-12 flex flex-col items-center text-center">
        <BrandLogo className="w-12 h-12 rounded-[13px] mb-7" />
        <p className="caps-label mb-3">{de ? "Fehler" : "Error"}</p>
        <h1 className="font-display text-[28px] tracking-[-0.015em] text-ink-900 leading-tight" style={{ fontWeight: 480 }}>
          {de ? "Da ist etwas schiefgelaufen." : "Something went wrong."}
        </h1>
        <p className="text-sm text-ink-600 leading-relaxed mt-3 max-w-[320px]">
          {de
            ? "Ein unerwarteter Fehler hat diese Seite unterbrochen — deine Daten sind sicher. Versuch es einfach noch einmal."
            : "An unexpected error interrupted this page — your data is safe. Just give it another try."}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <button
            onClick={() => unstable_retry()}
            className="btn-primary inline-flex items-center justify-center h-11 px-6 text-sm cursor-pointer"
          >
            {de ? "Erneut versuchen" : "Try again"}
          </button>
          <Link href="/" className="btn-secondary inline-flex items-center justify-center h-11 px-6 text-sm cursor-pointer">
            {de ? "Zurück zum Dashboard" : "Back to the dashboard"}
          </Link>
        </div>
      </div>
    </main>
  );
}
