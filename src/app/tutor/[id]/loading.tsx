/**
 * Overrides the root loading.tsx (dashboard-shaped, with sidebar) for the
 * tutor brief: this page is a sidebar-less max-w-3xl article under a sticky
 * header bar, so mirror ITS shell — static paper blocks, no shimmer.
 * The header stand-in reproduces the real bar's box exactly (border +
 * py-4 + the 48px title stack ≈ 81px tall), and the h-12 column pins the
 * row height, so nothing jumps when the real page streams in.
 */
export default function Loading() {
  return (
    <main className="min-h-screen" aria-busy="true">
      {/* Header bar stand-in — same box as the real sticky header */}
      <div className="border-b border-(--hairline)">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <div className="h-10 w-10 shrink-0 rounded-[10px] bg-paper-2" />
          <div className="flex h-12 min-w-0 flex-1 flex-col justify-center gap-1.5">
            <div className="h-4 w-40 max-w-full rounded bg-paper-2" />
            <div className="h-3 w-56 max-w-full rounded bg-paper-2" />
          </div>
          <div className="h-9 w-24 shrink-0 rounded-lg bg-paper-2" />
        </div>
      </div>

      {/* Article stand-in — the real content is one elevated card */}
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="card-surface-elevated p-6 md:p-10">
          <div className="h-8 w-64 max-w-full rounded-lg bg-paper-2" />
          <div className="space-y-3 mt-8">
            <div className="h-4 rounded bg-paper-2 w-full" />
            <div className="h-4 rounded bg-paper-2 w-11/12" />
            <div className="h-4 rounded bg-paper-2 w-4/5" />
          </div>
        </div>
      </div>
    </main>
  );
}
