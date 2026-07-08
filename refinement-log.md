# Refinement log

Campaign plan (4 hourly rounds): R1 stats-filter + mobile actions + detail · R2 i18n/a11y/edges/theme · R3 flows/modals/cross-app drift · R4 deep audit + report. All rounds completed 2026-07-07 (entries below); later firings of the schedule verify state and only add clearly-shippable residuals.

## Round 1 — 2026-07-07 (automated)

### 1. Stats semester filter (both repos)
- `src/app/api/stats/route.ts`: ReviewLog select now also returns `subjectSub` + `itemId` (query-select change only; no schema/migration).
- `src/app/components/StatsPanel.tsx` (kept byte-identical in both repos):
  - New chip-row selector above the stat cards — "Alle Semester / All semesters" (default) + one chip per semester present in `items`. Hidden until a second semester exists (a one-option selector is clutter). Uses existing `chip` / `chip-amber` / `caps-label` tokens, `aria-pressed`, horizontal scroll on mobile.
  - Filtering covers everything the panel renders (streak, heatmap, 30d pass rate, per-module bars, 14-day forecast, level distribution).
  - Log→semester attribution (documented in code): `itemId` → item lookup first, fallback `subjectMain`+`subjectSub` match (first match wins), unattributable logs appear only under "All semesters".
  - "Reviews gesamt" card: all-time server total when unfiltered; with a semester selected it counts the filtered logs (365d window) and the sub-label switches to "letzte 12 Monate / last 12 months".
  - `StatsItemSlim` gained `id` + `subjectSub` (DashboardClient already passes full raw items).
  - Comprehension checks remain excluded — they never write ReviewLog, and the filter only re-slices existing logs/items.

### 2. Mobile delete visibility (both repos)
- `DashboardClient.tsx` library lecture-card delete button was `opacity-0 group-hover:opacity-100` → invisible on touch. Now `sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 sm:focus-visible:opacity-100`: always visible below `sm`, hover/focus-revealed on desktop. Only occurrence of the pattern in either repo; snooze and module-remove controls were already always visible (click-armed).

### 3. Detail pass (both repos)
- Library semester header: "1 Module · 1 Vorlesungen" → proper singular/plural in both languages (matches the plural handling used elsewhere).
- Date locale consistency: visible dates that used bare `toLocaleDateString()` (browser locale) now pass `de-DE`/`en-GB` like the rest of the file — library meta row (created/next review), comprehension timestamps (row + modal), review-history entries (date & time), video-archive entries, snooze toast.
- Interactive quiz hint: English UI said “say ‘nächste Aufgabe’” — the trigger regex accepts English (`next task/question/one`), so the English hint now says “say ‘next task’”.

### Checks
- `npx tsc --noEmit` and `npx eslint` on changed files: clean in both repos after every step. No commits made, per instructions.

### Open / notes for later rounds
- Due pills, comprehension %, and level dots on library rows are `hidden sm:*` — intentional (design 9a) but worth revisiting for a compact mobile signal.
- `/api/stats` "totals" remain unfiltered server-side; a per-semester all-time total would need itemId→semester resolution server-side (or shipping item semesters with totals). The 365d-window count + honest sub-label was chosen instead.
- Semester chips derive from active items; if an entire semester's items are ever deleted, its historical logs fold into "Alle Semester" only.

## Round 2 — 2026-07-07 (automated)

All changes in `DashboardClient.tsx`, mirrored 1:1 into both repos. StatsPanel needed nothing (still byte-identical between repos; token-clean).

### 1. i18n parity
- Settings → dictation-mode explainer: English branch still said “when you say ‘nächste Aufgabe’” — same bug class round 1 fixed in the in-quiz hint (TRIGGER_RE accepts `next task/question/one`). English text now says “next task”.
- Print-only quiz sheet: hardcoded `Datum:` / `Antwort:` now split per language (`Date:` / `Answer:`). `Name:` is identical in both languages and stays as-is. Print block keeps its raw zinc/white palette on purpose — print is always ink-on-white, independent of theme.

