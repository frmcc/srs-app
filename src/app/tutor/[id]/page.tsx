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
    <main className="min-h-screen bg-[#fafaf9]">
      {/* Header bar */}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white text-sm font-bold">
            🤖
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-stone-900">
              Tutor Prompt
            </h1>
            <p className="truncate text-sm text-stone-500">
              {item.subjectMain} – {item.subjectSub}
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 shadow-sm transition hover:bg-stone-50 hover:text-stone-900"
          >
            ← Zurück
          </Link>
        </div>
      </header>

      {/* Content */}
      <article className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
          {/* Metadata badges */}
          <div className="mb-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              📚 {item.subjectMain}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
              📖 {item.subjectSub}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              🎯 Level {item.currentLevel + 1}
            </span>
          </div>

          {/* Prompt content */}
          <div className="prose prose-stone max-w-none">
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-700">
              {item.tutorPromptContent}
            </div>
          </div>
        </div>

        {/* Copy button */}
        <div className="mt-6 flex justify-center">
          <CopyButton content={item.tutorPromptContent} />
        </div>

        {/* Footer info */}
        <p className="mt-8 text-center text-xs text-stone-400">
          Erstellt am {item.createdAt.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
          {" · "}ID: {item.id}
        </p>
      </article>
    </main>
  );
}
