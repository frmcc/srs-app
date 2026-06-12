import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "./copy-button";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const item = await prisma.sRSItem.findUnique({ where: { id } });
  if (!item) return { title: "Nicht gefunden" };
  return {
    title: `Tutor Prompt – ${item.subjectMain}`,
    description: `KI-Tutor Systemprompt für ${item.subjectMain} – ${item.subjectSub}`,
  };
}

export default async function TutorPage({ params }: { params: Params }) {
  const { id } = await params;
  const item = await prisma.sRSItem.findUnique({ where: { id } });
  if (!item || !item.tutorPromptContent) notFound();

  return (
    <main className="min-h-screen bg-transparent">
      {/* Header bar */}
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#0b0908]/80 backdrop-blur-xl">
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
            <h1 className="truncate font-display text-lg font-semibold text-white">
              Tutor <em className="text-gradient not-italic font-display italic">Prompt</em>
            </h1>
            <p className="truncate text-sm text-white/40">
              {item.subjectMain} – {item.subjectSub}
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/[0.08] hover:text-white"
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f5b14a]/20 bg-[#f5b14a]/10 px-4 py-1.5 text-xs font-semibold text-[#f5b14a]">
              📚 {item.subjectMain}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/60">
              📖 {item.subjectSub}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400">
              🎯 Level {item.currentLevel + 1}
            </span>
          </div>

          {/* Prompt content */}
          <div className="max-w-none">
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/75">
              {item.tutorPromptContent}
            </div>
          </div>
        </div>

        {/* Copy button */}
        <div className="mt-8 flex justify-center">
          <CopyButton content={item.tutorPromptContent} />
        </div>

        {/* Footer info */}
        <p className="mt-10 text-center text-xs text-white/25">
          Erstellt am {item.createdAt.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
          {" · "}ID: {item.id}
        </p>
      </article>
    </main>
  );
}