### 2. Accessibility & touch
- Mobile top-bar hamburger (the primary mobile nav control) was icon-only with no accessible name → added bilingual dynamic `aria-label` (Menü öffnen/schließen · Open/Close menu) + `aria-expanded`. Hit area was already 40px.
- Sidebar sign-out button: 28px → 36px hit area via `w-9 h-9 -m-1` (negative margin keeps the row layout; sidebar is also the mobile menu, so it is a touch target).
- Library search “clear” button: 24px → 40px (`w-10 h-10`, `right-3`→`right-1`) inside the h-12 input; overlays the input's existing `pr-10` zone.
- Verified (no change needed): global Escape handler covers every modal in both repos incl. saas credits modal; all modal close buttons are `Tip`-wrapped (Tip mirrors labels into aria-label); global `:focus-visible` outline in globals.css.

### 3. Edge cases
- Settings “Aktuelles Semester” card: German said “1 Module” for a single preset → “1 Modul”.
- Partial module-delete error toast: “1 von 1 Vorlesungen konnten …” → dedicated singular wording in both languages when the module has exactly one lecture.
- Verified (no change needed): empty states for due/upcoming/history/presets all exist with language splits; Ø knowledge rating hides until the first rated lecture; comprehension badge absent until first run (explainer tooltip covers first-run); long module names truncate, lecture titles wrap with full-name Tip.

### 4. Round-1 open item — mobile due signal (design 9a follow-up)
- Library module header due pill and lecture-row due badge were `hidden sm:*` → below `sm` they now collapse to a 7px amber dot (`bg-amber-500` = `--a-g2`, theme/accent-safe) with `sr-only` text (“N fällig / due”, “Fällig / Due”). Same conditions as the pills (collapsed & not editing / `isDue`). Comprehension % and level dots stay desktop-only — informational, not actionable.

### Checks
- `npx tsc --noEmit` + `npx eslint src/app/DashboardClient.tsx`: clean in both repos after every step (7 checkpoints). No commits. No schema/API/pipeline/SRS-logic touched. Mirror parity grep-verified per change.

### Open / notes for later rounds
- `/api/stats` per-semester all-time total still unresolved (round 1 note stands).
- Login screen (`LoginClient.tsx`) is German-only by design — no `language` context pre-login; revisit only if the SaaS twin ever needs an English login.
- StatsPanel.tsx contains a byte sequence that makes grep treat it as binary (use `grep -a`); harmless (tsc/eslint fine), but worth normalizing someday.
- Consider a `sm:hidden` compact signal for the comprehension % on lecture rows if users ask for it; skipped deliberately to keep mobile rows quiet.

## Round 3 — 2026-07-07 (automated)

All changes in `DashboardClient.tsx`, mirrored 1:1 into both repos unless marked saas-only. StatsPanel and the other shared components needed nothing (components dir still byte-identical between repos).

### 1. Upload / generate flow
- Drag-and-drop affordance: `onDragLeave` fired when the cursor moved onto the drop zone's own children, so the amber highlight flickered mid-drag → leaves into descendants are now ignored (relatedTarget containment check).
- Dropped files bypassed the picker's `accept` filter: any type (.pptx, .png, …) was silently queued and only failed server-side later. New shared intake `addUploadFiles` (drop + picker) keeps only .pdf/.docx/.xlsx/.csv/.txt (`UPLOAD_EXTENSIONS`, mirrors `accept`), dedupes by name on BOTH paths (the picker path previously didn't dedupe), and names rejected files in a bilingual error toast.
- Whitespace-only pasted text no longer counts as content: the generate button's disabled check and the `handleGenerate` guard use `.trim()`, and whitespace-only text is no longer appended to the FormData (payload otherwise unchanged).

### 2. Modals
- Backdrop click-to-close was missing on exactly two overlays (video archive, feedback history) while every other one had it → added, with `stopPropagation` on the panels. All overlays now behave alike (Esc ✓, ✕ ✓, backdrop ✓).
- Prompts-list modal had no height cap → `max-h-[80dvh]` flex column + scrollable body, matching the other modals on small screens.
- Semester danger-zone two-step confirms ("Start new semester" / "Reset to semester 1") never disarmed: the armed state survived closing and reopening settings — a destructive action one accidental click away, arbitrarily later. Now: new `closeSettingsModal` (used by Esc, backdrop and ✕) disarms on close, plus the same 4s auto-reset every other two-step confirm already had.

