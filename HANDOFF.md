# Design-polish campaign — continuation instructions (for any AI assistant)

You are continuing a design-perfection campaign for this app ("SRS Master", a bilingual
German/English spaced-repetition study PWA — Next.js 16, Tailwind 4, framer-motion).
A full 12-dimension design review already happened; you do NOT need to re-review anything.

## The single source of truth

**`DESIGN_REVIEW.md` (repo root).** It contains ~203 verified findings, each with:
ID (e.g. `MO-7`), priority (P0/P1/P2 in the Priority index tables), file location,
code evidence, impact, a concrete fix recommendation, and a **Status line**:

- `- Status: ⏳ open` → still to do
- `- Status: ✅ fixed (design-polish …)` → done, do not touch
- `- Status: ⏭ skipped — <reason>` → consciously skipped

**The status lines are the campaign state.** Before implementing anything, re-verify the
cited code — line numbers may have drifted; locate by the quoted evidence. If a previous
session died mid-batch, a finding may be marked open while partially edited (or vice
versa) — trust the code over the doc, and fix the doc.

**Starting after a dead session:** run `git status` first. Uncommitted modified files may
be half-edited by an interrupted agent. If `npx tsc --noEmit` fails or a diff looks
truncated, discard those uncommitted files (`git checkout -- <file>`) and re-implement
their still-open finding IDs from the doc. Everything committed is verified and safe.

## Working rules (non-negotiable)

1. Work on branch **`design-polish`**; merge/push to `main` only when a wave is verified
   (tsc + eslint clean). Small logical commits, message style: `design: <what> (<IDs>)`.
2. Read `AGENTS.md` first — this Next.js version has breaking changes; read the guides in
   `node_modules/next/dist/docs/` before Next-specific changes.
3. Respect the "Paper & Ember" design system (`src/app/globals.css` + `src/lib/motion.ts`):
   existing tokens only (ink-900/600/400/300, paper-0/1/2, shadow-e1/e2/e3, springs);
   motion law: only transform/opacity animate, no box-shadow interpolation, no
   layout-property transitions; accent appears ONLY on brand mark / primary action /
   due-now signals / pass moment; sage = pass, clay = fail, never re-hued by accent.
4. Bilingual: every user-facing string needs the `language === "german" ? … : …` branch
   used by neighboring code. German is du-form, warm, serious.
5. Implement in priority order: all P1 before P2. Batch by file (all findings in one file
   together); run `npx tsc --noEmit` + `npx eslint <files>` after each batch.
6. Update each handled finding's Status line in `DESIGN_REVIEW.md` in the same commit.
7. If a recommendation turns out wrong or too risky when you read the code: skip with a
   reason. Never half-fix.

## Dev setup for visual verification

- `.claude/launch.json` config `srs-dev` runs `env NEXTAUTH_SECRET= npm run dev` (port
  3000) — auth middleware fails open in dev when the secret is blank.
- `src/app/page.tsx` contains a marked `TEMP design-review bypass` (skips the session
  redirect only when NEXTAUTH_SECRET is empty AND not production). It is committed and
  inert in production. **At campaign end: revert it.**
- The app's DATABASE_URL points at the owner's real remote Turso DB — interact
  READ-ONLY (no quiz submissions, deletes, snoozes).
- Theme/accent switching for screenshots:
  `window.__srsAppearance.set({mode:'ink'|'paper', accent:'amber'|'slate'|'eucalyptus'|'heather'|'graphite'})`.
- Verify visual changes in BOTH themes and at mobile width (375px).

## End-of-campaign checklist

1. All P1 + P2 status lines resolved (fixed or skipped-with-reason).
2. Revert the TEMP bypass in `src/app/page.tsx`.
3. Final `npx tsc --noEmit` + `npx eslint src/app` + visual smoke test of all five tabs.
4. Merge `design-polish` → `main`, push.
