import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { CopyButton } from "./copy-button";

type Params = Promise<{ id: string }>;

/**
 * Deduped item loader — generateMetadata and the page share ONE query.
 * Falls back to tutorPromptDocId for legacy items where that column
 * holds a Google Doc ID instead of the item's own ID (matches the
 * lookup in /api/tutor/[id]).
 */
const getItem = cache(async (id: string) => {
  const item = await prisma.sRSItem.findUnique({ where: { id } });
  if (item) return item;
  return prisma.sRSItem.findFirst({ where: { tutorPromptDocId: id } });
});

/**
 * UI language for this server-rendered, shareable page (MC-6) — the same
 * appConfig row the root layout reads for <html lang>.
 */
const getLanguage = cache(async () => {
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { language: true } });
    return config?.language ?? "german";
  } catch {
    return "german"; // no DB yet (fresh checkout / build-time prerender)
  }
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const [item, language] = await Promise.all([getItem(id), getLanguage()]);
  const de = language !== "english";
  if (!item) return { title: de ? "Nicht gefunden" : "Not found" };
  return {
    // IA-16: name the page after the student-facing library chip ("Tutor-Brief"),
    // not the developer-facing "Prompt / system prompt" framing.
    title: `${de ? "Tutor-Brief" : "Tutor brief"} – ${item.subjectMain}`,
    description: de
      ? `KI-Tutor-Brief für ${item.subjectMain} – ${item.subjectSub}`
      : `AI tutor brief for ${item.subjectMain} – ${item.subjectSub}`,
  };
}

export default async function TutorPage({ params }: { params: Params }) {
  const { id } = await params;
  const [item, language] = await Promise.all([getItem(id), getLanguage()]);
  if (!item || !item.tutorPromptContent) notFound();
  const de = language !== "english";

  return (
    <main className="min-h-screen bg-transparent">
      {/* Header bar */}
      <header className="sticky top-0 z-10 border-b border-(--hairline) bg-(--paper-0)/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <div className="brand-tile flex h-10 w-10 shrink-0 items-center justify-center">
            <span className="font-display italic font-semibold text-lg text-(--accent-on) -translate-y-px">S</span>
          </div>
          <div className="min-w-0 flex-1">
            {/* IA-16: matches the "Tutor-Brief" chip. CC-12: brand italic uses
                the accent-text token, not a hardcoded (low-contrast) amber-600. */}
            <h1 className="truncate font-display text-lg font-semibold text-ink-900">
              {de ? (
                <>Tutor<em className="font-display italic text-(--accent-text)">-Brief</em></>
              ) : (
                <>Tutor <em className="font-display italic text-(--accent-text)">brief</em></>
              )}
            </h1>
            <p className="truncate text-sm text-ink-600">
              {item.subjectMain} – {item.subjectSub}
            </p>
          </div>
          <Link
            href="/"
            className="group inline-flex items-center gap-2 rounded-lg border border-(--line-soft) bg-paper-2 px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-paper-2 hover:text-ink-900"
          >
            <ArrowLeftIcon className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.8} />
            {de ? "Zurück" : "Back"}
          </Link>
        </div>
      </header>

      {/* Content */}
      <article className="mx-auto max-w-3xl px-6 py-10">
        <div className="card-surface-elevated p-6 md:p-10">
          {/* Metadata badges */}
          <div className="mb-8 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-(--accent-border-soft) bg-(--accent-wash-soft) px-4 py-1.5 text-xs font-semibold text-(--accent-text-strong)">
              {item.subjectMain}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-(--line-soft) bg-paper-2 px-4 py-1.5 text-xs font-medium text-ink-600">
              {item.subjectSub}
            </span>
            {/* IA-16: neutral level badge — sage-green is contractually reserved
                for PASS verdicts, so it must not tint a positional "Level N" pill. */}
            <span className="badge-level inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold">
              Level {item.currentLevel + 1}
            </span>
          </div>

          {/* Prompt content */}
          <div className="max-w-none">
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-900/85">
              {item.tutorPromptContent}
            </div>
          </div>
        </div>

        {/* Copy button */}
        <div className="mt-8 flex justify-center">
          <CopyButton content={item.tutorPromptContent} language={language} />
        </div>

        {/* Footer info — no raw database id: nobody studying needs a CUID (MC-6). */}
        <p className="mt-10 text-center text-xs text-ink-400">
          {de ? "Erstellt am " : "Created on "}
          {item.createdAt.toLocaleDateString(de ? "de-DE" : "en-GB", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </article>
    </main>
  );
}