### 3. Keyboard shortcuts & quiz flow
- Escape now closes overlays in stacking order (prompt viewer z-90 → prompts list / comp-feedback z-80 → settings z-60 → the z-50 modals, incl. the saas credits modal); previously comp-feedback (z-80) was checked last.
- Escape with no modal open backs out of armed inline confirms (snooze pills, due-card delete, library module delete) instead of leaving them to their timeouts.
- ⌘K now closes any open overlay before jumping to the library search — previously the tab switched underneath and focus landed behind the still-open modal (saas: also closes the credits modal).
- Quiz-footer honesty: "Dein Entwurf ist auf diesem Gerät gespeichert" also showed during Verständnis-Checks, which are deliberately draft-free (round-2-verified behaviour; a reload does lose those answers). Comprehension mode now says drafts aren't saved — both quiz variants, both languages.

### 4. Cross-app drift (saas reconciled to app)
- Dashboard divider gradient: saas used a plain `transparent` end stop (can fade through gray depending on interpolation); now uses app's `color-mix(in srgb, var(--a-g2) 0%, transparent)`.
- Sidebar sign-out button indentation drift (from the round-2 hit-area edit) normalized.
- Full-file diff audited hunk by hunk: everything remaining is intentional divergence (credits/Stripe/checkout + 402 handling, NotebookLM allowlist gating, API-token settings vs Gemini-proxy settings, model selects single-user-only, Drive vs archive pipeline steps, calendar-token sourcing, `tutorPromptUrl`/`sourceMaterialUrl` vs `tutorPromptDocId`).

### Verified, no change needed
- Dashboard tab: snooze pills (tooltips, busy state, undo toast), skeletons, materials disclosure, right-rail pass-rate card, empty/all-clear states — already consistent with the library's round-1/2 polish.
- Verständnis-Check quiz view: header label, %-result screen, "Zurück zur Bibliothek" nav all correct; print export unaffected (parsedTasks only).

### Checks
- `npx tsc --noEmit` + `npx eslint src/app/DashboardClient.tsx` clean in both repos after every step (6 checkpoints; one eslint `set-state-in-effect` finding during work led to the cleaner `closeSettingsModal` design). No commits. No prisma commands, no schema/API-contract changes, comprehension raw-SQL columns untouched, SRS scheduling logic untouched.

### Open / notes for later rounds
- Rounds 1–2 open items stand (server-side per-semester all-time total; German-only login by design; StatsPanel grep-as-binary byte).
- "Demnächst/Upcoming" rows and due-card bodies are click-only (no tabIndex). Keyboard users can still do everything that matters (Enter starts the first due review; snooze/delete/materials are real buttons) — but starting a *specific* future review early is mouse-only. Whole-card focus needs a nested-interactive ARIA pass; deliberately deferred.
- "Show all N upcoming" has no collapse once expanded (resets on reload); harmless, revisit only if lists grow long.

## Round 4 — 2026-07-07 (automated deep-dive audit, final round)

Systematic hunt across both repos: comprehension invariant end-to-end, all API routes (auth/tenant scoping/status codes/NDJSON cleanup), client logic (stale state, stream races, drafts, date math), i18n/formatting, theme/responsive, dead code.

### Verified sound (no change needed)
- **Comprehension invariant holds end-to-end in both repos**: generation writes ONLY `comprehensionQuizText`, grading in comprehension mode writes ONLY score/passed/at/feedback — all five via raw SQL, early-return before any schedule/level/quiz-slot/ReviewLog/stats write. `comprehension: true` is sent only from Verständnis-Check mode; /api/quiz, /api/quiz/submit and /api/grade/shortcut have zero comprehension references, so the normal pipeline is untouched when the flag is absent.
- **saas credit gates**: /api/comprehension and /api/grade both run 401 (session) → 400 (key/body) → 402 (balance) → 404 (tenant-scoped ownership) before opening the stream; `assertCredits` re-checks between expensive stages; every saas route query is userId-scoped (where-clause or post-fetch check). /api/translate is deliberately unbilled (documented).
- All four NDJSON routes per repo close their controller in `finally`; the client reader buffers partial lines, flushes the decoder, cancels on terminal events; all three streaming fetches have abort timeouts cleared in `finally`.
- Optimistic deletes update `upcomingReviews` AND `rawItems`; 404s treated as already-deleted. Modal stack, Escape order, height caps all consistent (round-3 work held up).

