/**
 * Route-level loading shell — the dashboard page is force-dynamic (3 DB reads),
 * so without this a navigation shows only the browser spinner. Mirrors the app
 * shell geometry (sidebar rail + centered column) and the in-app skeleton idiom:
 * static paper blocks, no shimmer, so the handoff to the real page doesn't shift.
 */
export default function Loading() {
  return (
    <div className="md:flex flex-1 min-h-[100dvh]" aria-busy="true">
      {/* Mobile top-bar stand-in — mirrors the real fixed bar's spacer box
          (LS-4: same paddings + h-10 row) so the handoff doesn't shift on phones. */}
      <div className="md:hidden px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-(--hairline)">
        <div className="h-10" />
      </div>

      {/* Desktop sidebar rail — same width/padding as the real aside */}
      <aside className="hidden md:flex md:w-[264px] sidebar-gradient border-r border-(--hairline) flex-col px-[18px] pt-[max(26px,calc(env(safe-area-inset-top)+18px))]">
        <div className="flex items-center gap-[11px] px-2">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-paper-2" />
          <div className="h-3.5 w-24 rounded bg-paper-2" />
        </div>
        <div className="mt-[30px] space-y-2.5">
          <div className="h-9 rounded-xl bg-paper-2" />
          <div className="h-9 w-4/5 rounded-xl bg-paper-2" />
          <div className="h-9 w-3/5 rounded-xl bg-paper-2" />
        </div>
      </aside>

      {/* Main column — same gutters and measure as the dashboard */}
      <main className="block flex-1 px-4 md:px-8 lg:px-12 pt-8 md:pt-[46px]">
        <div className="max-w-5xl mx-auto">
          {/* Greeting block: eyebrow + display line + status sentence */}
          <div className="h-3 w-36 rounded bg-paper-2" />
          <div className="h-10 w-72 max-w-full rounded-lg bg-paper-2 mt-3" />
          <div className="h-4 w-96 max-w-full rounded bg-paper-2 mt-3" />

          {/* Due-list cards — matches the in-app hydration skeleton */}
          <div className="flex flex-col gap-2.5 mt-10">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-surface p-5 space-y-3">
                <div className="h-3 w-28 rounded bg-paper-2" />
                <div className="h-4 rounded bg-paper-2" style={{ width: `${58 + i * 10}%` }} />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
