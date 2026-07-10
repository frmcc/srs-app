import Link from "next/link";
import { prisma } from "@/lib/db";

/**
 * Branded 404 (EM-7) — the tutor-brief page is linked from the library and
 * from calendar ICS events, so stale links land here after an item is deleted.
 * Renders inside the root layout: paper ground, fonts and theme all apply.
 */
export default async function NotFound() {
  let language = "german";
  try {
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: { language: true },
    });
    if (config?.language) language = config.language;
  } catch {
    // No DB yet (fresh checkout / build-time prerender): keep the German default.
  }
  const de = language !== "english";

  return (
    <main className="flex-1 flex items-center justify-center px-5 py-16">
      <div className="card-surface-elevated w-full max-w-[440px] px-8 py-12 flex flex-col items-center text-center">
        <div className="brand-tile w-12 h-12 mb-7">
          <span className="font-display italic font-semibold text-xl text-(--accent-on) -translate-y-px">S</span>
        </div>
        <p className="caps-label mb-3">404</p>
        <h1 className="font-display text-[28px] tracking-[-0.015em] text-ink-900 leading-tight" style={{ fontWeight: 480 }}>
          {de ? "Diese Seite gibt es nicht mehr." : "This page no longer exists."}
        </h1>
        <p className="text-sm text-ink-600 leading-relaxed mt-3 max-w-[320px]">
          {de
            ? "Der Link ist veraltet oder das Modul wurde gelöscht. Deine Reviews warten im Dashboard."
            : "The link is stale or the module was deleted. Your reviews are waiting on the dashboard."}
        </p>
        <Link href="/" className="btn-primary inline-flex items-center justify-center h-11 px-6 mt-8 text-sm cursor-pointer">
          {de ? "Zurück zum Dashboard" : "Back to the dashboard"}
        </Link>
      </div>
    </main>
  );
}