### Fixed
1. **StatsPanel (both repos, still byte-identical): stale stat numbers for reduced-motion users** — `AnimatedNumber` froze its initial value in `useState`, so switching the round-1 semester filter never updated the four stat cards when `prefers-reduced-motion` was on. Now renders the live value directly (no setState-in-effect).
2. **StatsPanel: English date locale was `en-US`** while the entire rest of the app formats visible dates as `de-DE`/`en-GB` (round-1 convention) — heatmap/forecast tooltips showed M/D/YYYY. Now `en-GB`.
3. **Round-2 open item resolved — "grep treats file as binary"**: literal U+0000 NUL bytes were embedded in source as composite-key separators (StatsPanel ×2 both repos, saas quiz/submit idempotency-hash join ×1). Replaced with the `"\u0000"` escape — identical runtime string (hash/keys unchanged), files are plain text again.
4. **Dead code (both repos): `ReviewCard.dueDate`** — computed in `formatItems` (with a hardcoded English "Due Now" sentinel that would have been an i18n bug if ever rendered) but never read anywhere. Removed field + computation.
5. **German terminology drift (both repos)**: right-rail pass-rate card said "X von Y **Wiederholungen** bestanden" — "Wiederholung" means REPEAT/fail everywhere else (toasts, badges), and the stats vocabulary is "Reviews" ("Reviews gesamt", "Anzahl bewerteter Reviews"). Now "X von Y Reviews bestanden".
6. **StatsPanel polish**: redundant `de ? X : X` ternary in semester-chip aria-label collapsed; heatmap tooltip now lowercases "review/reviews" in English (German keeps the capitalized noun).
7. **srs-app comprehension feedback fallback aligned to its saas twin**: on a double marker miss (no summary AND no brief) the app stored/rendered raw `chefFeedback` including the machine-facing `===ASSESSMENT_DECISION===` block; saas already stripped it. Mirrored the strip (fallback path only; score extraction reads the head and is unaffected).
8. **saas push notification date**: `nextReviewDate.toLocaleDateString()` with no locale on a UTC server formats per host locale — pinned to `en-GB` (matches the notification's English text and the app's English date locale).

### Checks
`npx tsc --noEmit` + `npx eslint <changed files>` clean in BOTH repos after every fix (5 checkpoints). StatsPanel verified byte-identical between repos after edits; no NUL bytes remain in either src tree. No commits, no prisma commands, no schema/API-contract/billing changes.

### Found but deliberately NOT fixed (risky or needs the user)
- **Pipeline divergence — coverageLedger on REPEAT**: srs-app updates the ledger only on PASS; srs-saas updates it whenever the (remedial) next quiz emits a `COVERAGE_LEDGER` block, including REPEAT. Behavioral difference in grading persistence — needs a product decision on which is intended; changing either violates the "don't change pipeline behavior" constraint.
- **saas mid-stream credit exhaustion UX**: a 402 BEFORE the stream opens the top-up modal, but an `InsufficientCreditsError` mid-pipeline arrives as an NDJSON `error` event and only shows a toast (English-only server string). Wiring it to the credits modal means string-matching server messages or adding a structured error code (API-contract change).
- **srs-app sidebar "Live Tutor Pro — Demnächst/Coming soon" teaser** still locked while the Live Tutor toggle ships in the quiz header (saas has no teaser). Looks stale, but could be a deliberate upsell placeholder for a voice product — user call.
- **% formatting families**: comprehension values render "45 %" (space, DIN-style) everywhere; pass rates render "45%" (no space) everywhere. Each family is self-consistent; unifying is a typography decision.
- **`formatItems` computes `isDue` at fetch time** — a tab left open past midnight shows stale due-badges on dashboard cards until the next refetch (library rows compute at render). Fixing cleanly needs a midnight re-render tick; low value for the extra timer.
- **srs-app single-user routes accept arbitrary `language`/`modelName` body strings** (interpolated into prompts); saas allowlists both. Fine for a personal deployment, worth an allowlist if the app is ever exposed.
- Rounds 1–3 open items otherwise stand (server-side per-semester all-time total; German-only login; upcoming-row keyboard focus pass; "show all" collapse).

## Round 1 re-run — 2026-07-07T08:15:33+02:00 (automated; campaign already complete)

The hourly schedule re-fired after all four rounds finished. No re-work; verified the uncommitted campaign state, then fixed one residual wording bug found while re-walking the mandate.

