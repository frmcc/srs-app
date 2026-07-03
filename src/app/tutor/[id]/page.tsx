import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
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

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) return { title: "Nicht gefunden" };
  return {
    title: `Tutor Prompt – ${item.subjectMain}`,
    description: `KI-Tutor Systemprompt für ${item.subjectMain} – ${item.subjectSub}`,
  };
}

export default async function TutorPage({ params }: { params: Params }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item || !item.tutorPromptContent) notFound();

  return (
    <main className="min-h-screen bg-transparent">
      {/* Header bar */}
      <header className="sticky top-0 z-10 border-b border-[rgba(33,27,18,0.08)] bg-[#0b0908]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm shadow-lg shadow-black/40"
            style={{
              background: "linear-gradient(135deg, #f5b14a 0%, #d97d06 100%)",
            }}
          >
            🤖
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-semibold text-ink-900">
              Tutor <em className="font-display italic text-amber-600">Prompt</em>
            </h1>
            <p className="truncate text-sm text-ink-600">
              {item.subjectMain} – {item.subjectSub}
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-[rgba(33,27,18,0.10)] bg-paper-2 px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-paper-2 hover:text-ink-900"
          >
            ← Zurück
          </Link>
        </div>
      </header>

      {/* Content */}
      <article className="mx-auto max-w-3xl px-6 py-10">
        <div className="card-surface-elevated p-6 md:p-10">
          {/* Metadata badges */}
          <div className="mb-8 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(239,159,31,0.22)] bg-[rgba(239,159,31,0.10)] px-4 py-1.5 text-xs font-semibold text-[#A15E03]">
              📚 {item.subjectMain}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(33,27,18,0.10)] bg-paper-2 px-4 py-1.5 text-xs font-medium text-ink-600">
              📖 {item.subjectSub}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(94,125,88,0.30)] bg-[rgba(94,125,88,0.14)] px-4 py-1.5 text-xs font-semibold text-[#4A6845]">
              🎯 Level {item.currentLevel + 1}
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
          <CopyButton content={item.tutorPromptContent} />
        </div>

        {/* Footer info */}
        <p className="mt-10 text-center text-xs text-ink-400">
          Erstellt am {item.createdAt.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
          {" · "}ID: {item.id}
        </p>
      </article>
    </main>
  );
}