### Changed (file → what/why)
- `src/app/DashboardClient.tsx` (both repos, mirrored 1:1): dashboard due/upcoming-card delete control said "Modul löschen / Delete module", toasted "Modul gelöscht. / Module deleted." and errored "Fehler beim Löschen des Moduls." — but `handleDeleteModule` deletes exactly ONE SRSItem (the card = one Vorlesung; `/api/reviews/{id}`), leaving the module's other lectures intact. Now "Vorlesung löschen / Delete lecture", "Vorlesung gelöscht. / Lecture deleted.", "Fehler beim Löschen der Vorlesung. / Failed to delete the lecture." (matches the library's existing single-lecture vocabulary). The library's whole-module path (`handleDeleteLibraryModule`) keeps its correct "Modul" wording. app lines ~1168/1176/2276; saas ~1320/1328/2501. Function name left as-is (rename = pure churn).

### Verified (exact checks run)
- `npx tsc --noEmit`: exit 0 in BOTH repos (before edits and at end).
- `npx eslint src`: exit 0 in BOTH repos (before edits and at end); `npx eslint src/app/DashboardClient.tsx` at each edit checkpoint.
- StatsPanel.tsx byte-identical between repos (`diff` clean); components dir otherwise identical.
- Semester filter present + wired in both repos (chips render, filter re-slices logs/items, comprehension untouched — filter only re-slices ReviewLog+items, comprehension never writes ReviewLog).
- Mobile actions: the single hover-gated affordance (due-card delete) carries the round-1 fix in both repos (`sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 sm:focus-visible:opacity-100`); all other `group-hover` uses are cosmetic tints on always-visible elements; no `invisible/hidden`-based hover gating anywhere (grep-verified).
- Edit-mode module remove (30px circular, always visible) and armed "N Vorlesungen löschen?" chip: `shrink-0` chip + truncating flex-1 name → fits 390px rows; meta hides in edit mode as designed.
- Full `git diff` re-read hunk-by-hunk (srs-app): matches the round 1–4 journal claims; saas edited regions re-read byte-exact after this run's edits.
- Round 4's grading-pipeline fallback diff re-reviewed: strips only the machine-facing decision block on the marker-miss path; score extraction unaffected.

### Handoff (for the next firing / Round 2 re-run)
1. Nothing pending from this run. Campaign open items in Round 4's "deliberately NOT fixed" list still stand — all need either a product decision (coverageLedger divergence, Live-Tutor teaser, % spacing) or an API-contract change (mid-stream 402 modal, per-semester all-time totals).
2. If a future run wants a real target: the upcoming-row keyboard-focus/ARIA pass (Round 3 note) is the largest remaining UX gap; needs a deliberate nested-interactive design, not a quick patch.

### Do-not-touch (why)
- `.fuse_hidden*` files in srs-app (root + src/app/components): filesystem artifacts of the mount, untracked; deleting user files is out of scope for this task.
- Everything in Round 4's "deliberately NOT fixed" list — reasons unchanged.
- No commits, per campaign instructions; working tree left clean at a checkpoint (tsc+eslint green in both repos).

## Round 3 re-run — 2026-07-07T10:05:41+02:00 (automated; campaign already complete)

Schedule re-fired for Round 3 after the campaign (R1–R4 + one R1 re-run) had finished. Per the campaign convention: verified the uncommitted state, re-walked the Round 3 mandate (flows/modals/cross-app), and fixed two clearly-shippable residuals of bug classes the campaign itself established. Both mirrored 1:1 into both repos.

### Changed (file → what/why)
- `src/app/DashboardClient.tsx` (both repos) — **whitespace-only module name could reach the server**: R3 fixed `textInput.trim()` in the generate guard + button `disabled`, but `!subjectInput` survived untrimmed in both places while the FormData already sends `subjectInput.trim()` — so a spaces-only subject enabled the button and posted an EMPTY `subjectMain`. Guard + `disabled` now use `!subjectInput.trim()` (app 1504/2655; saas 1658/2873). Same bug class as the R3 fix; payload building unchanged.
- `src/app/DashboardClient.tsx` (both repos) — **queued-upload file chip remove button** was icon-only with no accessible name and a ~16px hit area (the exact class R2 fixed on hamburger/sign-out/search-clear): now `Tip`-wrapped ("Datei entfernen / Remove file") with a filename-specific `aria-label` ("<name> entfernen / Remove <name>" — Tip only mirrors when no aria-label exists, verified in Tooltip.tsx) and a 28px circular hit area (`w-7 h-7`, `-mr-1.5` keeps the chip's visual width; chip is h-[30px] so no overflow). Also `key={idx}` → `key={file.name}` — stable and guaranteed unique since R3's `addUploadFiles` dedupes by name on both intake paths.

### Verified (exact checks run)
- Full `git diff` (srs-app, all 4 files) re-read hunk-by-hunk against the R1–R4 journal claims — everything accounted for, nothing questionable found.
- saas mirror integrity greps (closeSettingsModal ×7, UPLOAD_EXTENSIONS, addUploadFiles, Vorlesung gelöscht, draft-honesty strings ×2, relatedTarget, "Reviews bestanden", mobile-delete visibility classes, StatsPanel "letzte 12 Monate"); saas Escape order includes the credits modal between settings and calendar.
- Modal family: all 7 `fixed inset-0` overlays have backdrop-close + panel stopPropagation; all 7 panels height-capped (85/90/80dvh families with scrollable bodies).
- Upload flow: dragleave containment, intake dedupe/filter/toast, done-path (step 8 → success copy → fetchReviews → 3s → dashboard, inputs reset, subject reset to first preset — deliberate), error/disconnect/abort paths all present.
- ⌘Enter gated on `modalOpen`/tab/isGrading/gradingResult + non-empty answer; ⌘K closes every overlay first (saas: credits too).
- Bare-locale sweep: zero `toLocaleDateString()`/`toLocaleTimeString()`/`toLocaleTimeString([]` without locale in either src tree (one match is a comment).
- `npx tsc --noEmit` + `npx eslint src`: exit 0 in BOTH repos at baseline, after each of the two edits, and at end. New chip block diffed byte-identical across repos; StatsPanel still byte-identical; saas edited regions re-read after every edit.

### Handoff (for the next firing)
1. Nothing new pending. Round 4's "deliberately NOT fixed" list and the standing open items (per-semester all-time totals server-side, German-only login, upcoming-row keyboard/ARIA pass, "show all" collapse) are unchanged — all still need a product decision or an API-contract change.
2. Preset auto-fill edge (`if (!subjectInput) setSubjectInput(trimmed)`, app 4356/4369; saas 4581/4594): a spaces-only subject field blocks the auto-fill. Harmless (generate is now correctly blocked too) and arguably the user's in-progress typing — left alone deliberately; note it here so the next run doesn't re-litigate.

### Do-not-touch (why)
- Unchanged from the R1 re-run list (`.fuse_hidden*` artifacts, Round 4's deliberate non-fixes, no commits — tree left at a green checkpoint).

## Round 4 re-run — 2026-07-07T11:05:38+02:00 (final-audit re-fire; campaign closed)

Schedule re-fired for Round 4. Per convention: verified the uncommitted state, re-walked the deep-audit mandate with fresh sweep angles (number-locale formatting, draft isolation, stale id-Sets, index keys, unlabeled icon buttons, console/TODO leftovers), fixed two residuals of campaign-established bug classes, and delivered the Campaign summary the original R4 entry omitted.

### Findings & fixes (file → issue → fix)
1. `src/app/components/StatsPanel.tsx` (both repos, still byte-identical) — **German decimal point in per-module tooltip**: `Ø L${(mod.avgLevel + 1).toFixed(1)}` rendered "Ø L4.2" in the German UI (German decimal separator is a comma; same visible-format-locale class as R1's date pass and R4's en-US→en-GB fix; the only user-visible `toFixed` in either src tree). Now `.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })` → "Ø L4,2" (de) / "Ø L4.2" (en, unchanged).
2. `src/app/DashboardClient.tsx` (both repos, app ~4339 / saas ~4564) — **settings → module-preset remove button** was the last icon-only control with no accessible name and a ~16px hit area (the exact class R2 fixed on hamburger/sign-out/search-clear and the R3 re-run fixed on upload chips; audited all 11 `XMarkIcon` sites — every other one is Tip-wrapped or aria-labeled). Now: `Tip` "Voreinstellung entfernen / Remove preset" + preset-specific `aria-label` ("<name> entfernen / Remove <name>") + 32px circular hit area (`w-8 h-8 -mr-2` — icon keeps its visual position in the h-11 row; Tip mirrors only when no aria-label exists, per Tooltip.tsx).

### Verified (exact commands)
- Baseline AND final: `npx tsc --noEmit` + `npx eslint src` exit 0 in BOTH repos; `npx eslint <changed file>` + repo-wide tsc after each of the two fixes (2 checkpoints).
- `git status --porcelain` + `git diff --stat` (srs-app) match the journal (4 modified files + untracked log/.fuse_hidden×2); R3-re-run edits spot-checked present in both repos (`subjectInput.trim()` guard+disabled, chip Tip/aria/28px/`key={file.name}`).
- StatsPanel.tsx byte-identical between repos before AND after the edit (`diff` clean); components dir otherwise identical (`diff -rq`, fuse artifacts excluded); new preset-button block diffed byte-identical across repos; every saas edited region re-read after each edit.
- Fresh sweeps, clean: no bare `.toLocaleString(` in srs-app (saas credits already `de-DE`/`en-GB`); no other user-visible `.toFixed` (saas gemini-retry hits are server logs); draft autosave/restore hard-gated on `!comprehensionMode` (never reads/writes drafts in comprehension mode); Set-size reads (`anyLibraryOpen`, `okSet`, `libraryBySemester`, module counts) all derive from live data — stale expanded-ids are render-inert; remaining `key={i|idx}` uses are static/immutable lists (print lines, skeletons, video-archive snapshot, StatsPanel fixed windows) except presets (see below); zero `console.log`/`TODO`/`FIXME` in either src tree.

### Not fixed on purpose (ranked)
1. **Preset duplicates**: `savePresets([...modulePresets, trimmed])` doesn't dedupe, so duplicate preset names are possible → `key={idx}` kept on preset rows (name keys could collide; rows are stateless so idx is safe). A trim+case-insensitive dedupe on add would be a settings-write behavior change — small, but a product call.
2. Round 4's standing list is unchanged and still accurate: coverageLedger PASS/REPEAT divergence, saas mid-stream 402 → toast only, Live-Tutor-Pro teaser, "45 %" vs "45%" families, fetch-time `isDue` staleness past midnight, srs-app language/model allowlist, per-semester all-time totals, German-only login, upcoming-row keyboard/ARIA pass, "show all" collapse.

### Campaign summary (Rounds 1–4 + re-runs, 2026-07-07)
Stats gained a semester filter — chips above the cards that re-slice everything the panel shows (streak, heatmap, pass rate, module bars, forecast) with honest sub-labels where the window narrows, and its numbers now update for reduced-motion users too. Mobile reached parity: the one hover-gated delete became always-visible on touch, due-signals collapse to amber dots instead of vanishing, and every icon-only control (hamburger, sign-out, search-clear, upload chips, preset remove) now has a bilingual accessible name and a finger-sized hit target. Language and format polish: no German leaking into English UI, correct singular/plural in both languages, every visible date pinned to de-DE/en-GB (client, tooltips, saas push), terminology unified ("Reviews bestanden", "Vorlesung löschen" where one lecture dies), decimal separators localized. Flows hardened: drag-and-drop no longer flickers or swallows unsupported/duplicate files, whitespace-only text or module names can't reach the server, destructive two-step confirms disarm on close and auto-reset, Escape/⌘K walk the modal stack in order, quiz footers tell the truth about drafts in comprehension mode. The comprehension invariant was verified end-to-end in both repos — generation and grading write only their five raw-SQL columns and the normal pipeline is byte-identical without the flag — and saas credit gates (401→400→402→404) plus tenant scoping were confirmed on every route. Cross-app drift was reconciled hunk-by-hunk; what remains different is intentional (credits/Stripe, allowlists, Drive pipeline). Roughly 30 fixes shipped across 4 files; zero schema, API-contract, pipeline, or billing changes; tsc + eslint green in both repos at every checkpoint; nothing committed. The short list still open needs product decisions, not code — see "Not fixed on purpose" above.

### Handoff (for any future firing)
1. The campaign is closed and the report delivered. Future firings: verify state (tsc/eslint/byte-identity/diff-vs-journal), then only clearly-shippable residuals of established classes.
2. Largest remaining UX gap is still the upcoming-row keyboard/ARIA pass (R3 note); largest product question is the coverageLedger PASS/REPEAT divergence (R4 note).

### Do-not-touch (why)
- Unchanged (`.fuse_hidden*` mount artifacts, the "Not fixed on purpose" list, no commits — tree left at a green checkpoint: tsc 0 / eslint src 0 in both repos).
