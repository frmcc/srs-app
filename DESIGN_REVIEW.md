# Design Deep Dive — "Paper & Ember" perfection campaign

**Started:** 2026-07-09 · **Finalized:** 2026-07-10 ~12:00 CEST · **Owner:** Claude (multi-session campaign)
**Goal:** Jony-Ive-level design perfection across the entire SRS Master app.

## Campaign status

| Phase | Status |
|---|---|
| Live browser inspection (both themes, desktop + mobile, all tabs) | ✅ done |
| Agent review — all 12 dimensions | ✅ done |
| Adversarial verify pass — all 203 findings below survived | ✅ done 2026-07-10 |
| Implementation (branch `design-polish`) | 🔨 in progress — status per finding below |

**Verified totals:** 203 findings — **37 high (P0) · 97 medium (P1) · 69 low (P2)**, plus 11 live-inspection findings (overlaps noted).

## Session setup notes (for continuation sessions)

- Dev server: `.claude/launch.json` config **srs-dev** runs `env NEXTAUTH_SECRET= npm run dev` on port 3000 (middleware fails open in dev).
- **TEMP auth bypass** in `src/app/page.tsx` (marked `TEMP design-review bypass`). Inert in production. **Never commit it; revert before shipping.**
- DATABASE_URL is the real remote Turso DB — read-only in the app (no submits/deletes/snoozes).
- Appearance API for screenshots: `window.__srsAppearance.set({mode, accent})`.
- Implementation rules: branch `design-polish`, small logical commits, use existing tokens/motion primitives, respect accent discipline, de/en parity, `npx tsc --noEmit` + eslint clean per batch.

## Priority index

### P0 — 37 findings

| ID | Dimension | Finding | Where | Effort |
|---|---|---|---|---|
| TY-1 | typography | Passed-level stepper labels use non-existent token `text-ink-500` — renders full-strength ink-900 and inverts the hierarchy | `src/app/DashboardClient.tsx:3241` | small |
| TY-2 | typography | Type scale has fragmented into ~30 distinct sizes, including half-pixel steps and singletons that duplicate existing tokens | `src/app/DashboardClient.tsx:3644` | medium |
| CC-1 | color-contrast | Undo-toast action button is illegible in the ink theme (1.72:1) and with the graphite accent in paper (1.83:1) | `src/app/components/Toast.tsx:98` | small |
| CC-2 | color-contrast | The entire tertiary text tier (--ink-400) fails contrast on every paper surface: 2.27–2.65:1 for eyebrows, captions, and placeholders | `src/app/globals.css:468` | medium |
| CC-3 | color-contrast | Raw gradient stops used as text color: 21 `text-amber-500/600` call sites at 1.96–2.79:1 instead of the purpose-built --accent-text-strong | `src/app/DashboardClient.tsx:4732` | medium |
| CC-4 | color-contrast | Amber is the ONLY accent whose --accent-text fails AA (3.09–3.40:1) — the default accent has the worst link legibility of all five | `src/app/globals.css:105` | small |
| CC-5 | color-contrast | Accent discipline is broken: amber leaks into lock warnings, decorative button/header icons, the fail-flow CTA, a teaser card, and a competing selected-state language | `src/app/DashboardClient.tsx:4141` | medium |
| EL-1 | elevation-shadows | The signature hover-shadow cross-fade is silently clipped to invisibility on the app's primary card (due cards) and both grading-result cards | `src/app/DashboardClient.tsx:2299` | small |
| EL-2 | elevation-shadows | Login's Google button animates box-shadow directly on hover (transition-all + hover:shadow-lift), breaking the system's own no-interpolation rule | `src/app/login/LoginClient.tsx:126` | small |
| MO-1 | motion | Quiz column animates `padding` when the Tutor panel opens — layout-property animation the motion system explicitly forbids | `src/app/DashboardClient.tsx:3529` | small |
| MO-2 | motion | Mobile menu opens and closes with a raw display flip — the only fully unanimated surface in the app | `src/app/DashboardClient.tsx:2035` | medium |
| MO-3 | motion | Login CTA interpolates box-shadow on hover via `transition-all` — direct violation of the no-shadow-interpolation rule on the first thing a user ever touches | `src/app/login/LoginClient.tsx:126` | small |
| MO-4 | motion | Interactive-mode card highlight cross-fades ring + 48px shadow through `transition-all duration-300` | `src/app/DashboardClient.tsx:3867` | medium |
| IS-1 | interaction-states | Primary tap targets (due cards, upcoming rows, sidebar nav) have no press/active state despite the system mandating one and suppressing native tap highlight | `src/app/DashboardClient.tsx:2295` | small |
| IS-2 | interaction-states | Review-starting cards and rows are click-only <div>s — no button semantics, no keyboard access | `src/app/DashboardClient.tsx:2298` | medium |
| IS-3 | interaction-states | Delete-lecture button is invisible but still tappable on touch devices ≥640px (iPad) | `src/app/DashboardClient.tsx:2408` | small |
| IS-4 | interaction-states | Grading-model <select> has no visible keyboard focus state (globally suppressed, never restored) | `src/app/DashboardClient.tsx:3984` | small |
| LS-1 | layout-spacing | Tutor slide-over animates the quiz column via transition-[padding] — a layout animation that violates the app's own motion law | `src/app/DashboardClient.tsx:3529` | small |
| LS-2 | layout-spacing | The seven modals have no shared spatial contract: three height caps, three body paddings, two header paddings, and two of them dock to the bottom on phones while five stay centered | `src/app/DashboardClient.tsx:4952` | medium |
| LS-3 | layout-spacing | No card inner-padding scale — nine card types use eight different padding recipes, several hand-tuned to off-grid values | `src/app/DashboardClient.tsx:3867` | medium |
| AX-1 | a11y | All seven modals lack dialog semantics and any focus management (no role, no initial focus, no trap, no restore) | `src/app/DashboardClient.tsx:4433` | medium |
| AX-2 | a11y | Due cards and all 'Upcoming' rows are click-only divs — the app's core action is keyboard-inaccessible beyond the first item | `src/app/DashboardClient.tsx:2298` | small |
| AX-3 | a11y | html lang="en" while the app's default UI language (and the entire login page) is German | `src/app/layout.tsx:54` | small |
| AX-4 | a11y | Library edit-mode 'Remove module' controls are role="button" spans with no tabIndex or key handler — module deletion is impossible by keyboard, and they're nested inside another button | `src/app/DashboardClient.tsx:3069` | small |
| AX-5 | a11y | No live region anywhere: the grading verdict — the app's earned moment — is never announced to screen readers | `src/app/DashboardClient.tsx:3758` | small |
| EM-1 | empty-loading-error | Upload pipeline failure has no persistent error state — the 60s progress screen silently snaps back to the form | `src/app/DashboardClient.tsx:1657` | small |
| EM-2 | empty-loading-error | Leaving the quiz mid-grade orphans the result — and starting another quiz shows the OLD verdict under the NEW quiz's header | `src/app/DashboardClient.tsx:3752` | medium |
| EM-3 | empty-loading-error | Every voice-mode error message is hardcoded German — English users get untranslated failure toasts | `src/app/useInteractiveQuiz.ts:306` | small |
| MC-1 | microcopy-i18n | Voice-mode (Interactive) error messages are hardcoded German — English users get German error toasts | `src/app/useInteractiveQuiz.ts:306` | small |
| MT-1 | mobile-touch | Primary navigation lives behind a top-corner hamburger — no bottom tab bar on a phone-first PWA | `src/app/DashboardClient.tsx:2015` | medium |
| MT-2 | mobile-touch | Every core input is 13–14px — iOS auto-zooms on focus in the app's most-used interaction | `src/app/DashboardClient.tsx:3938` | small |
| MT-3 | mobile-touch | The mobile menu snaps open with a raw display toggle — zero motion, violating the app's own enter law | `src/app/DashboardClient.tsx:2035` | small |
| PP-1 | perceived-performance | Date-dependent SSR output (greeting, date eyebrow, due-sorting) hydrates differently on the client — first paint flashes and re-sorts | `src/app/DashboardClient.tsx:2162` | medium |
| PP-2 | perceived-performance | Tab switches never reset the desktop scroll container — startQuiz's window.scrollTo is a no-op on md+, so quizzes open scrolled to a random position | `src/app/DashboardClient.tsx:1526` | small |
| IA-1 | hierarchy-ia | Dashboard headline can state a factually wrong 'next review' date — and 'Review ahead' starts the wrong item — because the scheduled list is ordered alphabetically, not chronologically | `src/app/DashboardClient.tsx:2166` | small |
| IA-2 | hierarchy-ia | Overdue does not exist as a concept anywhere in the UI — a 3-week-old overdue review is labeled 'Due today' and buried alphabetically | `src/app/DashboardClient.tsx:2265` | medium |
| IA-3 | hierarchy-ia | Sidebar permanently advertises 'Live Tutor Pro — Coming soon' with a lock, while the Live Tutor is already shipped inside every quiz | `src/app/DashboardClient.tsx:2101` | small |

### P1 — 97 findings

| ID | Dimension | Finding | Where | Effort |
|---|---|---|---|---|
| TY-3 | typography | Modal titles drift across the peer modals: 20px/weight-500 vs 24px/weight-480 vs 16px display vs 15px sans-semibold | `src/app/DashboardClient.tsx:4118` | small |
| TY-4 | typography | Percent formatting is inconsistent: "82 %" (space) and "82%" (no space) coexist, and neither respects the active language's convention | `src/app/DashboardClient.tsx:3121` | small |
| TY-5 | typography | `<html lang="en">` is hardcoded while the default UI is German, and long German compounds break without hyphens | `src/app/layout.tsx:54` | medium |
| TY-6 | typography | Body text color drifts between the ink ramp and ad-hoc alpha inks (ink-900/80, /85) — two nearly-identical secondary grays coexist | `src/app/DashboardClient.tsx:405` | small |
| TY-7 | typography | Tabular-numeral coverage is incomplete and split across two mechanisms (.tnum vs Tailwind tabular-nums), against the system's own stated rule | `src/app/DashboardClient.tsx:4250` | small |
| TY-8 | typography | Micro caps badges drift across three sizes and two trackings: 9px vs 9.5px vs 10px, 0.12em vs 0.08em | `src/app/DashboardClient.tsx:2970` | small |
| TY-9 | typography | 8px chart labels in the stats heatmap sit below any legible floor of the scale | `src/app/components/StatsPanel.tsx:496` | small |
| CC-6 | color-contrast | --ink-300 (1.73–1.90:1 on paper) is used for real words and for idle icon buttons, not just decoration | `src/app/components/StatsPanel.tsx:542` | small |
| CC-7 | color-contrast | The 50–79% pass-rate band bar (--grade-mid #e0a43a) is nearly invisible: 1.87:1 against its track | `src/app/components/StatsPanel.tsx:563` | small |
| CC-8 | color-contrast | text-ink-500 references a token that doesn't exist — the 'passed' level-timeline labels silently render unstyled | `src/app/DashboardClient.tsx:3241` | small |
| CC-9 | color-contrast | Heatmap level 1 is indistinguishable from an empty day: 1.00:1 luminance against --chart-zero on paper | `src/app/components/StatsPanel.tsx:307` | small |
| EL-3 | elevation-shadows | Modal backdrop blur pops in after the fade instead of being 'static': backdrop-filter can't composite while its animated ancestor has opacity < 1 | `src/app/DashboardClient.tsx:4111` | medium |
| EL-4 | elevation-shadows | z-index inversion: the tutor chat panel (z-70) and the floating quiz control bar (z-60, body portal) both render above the settings modal and its scrim (z-60) | `src/app/DashboardClient.tsx:4437` | medium |
| EL-5 | elevation-shadows | Stats stat-cards hand-roll an e2 surface instead of using card-surface-elevated — and the loading skeleton renders the same grid at e1 with a different gap, so the page visibly shifts on load | `src/app/components/StatsPanel.tsx:461` | small |
| EL-6 | elevation-shadows | Active quiz-task card tweens box-shadow and ring via transition-all duration-300 as voice focus moves between cards | `src/app/DashboardClient.tsx:3867` | small |
| EL-7 | elevation-shadows | Hover affordance is baked into all card surfaces, so static cards (All-clear, grading progress, upload form, results, quiz answer cards, tutor brief, Stats charts) respond like buttons | `src/app/globals.css:406` | medium |
| EL-8 | elevation-shadows | ember-pulse — the app's one sanctioned ambient loop — animates box-shadow spread in a keyframe, violating the transform/opacity-only rule inside the token file itself | `src/app/globals.css:866` | small |
| EL-9 | elevation-shadows | Modal close buttons are five different components: radii, fills, and hover treatments drift per modal — two even have a no-op hover | `src/app/DashboardClient.tsx:4122` | small |
| EL-10 | elevation-shadows | Tutor page copy button ships the only cool-gray shadow in the product: Tailwind default shadow-sm instead of the warm e1 token | `src/app/tutor/[id]/copy-button.tsx:29` | small |
| EL-11 | elevation-shadows | Radius drift on the recurring icon-tile pattern (12/16/16/18px for the same squircle) and chart bar tops (5/6/8px within one Stats page) | `src/app/DashboardClient.tsx:2229` | small |
| EL-12 | elevation-shadows | Due card lacks the press state the system promises — whileHover without whileTap on the app's primary tap target; hoverLift preset exists but is never used | `src/app/DashboardClient.tsx:2295` | small |
| MO-5 | motion | The earned pass moment pops in raw — the result screen swaps in with zero entrance choreography | `src/app/DashboardClient.tsx:3758` | small |
| MO-6 | motion | Stats heatmap staggers 26 columns at 35ms with 500ms fades — ignores the system's 30ms/cap-~8 stagger rule | `src/app/components/StatsPanel.tsx:511` | small |
| MO-7 | motion | Floating voice-mode control bar has no exit animation — springs in, blinks out | `src/app/DashboardClient.tsx:3636` | small |
| MO-8 | motion | Scribble pad appears/disappears with no motion inside a card where every other disclosure uses the accordion | `src/app/DashboardClient.tsx:3942` | small |
| MO-9 | motion | Snooze pills and delete-confirm buttons animate in on springTactile but pop out on disarm | `src/app/DashboardClient.tsx:2315` | small |
| MO-10 | motion | Tutor slide-over closes with the entrance curve — EASE_OUT on exit instead of the system's close easing | `src/app/components/TutorPanel.tsx:297` | small |
| MO-11 | motion | Due cards — the app's primary tap target — hover-lift but have no press state | `src/app/DashboardClient.tsx:2295` | small |
| IS-5 | interaction-states | Module dropdown removes the native arrow and provides no replacement — a <select> disguised as a text field | `src/app/DashboardClient.tsx:2674` | small |
| IS-6 | interaction-states | File picker is unreachable by keyboard: display:none input + label styled as a button | `src/app/DashboardClient.tsx:2742` | small |
| IS-7 | interaction-states | Server-backed segmented controls (language, AI connection, PDF delivery) show no feedback until the round-trip completes | `src/app/DashboardClient.tsx:4646` | small |
| IS-8 | interaction-states | Comprehension-check chip morphs into a spinner + live streaming text — the button resizes continuously while loading | `src/app/DashboardClient.tsx:3283` | small |
| IS-9 | interaction-states | Edit-mode module delete is a role="button" span nested inside the module-header <button> — invalid and keyboard-dead | `src/app/DashboardClient.tsx:3068` | medium |
| IS-10 | interaction-states | One Escape press closes two layers when the Tutor panel is open behind a modal | `src/app/components/TutorPanel.tsx:127` | small |
| IS-11 | interaction-states | Multiple touch targets far below 44px: toast dismiss ~20px, tutor TTS 24px, file-chip remove 28px, snooze pills 28px | `src/app/components/Toast.tsx:73` | small |
| IS-12 | interaction-states | Push-notification toggle: switch visual without switch semantics, and no busy state through a multi-second async flow | `src/app/DashboardClient.tsx:2074` | small |
| IS-13 | interaction-states | Toggle/segmented buttons lack aria-pressed — inconsistently, since StatsPanel's own filter chips set it | `src/app/DashboardClient.tsx:4663` | small |
| IS-14 | interaction-states | Modal close buttons: four different treatments, three with dead hover (`bg-paper-2 hover:bg-paper-2`) | `src/app/DashboardClient.tsx:4122` | small |
| LS-4 | layout-spacing | Mobile top bar, its flow spacer, and the hardcoded 61px sidebar offset are three disagreeing heights | `src/app/DashboardClient.tsx:2026` | small |
| LS-5 | layout-spacing | Success/error toasts ignore the safe area while the undo stack ten lines away handles it — toasts sit behind the iPhone home indicator | `src/app/components/Toast.tsx:49` | small |
| LS-6 | layout-spacing | Five tabs, four content max-widths (980 / 768 / 1024 / 896 / 1024) — the identical header block jumps horizontally on every tab switch | `src/app/DashboardClient.tsx:2152` | small |
| LS-7 | layout-spacing | Stats skeleton claims to 'mirror the final layout, so nothing jumps' but uses different gaps than the loaded state — the page visibly shifts on load | `src/app/components/StatsPanel.tsx:322` | small |
| LS-8 | layout-spacing | Activity heatmap scroller opens at the oldest week — on phones 'today' is off-screen with no auto-scroll and no edge fade | `src/app/components/StatsPanel.tsx:493` | small |
| LS-9 | layout-spacing | Arming snooze swaps a 32px icon for a ~150px pill group inside the card's title row — the lecture title and level pill lurch on every arm/disarm | `src/app/DashboardClient.tsx:2314` | small |
| AX-6 | a11y | Selected state is visual-only across nav tabs, all segmented controls, and the theme/accent pickers | `src/app/DashboardClient.tsx:4662` | small |
| AX-7 | a11y | Keyboard focus is invisible on the grading-model selects: global CSS strips select outlines but .btn-secondary defines no replacement | `src/app/globals.css:358` | small |
| AX-8 | a11y | ink-400 (2.65:1) and ink-300 (1.9:1) are used for meaningful text throughout — far below AA contrast | `src/app/globals.css:76` | medium |
| AX-9 | a11y | Stats heatmap and chart data live only in hover tooltips on non-focusable divs (and Tip puts aria-label on generic divs, which ARIA ignores) | `src/app/components/StatsPanel.tsx:516` | medium |
| AX-10 | a11y | TutorPanel slide-over: focus never enters it, streamed replies are silent, and the composer has placeholder-only labeling | `src/app/components/TutorPanel.tsx:333` | medium |
| AX-11 | a11y | Upload and quiz form fields have visual labels that aren't programmatically associated | `src/app/DashboardClient.tsx:2667` | small |
| AX-12 | a11y | Toast close buttons are hardcoded aria-label="Close" in a bilingual app, and toasts auto-dismiss on a fixed 5s timer with no pause | `src/app/components/Toast.tsx:74` | small |
| AX-13 | a11y | Two-step confirms (snooze, delete) destroy keyboard focus when they arm, then time out after 4–5s | `src/app/DashboardClient.tsx:2314` | medium |
| EM-4 | empty-loading-error | Error toasts auto-dismiss after a fixed 5s with no hover-pause — long server errors are unreadable | `src/app/components/Toast.tsx:37` | small |
| EM-5 | empty-loading-error | Sidebar 'Semester N' eyebrow flashes 'Semester 1' on every load — violating the app's own no-flash first-paint rule | `src/app/DashboardClient.tsx:2044` | small |
| EM-6 | empty-loading-error | Stats error state is a dead end — no retry affordance, unlike the Library's matching error state | `src/app/components/StatsPanel.tsx:349` | small |
| EM-7 | empty-loading-error | No branded 404 or error boundary — tutor-brief links can dead-end on Next's default unstyled pages | `src/app/tutor/[id]/page.tsx:35` | small |
| EM-8 | empty-loading-error | Installable PWA with zero offline handling — service worker has no fetch handler or fallback page | `public/sw.js:1` | medium |
| EM-9 | empty-loading-error | Tutor 'Read aloud' fails silently — spinner disappears and nothing happens | `src/app/components/TutorPanel.tsx:169` | small |
| EM-10 | empty-loading-error | Tutor connection errors masquerade as tutor speech — with a raw ⚠️ emoji, persisted into chat history | `src/app/components/TutorPanel.tsx:236` | small |
| EM-11 | empty-loading-error | Stats tab forgets everything between visits — skeleton flash and count-up-from-zero replay on every tab switch | `src/app/components/StatsPanel.tsx:108` | medium |
| MC-2 | microcopy-i18n | Review-history verdict badges show raw English 'PASS'/'REPEAT' while every sibling badge is localized | `src/app/DashboardClient.tsx:4244` | small |
| MC-3 | microcopy-i18n | Stream-error fallback 'Unbekannter Fehler' is always German, producing mixed-language toasts in English mode | `src/app/DashboardClient.tsx:1658` | small |
| MC-4 | microcopy-i18n | German interval names ('Tag 7') leak into English tooltips via LIB_LEVEL_FULL | `src/app/DashboardClient.tsx:3139` | small |
| MC-5 | microcopy-i18n | Login screen is entirely German (including all auth error messages) yet ends on an English tagline | `src/app/login/LoginClient.tsx:15` | medium |
| MC-6 | microcopy-i18n | Tutor-brief page is German-only and exposes the raw database ID in user-facing copy | `src/app/tutor/[id]/page.tsx:92` | medium |
| MC-7 | microcopy-i18n | Grading-failure guidance tells a student to check 'the database, Gemini API key, or server logs'; push setup can toast 'VAPID key not configured.' | `src/app/DashboardClient.tsx:3690` | small |
| MC-8 | microcopy-i18n | Mastery items show the impossible 'Level 8 von 7' on due cards | `src/app/DashboardClient.tsx:2312` | small |
| MC-9 | microcopy-i18n | German 'Demnächst' labels two different concepts visible on the same screen (Upcoming reviews vs Coming-soon feature) | `src/app/DashboardClient.tsx:2503` | small |
| MC-10 | microcopy-i18n | German terminology drift: 'Wiederholungen' and Denglish 'Reviews' name the same thing, even within one screen | `src/app/DashboardClient.tsx:2575` | small |
| MC-11 | microcopy-i18n | The examiner's brief has two German names: 'Gutachter-Brief' on the result screen, 'Feedback & Auswertung' in the modal | `src/app/DashboardClient.tsx:4188` | small |
| MC-12 | microcopy-i18n | Upload page eyebrow says 'Neues Modul' but the flow creates a lecture — a confusion the codebase itself documents | `src/app/DashboardClient.tsx:2602` | small |
| MC-13 | microcopy-i18n | 'AI connection' settings copy misuses the app's core term 'Module' and the EN lock message says 'generation' while grading | `src/app/DashboardClient.tsx:4728` | small |
| MT-4 | mobile-touch | Data-bearing tooltips are mouse-only — the stats heatmap and charts go mute on touch | `src/app/components/Tooltip.tsx:65` | medium |
| MT-5 | mobile-touch | Tapping a due card — the app's most important touch action — gives zero press feedback | `src/app/DashboardClient.tsx:2295` | small |
| MT-6 | mobile-touch | Success/error toasts ignore the home-indicator safe area — the undo bar in the same file gets it right | `src/app/components/Toast.tsx:49` | small |
| MT-7 | mobile-touch | `sm:` breakpoint used as a hover proxy — iPad loses the delete affordance entirely | `src/app/DashboardClient.tsx:2408` | small |
| MT-8 | mobile-touch | Hands-free interactive mode never requests a screen wake lock — the phone sleeps mid-quiz | `src/app/useInteractiveQuiz.ts:118` | small |
| MT-9 | mobile-touch | The installed PWA has no offline story — sw.js handles push only, offline launch shows a browser error page | `public/sw.js:1` | medium |
| MT-10 | mobile-touch | No history integration — the system back gesture exits the app from inside a quiz or modal | `src/app/DashboardClient.tsx:1549` | medium |
| MT-11 | mobile-touch | Tutor chat on iPhone: fixed full-height panel with no keyboard handling and no scroll containment | `src/app/components/TutorPanel.tsx:333` | medium |
| MT-12 | mobile-touch | Touch-target sweep: a family of recurring controls sits well under 44px | `src/app/globals.css:594` | small |
| PP-3 | perceived-performance | Sidebar flashes "SEMESTER 1", wrong 'Active' badge, and empty module presets on every load — the server already has this data but doesn't pass it | `src/app/DashboardClient.tsx:562` | small |
| PP-4 | perceived-performance | Stats tab replays its entire loading choreography on every visit — skeleton, 1.1s count-up, ~1.1s heatmap stagger, zero caching | `src/app/components/StatsPanel.tsx:112` | medium |
| PP-5 | perceived-performance | Every keystroke re-renders the whole 5,000-line component — library search and quiz answer state are colocated with the entire app | `src/app/DashboardClient.tsx:769` | large |
| PP-6 | perceived-performance | Frozen 30-day pass-rate card — the right-rail number never updates after grading | `src/app/DashboardClient.tsx:638` | medium |
| PP-7 | perceived-performance | Fraunces loads with default display:swap — the 44–54px serif hero visibly morphs on cold loads | `src/app/layout.tsx:6` | small |
| PP-8 | perceived-performance | Service worker provides zero load-time benefit — the installed PWA has no offline shell and every cold home-screen launch is full-network | `public/sw.js:1` | medium |
| IA-4 | hierarchy-ia | The dashboard's 30-day pass-rate card is a frozen SSR snapshot — it silently disagrees with the Stats tab within the same session | `src/app/DashboardClient.tsx:638` | small |
| IA-5 | hierarchy-ia | Raw Gemini model pickers sit at equal weight beside the two most important buttons in the app (Generate and Submit) | `src/app/DashboardClient.tsx:3981` | small |
| IA-6 | hierarchy-ia | Nothing at the submit moment tells the student how many tasks they've actually answered | `src/app/DashboardClient.tsx:3993` | small |
| IA-7 | hierarchy-ia | The quiz view is placeless: full app chrome persists but no nav item is active, so the app's focused mode is neither focused nor located | `src/app/DashboardClient.tsx:3522` | medium |
| IA-8 | hierarchy-ia | Upload success auto-yanks the user to the dashboard after 3 seconds, breaking the batch-upload flow the screen is built for | `src/app/DashboardClient.tsx:1655` | small |
| IA-9 | hierarchy-ia | Library lecture rows encode the same level twice, side by side (7-dot strip AND 'L4' label), inflating an already signal-dense row | `src/app/DashboardClient.tsx:3152` | small |
| IA-10 | hierarchy-ia | Stats' 'Pass rate by module' is sorted by review volume and silently truncated to 8 — the chart cannot answer the question its title asks | `src/app/components/StatsPanel.tsx:273` | small |
| IA-11 | hierarchy-ia | Past videos (Video-Archiv) are only reachable from a due card's footer — once the item isn't due, the archive vanishes from the entire app | `src/app/DashboardClient.tsx:3390` | small |
| IA-12 | hierarchy-ia | Push notifications live as a toggle in the nav list and are absent from Settings — the one place its scope line promises to cover the app's preferences | `src/app/DashboardClient.tsx:2074` | small |
| IA-13 | hierarchy-ia | Settings modal mixes developer infrastructure ('AI connection' proxy modes, 'Proxy: PDF delivery' base64-vs-File-API) at equal hierarchy with Language — 8 flat sections strain the modal format | `src/app/DashboardClient.tsx:4724` | medium |

### P2 — 69 findings

| ID | Dimension | Finding | Where | Effort |
|---|---|---|---|---|
| TY-10 | typography | `.eyebrow` and `.caps-label` are duplicate tokens, and the caps treatment's tracking drifts per call site (0.10–0.14em) | `src/app/globals.css:462` | small |
| TY-11 | typography | Section-header semantics and sizes disagree across tabs and modals (h2 16px vs h4 14px for the same role; modal titles h2 vs h3) | `src/app/DashboardClient.tsx:2265` | small |
| TY-12 | typography | Orphan font-weight 570 on the 'Upcoming' row title — a one-off between the system's 550 and 600 | `src/app/DashboardClient.tsx:2523` | small |
| TY-13 | typography | Raw three-dot "..." in upload placeholder while the rest of the app uses the true ellipsis character | `src/app/DashboardClient.tsx:2771` | small |
| TY-14 | typography | Dashboard h1 is 44px while every other tab's h1 is 40px at the same breakpoint | `src/app/DashboardClient.tsx:2175` | small |
| TY-15 | typography | Print export abandons the brand typography and tokens entirely (Inter bold + raw zinc palette) | `src/app/DashboardClient.tsx:1957` | small |
| CC-10 | color-contrast | body's Tailwind selection classes silently override the design-system ::selection token (20% vs the specified 30%) | `src/app/layout.tsx:118` | small |
| CC-11 | color-contrast | ScribbleCanvas draws in Tailwind stone-900 (#1c1917), not the app's ink, and paints a max-glare #ffffff pad in the dark theme | `src/app/components/ScribbleCanvas.tsx:27` | small |
| CC-12 | color-contrast | Tutor brief page drifts from the system: brand italic in text-amber-600 and a default gray Tailwind shadow-sm on the copy button | `src/app/tutor/[id]/page.tsx:47` | small |
| EL-13 | elevation-shadows | Undo toast duplicates the tooltip's hardcoded shadow literal; neither is tokenized nor theme-tuned like every other shadow | `src/app/components/Toast.tsx:92` | small |
| EL-14 | elevation-shadows | Accent swatches animate their selection ring as raw box-shadow (250ms inline transition) | `src/app/DashboardClient.tsx:4546` | small |
| EL-15 | elevation-shadows | Library level-progress dots tween their glow/ring shadows through transition-all | `src/app/DashboardClient.tsx:3141` | small |
| EL-16 | elevation-shadows | Theme preview cards: 1.5px border on an e1 surface, hover-lift with no shadow response, and inner preview radius breaks the nesting rule | `src/app/DashboardClient.tsx:4486` | small |
| EL-17 | elevation-shadows | Floating interactive control bar composes its overlay surface ad hoc: inline e3 style, 18px radius plus hairline — matching neither card-glass nor the toast recipe | `src/app/DashboardClient.tsx:3641` | small |
| EL-18 | elevation-shadows | Login is the only card-glass paired with --hairline-card; all seven in-app modals use --line-soft | `src/app/login/LoginClient.tsx:107` | small |
| MO-12 | motion | Quiz task cards enter with a 20px rise stacked on the page's 8px rise — the largest and least systematic offset in the app | `src/app/DashboardClient.tsx:3864` | small |
| MO-13 | motion | Pipeline step indicators: only the 'done' check animates — idle→active pops, and mode="wait" is inert on non-motion children | `src/app/DashboardClient.tsx:2646` | small |
| MO-14 | motion | 'Collapse all' animates every nested accordion's height simultaneously — the one case the height-animation exemption excludes | `src/app/DashboardClient.tsx:1307` | medium |
| MO-15 | motion | Uploaded-file chips appear and disappear with no motion in an otherwise fully-transitioned upload flow | `src/app/DashboardClient.tsx:2747` | small |
| MO-16 | motion | JS smooth scrolling ignores prefers-reduced-motion — voice mode auto-scrolls animatedly for reduce-motion users | `src/app/DashboardClient.tsx:710` | small |
| MO-17 | motion | Stats skeleton carries an animationDelay with no animation — vestigial shimmer that never fires | `src/app/components/StatsPanel.tsx:325` | small |
| IS-15 | interaction-states | Accordion/disclosure toggles never set aria-expanded (only the mobile menu button does) | `src/app/DashboardClient.tsx:2355` | small |
| IS-16 | interaction-states | Heatmap cells expose their data only via hover tooltips on non-focusable divs | `src/app/components/StatsPanel.tsx:517` | medium |
| IS-17 | interaction-states | Two competing auto-reset timers (4s and 5s) for the semester danger-zone confirms — the 5s one is dead code | `src/app/DashboardClient.tsx:1431` | small |
| IS-18 | interaction-states | Disabled-cursor language is inconsistent: cursor-default (Scribble) vs cursor-not-allowed (system) vs cursor-wait (busy) | `src/app/components/ScribbleCanvas.tsx:238` | small |
| LS-10 | layout-spacing | Screen-header rhythm drifts across the five tabs: eyebrow→title gap is 10px or 12px, and the header's bottom margin is 32, 36 or 40px | `src/app/DashboardClient.tsx:3508` | small |
| LS-11 | layout-spacing | The same model <select> is 52px tall on Upload and 48px in the Quiz — and wears two different skins (input-dark vs btn-secondary) | `src/app/DashboardClient.tsx:2780` | small |
| LS-12 | layout-spacing | Empty/error state cards use five different paddings (p-9, p-10, p-12 md:p-16, p-14) and two icon-tile sizes for the same pattern | `src/app/DashboardClient.tsx:2228` | small |
| LS-13 | layout-spacing | Settings 'Appearance' section puts its body copy above the caps-label heading — inverted against every sibling section in the same modal | `src/app/DashboardClient.tsx:4468` | small |
| LS-14 | layout-spacing | Dashboard 'Upcoming' rows use 22px gutters / 13px vertical padding while library rows use 20px / 14–16px — same list-row DNA, different metrics | `src/app/DashboardClient.tsx:2520` | small |
| LS-15 | layout-spacing | Heatmap grid fills only ~460px of a ~900px desktop card, with the legend right-aligned past the grid's edge | `src/app/components/StatsPanel.tsx:494` | small |
| LS-16 | layout-spacing | 3-up segmented controls in Settings wrap German labels to two lines on small phones, breaking the pill's line rhythm | `src/app/DashboardClient.tsx:4705` | small |
| LS-17 | layout-spacing | Unmotivated 1–2px near-misses in the hand-tuned metric set (px-[34px] vs py-9, pt-[18px] vs pb-4, pt-[46px]) | `src/app/login/LoginClient.tsx:107` | small |
| AX-14 | a11y | Tooltips violate WCAG 1.4.13: not dismissible with Escape and not hoverable | `src/app/components/Tooltip.tsx:62` | small |
| AX-15 | a11y | Long scrollable text regions (prompt viewer, grading error, history briefs) are unreachable by keyboard scrolling | `src/app/DashboardClient.tsx:5045` | small |
| AX-16 | a11y | Heading outline is broken: brand wordmark rendered as h1 alongside each page h1, and h2/h3/h4 levels skip and shuffle across surfaces | `src/app/DashboardClient.tsx:2013` | small |
| AX-17 | a11y | Push notification row renders a fake switch with no switch semantics | `src/app/DashboardClient.tsx:2090` | small |
| AX-18 | a11y | No skip link: keyboard users tab through the full sidebar (9+ stops) before reaching content on every tab switch | `src/app/DashboardClient.tsx:2005` | small |
| AX-19 | a11y | Sub-44px touch targets cluster on high-frequency controls (snooze pills 28px, tutor speak 24px, toast close ~20px) | `src/app/DashboardClient.tsx:2327` | small |
| EM-12 | empty-loading-error | Interactive-mode button is offered on browsers that can't run it — the `supported` flag is computed but never used | `src/app/DashboardClient.tsx:3592` | small |
| EM-13 | empty-loading-error | Library tab renders nothing at all during the initial load — the only screen without a skeleton | `src/app/DashboardClient.tsx:2920` | small |
| EM-14 | empty-loading-error | Dashboard shows 'Upload your first lecture' onboarding when the reviews fetch failed — the documented retry intent is only half-shipped (Library got it, Dashboard didn't) | `src/app/DashboardClient.tsx:2226` | small |
| EM-15 | empty-loading-error | Login page (and NextAuth error copy) is German-only in a bilingual app | `src/app/login/LoginClient.tsx:14` | medium |
| EM-16 | empty-loading-error | Google avatar has no error fallback — a dead image URL leaves a broken-image glyph in the sidebar | `src/app/DashboardClient.tsx:2109` | small |
| EM-17 | empty-loading-error | A dead ?quizId deep link is swallowed silently — no explanation why the notification led nowhere | `src/app/DashboardClient.tsx:1551` | small |
| EM-18 | empty-loading-error | Stats skeleton carries a staggered animationDelay for an animation that doesn't exist | `src/app/components/StatsPanel.tsx:325` | small |
| MC-14 | microcopy-i18n | English button-label case drifts into Title Case: 'Browse Files', 'Add Presets', 'Subscribe to Log History', 'Video Archive' | `src/app/DashboardClient.tsx:2743` | small |
| MC-15 | microcopy-i18n | Percent formatting is inconsistent: '87 %' with a space in the library, '87%' without in the dashboard rail and stats | `src/app/DashboardClient.tsx:2571` | small |
| MC-16 | microcopy-i18n | Ellipsis and quote discipline drifts: ASCII '...' bookends in the upload placeholder, inconsistent space-before-ellipsis, straight quotes in one English string | `src/app/DashboardClient.tsx:2771` | small |
| MC-17 | microcopy-i18n | The done-calendar feed gets a third name mid-section: 'Erledigt-Kalender' heading, then 'Verlaufshistorie abonnieren' / 'Subscribe to Log History' button | `src/app/DashboardClient.tsx:4404` | small |
| MC-18 | microcopy-i18n | Toast close buttons announce 'Close' to screen readers in both languages | `src/app/components/Toast.tsx:74` | small |
| MC-19 | microcopy-i18n | History-modal footnote is changelog-speak frozen into permanent UI: 'Briefe werden ab jetzt … gespeichert' | `src/app/DashboardClient.tsx:4307` | small |
| MC-20 | microcopy-i18n | Greeting thresholds disagree between languages: German switches off 'Morgen' at 11, English at 12 | `src/app/DashboardClient.tsx:2163` | small |
| MT-13 | mobile-touch | Enter always sends in the tutor composer — a newline is impossible on phone keyboards | `src/app/components/TutorPanel.tsx:412` | small |
| MT-14 | mobile-touch | Activity heatmap opens scrolled to six months ago — today is off-screen on phones | `src/app/components/StatsPanel.tsx:493` | small |
| MT-15 | mobile-touch | Mobile menu min-height hardcodes a 61px top bar — bottom items fall below the fold on notched iPhones | `src/app/DashboardClient.tsx:2035` | small |
| MT-16 | mobile-touch | Modal family splits on mobile: two overlays bottom-sheet, five center — one dialog grammar should win | `src/app/DashboardClient.tsx:4952` | small |
| MT-17 | mobile-touch | Zero swipe gestures anywhere — snoozing a card takes three precise taps on 28–32px targets | `src/app/DashboardClient.tsx:2337` | medium |
| MT-18 | mobile-touch | No overscroll-behavior on the page — Android pull-to-refresh can wipe comprehension answers | `src/app/globals.css:293` | small |
| MT-19 | mobile-touch | Manifest ships one 192px PNG doing double duty as 'any maskable' — Android adaptive icons will crop it | `public/manifest.json:14` | small |
| PP-9 | perceived-performance | Redundant review fetches: an immediate refetch on mount right after SSR, and a double fetch on every tab refocus | `src/app/DashboardClient.tsx:951` | small |
| PP-10 | perceived-performance | backdrop-blur-xl on fixed/sticky bars repaints a 24px blur on every scrolled frame on mobile | `src/app/DashboardClient.tsx:2008` | small |
| PP-11 | perceived-performance | New accounts see skeleton cards that dissolve into an empty state — a loading lie on the first-ever impression | `src/app/DashboardClient.tsx:536` | small |
| PP-12 | perceived-performance | Stats skeleton doesn't match the final layout it claims to mirror — different stack gap, different grid gap, missing filter row | `src/app/components/StatsPanel.tsx:322` | small |
| IA-14 | hierarchy-ia | Calendar sync's only entry point is conditionally rendered inside the 'Upcoming' section — with no scheduled items the feature is unreachable | `src/app/DashboardClient.tsx:2500` | small |
| IA-15 | hierarchy-ia | 'Upcoming' rows silently start a consequential early review on click — an informational-looking list row and a 'begin exam' action share one affordance | `src/app/DashboardClient.tsx:2519` | small |
| IA-16 | hierarchy-ia | The library's student-facing 'Tutor-Brief' chip opens a page titled 'Tutor Prompt' with raw-system-prompt framing and a pass-green level badge | `src/app/tutor/[id]/page.tsx:47` | small |
| IA-17 | hierarchy-ia | A debugging tool ('Prompts' viewer) is presented as a peer chip among student study materials | `src/app/DashboardClient.tsx:3422` | small |
| IA-18 | hierarchy-ia | The login page ignores the app's bilingual IA — hardcoded German copy with a stray English tagline in the footer | `src/app/login/LoginClient.tsx:160` | small |

## Live-inspection findings (browser, 2026-07-09)

**LIVE-1 · P0 — Tab switches preserve the previous tab's scroll position.** All tabs share `.app-shell-main`; switching tabs lands mid-scroll (reproduced: Stats@561px → Dashboard hides greeting/CTA). Fix: scroll container to top on `activeTab` change. — Status: ✅ fixed (design-polish 2026-07-10)

**LIVE-2 · P0 — German compounds break mid-word without hyphens** ("Ventrikelsyste/m & Liquor" with Tutor drawer open). Same root cause as TY/`lang` finding: `overflow-wrap: break-word` + `hyphens` nowhere + `<html lang="en">` hardcoded. — Status: ✅ fixed (design-polish 2026-07-10)

**LIVE-3 · P1 — Keyboard hints (`↵` kbd chips) render on touch devices** (primary CTA, tutor footer). Hide under `(pointer: coarse)`. — Status: ✅ fixed (design-polish 2026-07-10)

**LIVE-4 · P1 — Eucalyptus accent (#619f88) ≈ sage pass-green (#5e7d58)** — accent and pass-semantic become indistinguishable when that accent is chosen. Re-tune one of them.

**LIVE-5 · P1 — Mobile nav: top-right hamburger + full-screen menu for 5 items** (see MT-1: bottom tab bar). Dead space, teaser card in prime thumb zone.

**LIVE-6 · P1 — Due-card titles truncate to one line on mobile** ("Neuroanatomische Bildgeb…") — use 2-line clamp. — Status: ✅ fixed (design-polish 2026-07-10)

**LIVE-7 · P1 — Disabled primary buttons keep the amber gradient at 55% opacity** — reads half-enabled. Use neutral disabled treatment. — Status: ✅ fixed (design-polish 2026-07-10)

**LIVE-8 · P2 — "Verwalten" link in upload form wears accent color** — tertiary action, accent-discipline leak.

**LIVE-9 · P2 — Settings modal mixes poetry with proxy plumbing** — KI-Verbindung/PDF-Übertragung/Diktat belong behind an "Erweitert" disclosure.

**LIVE-10 · P2 — Zero-streak presented as failure stat** ("Tage-Streak: 0") — design the zero moment.

**LIVE-11 · P2 — Login footer tagline is English on a German page** (also in IA/login bilingual finding). — Status: ✅ fixed (design-polish 2026-07-10)

**LIVE-12 · NOTE — Verified good:** login composition centered at desktop; ink theme hierarchy holds; settings theme cards + accent copy excellent; quiz microcopy excellent.

---

## Verified findings — full detail


### Typography & vertical rhythm (15)

**TY-1 · P0 · effort:small — Passed-level stepper labels use non-existent token `text-ink-500` — renders full-strength ink-900 and inverts the hierarchy**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3241`
- Duplicate-of/with: CC-8
- Evidence: `<span className={`w-7 text-center text-[9px] leading-none ${current ? "text-(--accent-text-strong) font-semibold" : passed ? "text-ink-500 font-medium" : "text-ink-300 font-medium"}`}>` — but the @theme block in globals.css defines ONLY `--color-ink-900/600/400/300` (lines 31–34). There is no `--color-ink-500`, so Tailwind v4 generates no CSS for `text-ink-500`; the class is emitted but dead.
- Impact: In the library's interval stepper (T1…T365), the labels for PASSED levels inherit the body color (--foreground = ink-900) — the darkest text on the card — while the CURRENT level's label is a mid-strength accent and locked levels are faint ink-300. The visual hierarchy is inverted: history shouts, the active step whispers. In the ink theme, passed labels glow brightest cream. Violates the app's own token discipline.
- Fix: Replace `text-ink-500` with an existing ramp token — `text-ink-600` reads correctly (quieter than current, stronger than locked ink-300). If a true mid-step is wanted, add `--color-ink-500: var(--ink-500)` plus paper/ink values to globals.css.
- Verified: Confirmed line 3241 contains `text-ink-500`; confirmed @theme (globals.css 31–34) defines only ink-900/600/400/300; grep shows this is the only ink-500 reference in src/. Walked the ancestor chain from ~3210 up — no intermediate element sets a text color, so the span inherits ink-900 from body, confirming the inversion claim.

**TY-2 · P0 · effort:medium — Type scale has fragmented into ~30 distinct sizes, including half-pixel steps and singletons that duplicate existing tokens**
- Status: ⏭ skipped - full type-scale consolidation spans globals.css @theme tokens plus LoginClient/TutorPanel/StatsPanel; out of scope for the DashboardClient-only batch
- Where: `src/app/DashboardClient.tsx:3644`
- Evidence: Repo-wide tally of arbitrary sizes (re-run): text-[13px]×21, [11px]×19, [15px]×18, [10px]×14, [9px]×9, [12.5px]×8, [13.5px]×5, [11.5px]×4, [14.5px]×3, [10.5px]×2, [9.5px]×1, [12px]×1, [17px]×1, [21px]×1, [26px]×1, [27px]×3, [31px]×1, [8px]×3, plus 34/40/44/54 display sizes and named text-xs (63×)/text-sm (64×)/base/lg/xl/2xl/4xl. Line 3644: `<span className="text-[12px] font-bold …">` — a literal duplicate of `text-xs`. Neighbouring drift: text-[13px] vs [13.5px] vs text-sm; [14.5px] vs text-sm; quiz h1 at oddball 27/31px vs the 22/26/34/40/44 display steps.
- Impact: Roughly 30 distinct font sizes across one app — no world-class type system has more than ~12. The half-pixel steps (12.5/13.5/14.5/11.5/10.5/9.5) rasterize inconsistently on 1× displays and make near-identical text sit at subtly different sizes side by side (e.g. 12.5px library toolbar controls at L2866/2874 next to 13px labels). The rhythm reads slightly 'off' everywhere without an obvious cause — the classic symptom of scale drift.
- Fix: Consolidate to a declared scale (e.g. 9, 10, 11, 12(xs), 13, 14(sm), 15, 16(base), 22, 27, 34, 40/44, 54) as @theme font-size tokens; delete the half-pixel sizes (12.5→13 or 12, 13.5→13 or 14, 14.5→14, 11.5→11, 10.5→10 or 11, 9.5→9 or 10) and replace `text-[12px]`→`text-xs`. One mechanical sweep, big perceived-quality payoff.
- Verified: Re-ran the full grep tally myself — counts match within a few units (the uncommitted mobile diff added 3 more text-[15px] instances, reinforcing the finding). Confirmed text-[12px] at line 3644 and the half-pixel call sites (DashboardClient 405/2098/2235/2866, TutorPanel 366/392, LoginClient 84/112/126).

**TY-3 · P1 · effort:small — Modal titles drift across the peer modals: 20px/weight-500 vs 24px/weight-480 vs 16px display vs 15px sans-semibold**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4118`
- Evidence: Archive modal: `font-display text-xl font-medium` (L4118); Feedback modal: `font-display text-xl font-medium` (L4172); Calendar modal: `font-display text-2xl … style={{ fontWeight: 480 }}` (L4334); Settings modal: `font-display text-2xl … fontWeight: 480` (L4448); Prompt viewer: `font-display text-base font-medium` (L5021); Prompts list & comprehension viewer: `text-[15px] font-semibold` in Inter (L4916, L4965).
- Impact: Structurally identical surfaces (card-glass modals at the same z-level) carry four different title treatments. `font-medium` (500) on Fraunces is visibly heavier than the system's tuned 470–480 display weights (globals.css sets h1–h3 to 470), so the Archive/Feedback titles look bolder AND smaller than Settings/Calendar — the app feels stitched together when moving between modals.
- Fix: Pick one modal-title spec — e.g. `font-display text-xl tracking-[-0.015em]` at weight 480 — and apply it to all six headers. Keep the caps-label sub-headers as the second level. If the small utility modals (prompts list) intentionally stay sans, document that as a second, deliberate tier.
- Verified: Read all six cited headers in the working tree — every className/inline-weight quote is exact (4118 text-xl font-medium h3; 4172 same; 4334 h2 text-2xl fontWeight 480; 4448 h3 text-2xl fontWeight 480; 5021 text-base font-medium; 4916/4965 text-[15px] font-semibold sans). Also confirmed globals.css base h1–h3 weight is 470, supporting the weight-mismatch claim.

**TY-4 · P1 · effort:small — Percent formatting is inconsistent: "82 %" (space) and "82%" (no space) coexist, and neither respects the active language's convention**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3121`
- Evidence: Space before %: L3041 `Ø {avg} %`, L3121/L3306/L4972 `{Math.round(item.comprehensionScore)} %`, L3447 `≈ {summary.mastery} %`, L3773 `${Math.round(…)} %` (result headline). No space: L2571 dashboard right-rail `{Math.round((passRate30.passed/…)*100)}%`, StatsPanel L551 `` `${mod.passRate}%` `` and the stat-card suffix `%` (L474). None of these call sites branch on language.
- Impact: The same class of number (a pass/comprehension percentage) is typeset two different ways depending on which screen you're on — dashboard says "82%", library says "82 %". German convention (DIN 5008) wants a (narrow) space before %, English wants none; the app currently applies each style to both languages at random.
- Fix: Centralize in a `fmtPercent(value, language)` helper: German → `82 %` (narrow no-break space), English → `82%`. Replace all eight call sites.
- Verified: Printed every cited line — all quotes exact. Confirmed via grep that both spaced and unspaced variants exist and that none of these sites vary the % spacing by language (only the surrounding words are language-conditional).

**TY-5 · P1 · effort:medium — `<html lang="en">` is hardcoded while the default UI is German, and long German compounds break without hyphens**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/layout.tsx:54`
- Duplicate-of/with: AX-3
- Evidence: layout.tsx L53–57: `<html lang="en" …>` — never updated even though page.tsx passes `initialLanguage={config?.language ?? "german"}` and the login page copy is German-only ("Willkommen zurück", "Lerne weniger. Behalte mehr."). globals.css L322–325 handles overflow with `p, span, a, h1…div { overflow-wrap: break-word; }` but `hyphens` appears nowhere in src/, and nothing anywhere sets `document.documentElement.lang`.
- Impact: On narrow screens, compounds like "Entwicklungspsychologie" snap mid-word with no hyphen (break-word breaks at arbitrary characters) — visibly cheap for a bilingual app that otherwise sweats details. Wrong `lang` also blocks correct hyphenation dictionaries and screen-reader pronunciation.
- Fix: Set `lang` from the server-read language (the server component already reads config for `initialLanguage`; pass it into RootLayout or set `document.documentElement.lang` when language changes in DashboardClient). Then add `hyphens: auto` to running-copy contexts (p, the feedback brief, card descriptions) so German compounds break with a hyphen instead of a hard snap.
- Verified: Confirmed lang="en" at layout.tsx:54 and the german default at page.tsx:44. Actively searched the whole src/ tree: zero `hyphens` declarations and zero `documentElement.lang` assignments exist — the 'missing' claim survives an active search. Confirmed the overflow-wrap:break-word block at globals.css ~322–325.

**TY-6 · P1 · effort:small — Body text color drifts between the ink ramp and ad-hoc alpha inks (ink-900/80, /85) — two nearly-identical secondary grays coexist**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:405`
- Evidence: FeedbackBody: `text-[14.5px] leading-[1.7] text-ink-900/80` (L405); free-quiz text: `text-ink-900/80` (L4016); prompt viewer pre: `text-ink-900/80` (L5046); library lecture row: `text-ink-900/80` (L3111); TutorPanel model text: `text-ink-900/85` (TutorPanel.tsx L392); tutor page: `text-ink-900/85` (tutor/[id]/page.tsx L80). Meanwhile the design system defines a four-step ink ramp (`--ink-900/600/400/300`, globals.css L74–77) precisely for this.
- Impact: ink-900@80% over paper produces a gray that is close to — but not — any ramp step, and its effective hue shifts with whatever surface sits beneath (paper-0 vs paper-1 vs paper-hover). Reading surfaces (feedback brief, quiz text, tutor chat) each get a subtly different 'secondary ink', which a trained eye registers as muddiness, and /80 vs /85 is pure drift between sibling components.
- Fix: Add one token for long-form reading ink (e.g. `--ink-700` tuned per theme) and use it for FeedbackBody, quiz body, tutor chat, and the tutor page; reserve ink-600 for captions. Kill the /80 and /85 alphas.
- Verified: Grep for `ink-900/8` confirmed exactly the six cited sites — four at /80 (DashboardClient 405, 3111, 4016, 5046) and two at /85 (TutorPanel 392, tutor/[id]/page.tsx 80). Confirmed the ink ramp tokens at globals.css 74–77.

**TY-7 · P1 · effort:small — Tabular-numeral coverage is incomplete and split across two mechanisms (.tnum vs Tailwind tabular-nums), against the system's own stated rule**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4250`
- Evidence: DashboardClient uses the custom `.tnum` class 15×; StatsPanel uses Tailwind's `tabular-nums` 5× (L448, 468, 550, 585, 631) and `.tnum` 0× — two spellings of one intent. Coverage gaps in genuinely columnar numbers: review-history rows `toLocaleDateString(…)` + `toLocaleTimeString(…)` (L4250–4253, a stacked column of dates+times, no tnum); library module meta counts (L3046) and semester header counts (L2976); comprehension dates (L3309, L4976); the level column `w-8 text-right` (L3152). globals.css L388 states: 'Tabular numerals wherever dates/stats align in columns.'
- Impact: In the feedback-history list, dates and HH:MM timestamps wobble in width row-to-row (proportional 1s vs 8s), so the column edge shimmers; the library's right-edge counts do the same — directly against the design system's own written promise.
- Fix: Add `tnum` to the history date/time spans, library counts, comprehension dates, and the level column. Standardize on the `.tnum` utility (it also sets font-feature-settings) and replace StatsPanel's `tabular-nums` for one grep-able convention.
- Verified: Counted: 15 `.tnum` uses in DashboardClient, 5 `tabular-nums` in StatsPanel (448/468/550/585/631), zero `.tnum` in StatsPanel. Read L4250–4253: date+time spans carry no tnum. Verified the gap sites at 2976/3046/3152/3309/4976 and the verbatim promise comment at globals.css 388.

**TY-8 · P1 · effort:small — Micro caps badges drift across three sizes and two trackings: 9px vs 9.5px vs 10px, 0.12em vs 0.08em**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2970`
- Evidence: Library 'Aktiv' badge: `text-[9.5px] uppercase tracking-[0.12em] … style={{ fontWeight: 700 }}` (L2970); due badges: `text-[9px] font-bold uppercase tracking-[0.12em]` (L3023, L3131); PASS/REPEAT pills: `text-[9px] font-bold uppercase tracking-[0.12em]` (L3302, L4967); Mastery badge: `text-[10px] font-bold uppercase tracking-[0.08em]` (L3199); history Level pill: `text-[10px] font-semibold` non-caps (L4246).
- Impact: These pills frequently sit in the SAME row (library module header can show 'Aktiv' 9.5px next to a due badge 9px; the expanded item shows Mastery 10px/0.08em above PASS 9px/0.12em). At these sizes a half-pixel and 0.04em of tracking are visible — the badges look like cousins rather than one component.
- Fix: Define one `.badge-caps` primitive (suggest 9.5px, weight 700, tracking 0.12em, px-2 py-0.5 rounded-full) and derive all status pills from it; only colors vary. Delete the inline fontWeight 700 in favour of `font-bold`.
- Verified: Read every cited badge in the working tree — all specs quoted exactly: 9.5px/0.12em/inline-700 'Aktiv' (2970), 9px/0.12em due badges (3023, 3131), 9px/0.12em pass/repeat pills (3302, 4967), 10px/0.08em Mastery (3199), 10px font-semibold non-caps Level pill (4246). The adjacency claims match the component structure (same module header / expanded item).

**TY-9 · P1 · effort:small — 8px chart labels in the stats heatmap sit below any legible floor of the scale**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:496`
- Evidence: Weekday gutter: `<div className="flex flex-col gap-1 pr-1.5 text-[8px] text-ink-300">` (L496) and month labels `text-[8px] text-ink-400` (L514). The library stepper's repeat markers also use `text-[8px]` (DashboardClient L3246). These are the only three 8px sites in the app; nothing else goes below 9px.
- Impact: 8px ink-300 on paper-0 is under the practical legibility floor (GitHub's equivalent heatmap gutter is ~10px); on a 13px cell grid there is room for 9–10px. Users squint at 'Mo/Do/So' and month names — the one place in the app where type is genuinely hard to read, compounded by the weekday gutter using near-invisible ink-300.
- Fix: Raise the heatmap gutter and month labels to `text-[10px]` and bump the gutter color to ink-400. The 13px cells and 4px gaps absorb this without layout change. Raise the ×N repeat markers to 9px to match the stepper's T-labels.
- Verified: Confirmed all three text-[8px] sites via grep (StatsPanel 496 gutter in ink-300, 514 month labels in ink-400, DashboardClient 3246 repeat marker); confirmed the 13px cell height (`h-[13px]`) leaves headroom; confirmed no other sub-9px type exists in the app.

**TY-10 · P2 · effort:small — `.eyebrow` and `.caps-label` are duplicate tokens, and the caps treatment's tracking drifts per call site (0.10–0.14em)**
- Status: ⏳ open
- Where: `src/app/globals.css:462`
- Evidence: globals.css L462–478 defines `.eyebrow` and `.caps-label` with byte-identical rules (11px / 650 / uppercase / 0.11em / ink-400). `.eyebrow` is used exactly once (DashboardClient L5020); everything else uses `.caps-label` — then overrides it: `tracking-[0.14em]` on page eyebrows (L2174, L2602, L2817, L3508), `tracking-[0.1em]` in stat cards (StatsPanel L465), `tracking-[0.13em]` on login (LoginClient L108), `!text-[10.5px] !tracking-[0.12em]` in TutorPanel (L373), `!text-ink-600` in the brief headers (L3820, 3877, 4188).
- Impact: Five different letter-spacings for one nominal treatment, plus a dead duplicate class — the definition of design-token erosion. The 0.14em page eyebrows vs 0.11em card labels may be intentional hierarchy, but nothing encodes that intent, so drift keeps compounding.
- Fix: Delete `.eyebrow` (retarget its one use). If page-level eyebrows should be wider-tracked, add a `caps-label-page { letter-spacing: 0.14em }` variant to globals.css and remove the ad-hoc tracking overrides; normalize the rest back to the 0.11em token.
- Verified: Read globals.css 462–478 — the two classes are byte-identical. Grep confirmed .eyebrow's single use (DashboardClient 5020) and every cited override: 0.14em ×4, 0.1em (StatsPanel 465), 0.13em (login 108), TutorPanel !10.5px/!0.12em, and !text-ink-600 overrides at 416/3820/3877/4188.

**TY-11 · P2 · effort:small — Section-header semantics and sizes disagree across tabs and modals (h2 16px vs h4 14px for the same role; modal titles h2 vs h3)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2265`
- Duplicate-of/with: IA-2
- Evidence: Dashboard section headers: `<h2 className="text-base tracking-[-0.011em] …" style={{ fontWeight: 650 }}>` (L2265, L2503); the visually identical StatsPanel section headers: `<h4 className="text-sm text-ink-900" style={{ fontWeight: 650 }}>` (StatsPanel L488, L538, L578, L624). Calendar modal's title is an `<h2>` (L4334) while Settings' is `<h3>` (L4448); the feedback modal has two sibling `<h3>`s — title (L4172) and the caps label (L4188).
- Impact: The same hierarchical role renders at 16px on the dashboard but 14px on stats — a level of drift you feel when tab-switching. The heading-level soup (h2/h4 for peer sections, h2/h3 for peer modals) also degrades the screen-reader outline for no benefit.
- Fix: Standardize card/section headers to one spec (suggest text-base, weight 650) and one element per role: h2 for in-page sections, h3 for card headers, one level for all modal titles. Convert the feedback modal's caps label to a `<p>` like everywhere else.
- Verified: Read all cited lines: dashboard h2 text-base/650 (2265, 2503), StatsPanel h4 text-sm/650 (488, 538, 578, 624), Calendar h2 (4334) vs Settings h3 (4448), and the feedback modal's two h3 siblings (4172 title, 4188 caps-label). All exact.

**TY-12 · P2 · effort:small — Orphan font-weight 570 on the 'Upcoming' row title — a one-off between the system's 550 and 600**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2523`
- Evidence: `<div className="text-sm tracking-[-0.008em] text-ink-900 truncate" style={{ fontWeight: 570 }}>{review.topic}</div>` — repo-wide inline-weight tally (re-run): 550×14, 650×9, 470×9, 480×6, 560×3, 520×2, 700×1, 570×1, 460×1. 570 appears exactly once; comparable list-row titles use 550 or font-semibold 600.
- Impact: The upcoming-list topic renders at a weight that exists nowhere else — 20 units off its siblings. Individually invisible, but it's exactly the kind of unmanaged micro-drift the inline-style weights invite (there is no utility for the intermediate weights, so each call site re-guesses).
- Fix: Decide the demotion intent: 550 (matches the row's neighbors) or 600 (matches other item titles) — then add @theme font-weight utilities (e.g. `font-book: 550`, `font-heavy: 650`) so intermediate weights are named tokens instead of inline styles.
- Verified: Confirmed fontWeight 570 at line 2523 and re-ran the full inline-weight tally myself — it matches the finding's numbers exactly (570 is a true singleton; 550/650/470/480/560/520/460 are the established steps).

**TY-13 · P2 · effort:small — Raw three-dot "..." in upload placeholder while the rest of the app uses the true ellipsis character**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2771`
- Duplicate-of/with: MC-16
- Evidence: `placeholder={language === "german" ? "...oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein..." : "...or paste your lecture notes, transcript, or raw text here..."}` — every other placeholder and progress string uses the typographic '…' ("Modul oder Vorlesung suchen…", "Schreibe deine Antworten hier …", "Frag deinen Tutor…", "Starte KI-Pipeline…").
- Impact: Three full stops track wider and sit lower than '…'; on the upload page — the app's front door for new content — the placeholder is the only string in the product with typewriter ellipses, plus an unusual leading-ellipsis lowercase start.
- Fix: Replace with the U+2026 character and drop the leading ellipsis: 'Oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein …', matching the space-before-ellipsis style used in sibling placeholders.
- Verified: Confirmed line 2771 uses '...' in both language variants; grepped all placeholders and progress strings — every other one uses '…' (this is the sole typewriter-ellipsis string in the product).

**TY-14 · P2 · effort:small — Dashboard h1 is 44px while every other tab's h1 is 40px at the same breakpoint**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2175`
- Evidence: Dashboard greeting: `text-[34px] sm:text-[44px] tracking-[-0.02em] leading-[1.05]` (L2175). Upload (L2603), Library (L2818), Stats (L3509), and the result headline (L3768) all use `text-[34px] sm:text-[40px]` with identical tracking/leading. Login uses yet another pair: `text-4xl sm:text-[54px]` with weight 460 and leading-[1.06] (LoginClient L75).
- Impact: Tab-switching between Dashboard and Library visibly shrinks the page title by 4px with identical layout position — it reads as a glitch rather than intent, since nothing else about the header changes.
- Fix: Either normalize all four tab h1s to sm:text-[40px], or commit to the hero: give the greeting a distinct treatment (e.g. 44px plus the italic accent already used elsewhere) so the size difference reads as deliberate, and document 34/40/44/54 as the display scale.
- Verified: Extracted the size classes from all five cited h1s — dashboard is the sole sm:text-[44px]; the other four are sm:text-[40px] with otherwise identical tracking-[-0.02em] leading-[1.05]. Login's text-4xl sm:text-[54px]/460/leading-[1.06] confirmed at LoginClient 75.

**TY-15 · P2 · effort:small — Print export abandons the brand typography and tokens entirely (Inter bold + raw zinc palette)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:1957`
- Evidence: Print wrapper: `<h1 className="text-2xl font-bold font-sans text-zinc-900 mb-2">` (L1957), `border-zinc-200`, `bg-zinc-900 text-zinc-100` level chip, `text-zinc-500` meta, `bg-zinc-50` question boxes, `border-zinc-300` answer lines (L1956–1993) — the only place in the codebase using Tailwind's raw zinc palette; globals.css' @media print block (L939–964) meanwhile carefully remaps the paper tokens for printing (--ink-900 #211b12, warm hairlines, paper-2).
- Impact: The printed quiz sheet — a physical artifact of the product — carries none of the Paper & Ember voice: no Fraunces title, generic gray-blue zincs instead of the warm ink ramp the print block already provides. It looks like a different (cheaper) product on paper.
- Fix: Use the existing tokens in the print wrapper (`text-ink-900`, `border-(--line)`, `bg-paper-2`) — the @media print overrides already resolve them to print-safe values — and set the sheet title in `font-display` weight 470 to match the app's headline voice.
- Verified: Read the full print wrapper (1950–1995) — all zinc quotes exact, h1 is font-sans font-bold. Grep confirmed zinc-* appears nowhere else in src/. Read the @media print block (globals.css 939–964): it does remap the warm token palette for print, so the recommendation is directly implementable.


### Color, contrast & theming (12)

**CC-1 · P0 · effort:small — Undo-toast action button is illegible in the ink theme (1.72:1) and with the graphite accent in paper (1.83:1)**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/components/Toast.tsx:98`
- Evidence: className="text-(--a-g2) font-semibold px-2 py-1 rounded-full ..." — the action sits on the inverted pill `bg-ink-900 text-(--paper-0)` (line 92). The pill flips per theme but --a-g2 flips the same way, so they collide. Recomputed: paper+amber #ef9f1f on #211b12 = 7.84:1 (fine); ink+amber #f2a62e on cream pill #f1ebdf = 1.72:1; ink+slate = 2.03:1; ink+eucalyptus = 1.94:1; ink+heather = 2.34:1; ink+graphite = 1.23:1; paper+graphite #4e4638 on #211b12 = 1.83:1. WCAG needs 4.5:1.
- Impact: The 'Undo' label — the app's single forgiveness affordance (it replaces confirm dialogs per the toast component's own CRAFT.md §8 comment) — is a near-invisible amber smear on the cream pill for every ink-theme user, and dark-on-dark for paper+graphite users. Users who just deleted something can't see the one control that saves them.
- Fix: The pill inverts, so the accent on it must come from the OPPOSITE theme's tuning. Add a token, e.g. `--accent-on-surface-inverse`: in :root (paper) set it to the ink tuning of the accent (amber #f0ac42 → 8.69:1 on the dark pill), in [data-theme="ink"] set it to the paper tuning's --accent-text-strong (amber #a15e03 → 4.30:1 on the cream pill); per-accent overrides mirror the existing accent blocks. Then use `text-(--accent-on-surface-inverse)` in Toast.tsx.
- Verified: Opened Toast.tsx lines 92–101: pill is bg-ink-900/text-(--paper-0), action is text-(--a-g2) — both tokens flip with the theme, so the collision is structural. Recomputed all seven claimed ratios from the globals.css token values (lines 74/101/175/214/226-290): every number matched within 0.01 (1.72, 2.03, 1.94, 2.34, 1.23, 1.83). Also verified the proposed fix colors: #f0ac42 on #211b12 = 8.69:1, #a15e03 on #f1ebdf = 4.30:1.

**CC-2 · P0 · effort:medium — The entire tertiary text tier (--ink-400) fails contrast on every paper surface: 2.27–2.65:1 for eyebrows, captions, and placeholders**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/globals.css:468`
- Evidence: .eyebrow / .caps-label are 11px 650-weight with `color: var(--ink-400)` (lines 462–478). --ink-400: #a89d8b (line 76) computes to 2.41:1 on paper-0 #f6f3ec, 2.65:1 on paper-1 #fffefb, 2.27:1 on paper-2 — below even the 3:1 large-text floor, far below the 4.5:1 required at 11px. There are exactly 83 `text-ink-400` call sites, including full sentences: TutorPanel.tsx:342 empty-state copy at 12px, StatsPanel.tsx:571/614 chart captions at 11.5px, DashboardClient.tsx:3752 'You can leave this page…' reassurance, and ::placeholder (globals.css:379–382). Ink theme --ink-400 #7c7160 = 3.38–3.72:1, also sub-4.5.
- Impact: Every date eyebrow, stat-card label, chart caption, placeholder, and helper sentence in the app is washed out — dozens of screens fail WCAG AA, and on a sunlit laptop screen the meta layer effectively disappears. Notably the dark theme is MORE legible than the flagship paper theme.
- Fix: Split the tier's jobs: (1) darken paper --ink-400 to ~#7d7365 (4.20:1 on paper-0, 4.61:1 on paper-1 — still clearly lighter than ink-600 #6e6455 at 5.24:1); tune ink --ink-400 up similarly; (2) move sentence-length copy (TutorPanel empty state, StatsPanel captions, grading reassurance) up to text-ink-600, keeping ink-400 for glanceable labels only.
- Verified: Read globals.css 462–478 (both classes use var(--ink-400)) and 76/177 (token values). Recomputed all ratios: 2.41/2.65/2.27 paper, 3.38–3.72 ink — exact match. Grep-counted text-ink-400: exactly 83 call sites as claimed. Confirmed the cited sentence-length uses at TutorPanel.tsx:342, StatsPanel.tsx:571/614, DashboardClient.tsx:3752, and ::placeholder at globals.css:379. Verified proposed #7d7365 = 4.20/4.61:1.

**CC-3 · P0 · effort:medium — Raw gradient stops used as text color: 21 `text-amber-500/600` call sites at 1.96–2.79:1 instead of the purpose-built --accent-text-strong**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:4732`
- Evidence: `<div className="mb-4 text-xs font-semibold text-amber-600 ...">` ('Settings locked while AI generation is in progress' warning; twin at 4818) — text-amber-600 maps to --a-g3 #de850b (globals.css:45), a GRADIENT STOP, not a text token: 2.79:1 on paper-1, 2.54:1 on paper-0 (needs 4.5:1 at 12px). Same misuse: DashboardClient 2683 ('Add Presets' link), 5030 (prompt-viewer 'Copy' button), 3819/3847 (icons); text-amber-500 = --a-g2 #ef9f1f at 1.96–2.16:1: StatsPanel.tsx:379 streak flame icon, TutorPanel.tsx:337 Sparkles, DashboardClient 3876 active quiz numeral (20px display italic — below WCAG large-text size, so needs 4.5:1, has 2.16). Grep finds 21 total text-amber-500/600 call sites. The system already ships --accent-text-strong #a15e03 = 4.60–5.06:1 for exactly this ('text on washes, active states', globals.css:106).
- Impact: The settings lock warnings, the Add-Presets link, the streak flame, and the active question numeral all render as pale orange ghosts on paper — they look faded/disabled rather than accented, and they fail AA. Under the graphite accent the same classes suddenly turn near-black (#37312a, 12.73:1), so the visual weight of these elements swings wildly across accents — a token-discipline break, not just a contrast bug.
- Fix: Global sweep: every `text-amber-500`/`text-amber-600` that colors text or a meaning-bearing glyph becomes `text-(--accent-text-strong)` (or --accent-text for large display numerals); reserve --a-g1/2/3 for fills, gradients, dots, and bars. 21 call sites across DashboardClient, StatsPanel, TutorPanel, tutor/[id]/page.tsx.
- Verified: Grep confirmed 21 non-hover text-amber-500/600 call sites (finding claimed ~20). Opened each cited line: all real. Corrected two mislabeled sites: 4732/4818 are 'Settings locked' warnings (not section eyebrows) and 5030 is the 'Copy' button (not 'Manage'). Recomputed ratios from tokens: #de850b = 2.79/2.54:1, #ef9f1f = 2.16/1.96:1, graphite #37312a = 12.73:1, #a15e03 = 5.06/4.60:1 — all match. Also tightened the quiz-numeral claim: 20px non-bold is below WCAG's large-text threshold, so the bar is 4.5:1, making the failure worse than originally stated.

**CC-4 · P0 · effort:small — Amber is the ONLY accent whose --accent-text fails AA (3.09–3.40:1) — the default accent has the worst link legibility of all five**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/globals.css:105`
- Evidence: --accent-text: #c97706 ('quiet links, wordmark italic') = 3.09:1 on paper-0, 3.40:1 on paper-1. Used for 12–12.5px links: DashboardClient 2668 `text-(--accent-text)` 'Verwalten/Manage', 2874 library expand-all control. Recomputed for the other accents' --accent-text on paper-0: slate #47698f = 5.14, eucalyptus #3c7a63 = 4.56, heather #75589a = 5.24, graphite #4e4638 = 8.40 — all pass; ink-theme tunings are ~9–12 (amber #f0ac42 = 9.07, slate #a9c4e0 = 9.89). Only amber, the default, is below 4.5:1 — and the four other paper accents already set accent-text equal to accent-text-strong (globals.css 229/237/245/253).
- Impact: Out of the box (amber accent, paper theme), every quiet accent link fails AA while a user who happens to pick slate or heather gets compliant links — the default configuration is the app's worst. The brand wordmark 'Master' italic (15px, weight 560) sits on the same token.
- Fix: Darken paper-theme amber --accent-text to #a15e03 (already shipped as --accent-text-strong, 4.60/5.06:1) — matching the pattern of the four other accents, which already set accent-text == accent-text-strong. If a lighter wordmark tint is wanted for the brand only, keep #c97706 as a dedicated --brand-italic token so links stop inheriting it.
- Verified: Read globals.css 105 and all four other paper accent blocks (226–256): confirmed amber is the only paper tuning where --accent-text ≠ --accent-text-strong. Recomputed every ratio: 3.09/3.40 amber, 5.14/4.56/5.24/8.40 for the others, 9.07/9.89 for ink spot-checks — all match. Confirmed the 12px/12.5px link call sites at DashboardClient 2668 and 2874.

**CC-5 · P0 · effort:medium — Accent discipline is broken: amber leaks into lock warnings, decorative button/header icons, the fail-flow CTA, a teaser card, and a competing selected-state language**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:4141`
- Evidence: globals.css:9–10 states: 'Accent appears ONLY on: brand mark · the primary action · due-now signals · the earned pass moment.' Violations: decorative icons on secondary controls — `<VideoCameraIcon className="w-4 h-4 text-amber-600" />` inside the archive modal's 'Watch' btn-secondary (4141), DocumentTextIcon in the feedback modal sub-header (4187), CalendarDaysIcon in the calendar modal's subscribe button (4357); the 'Settings locked while AI generation is in progress' warnings in text-amber-600 (4732, 4818); the FAIL-flow remediation link carries `<SpeakerWaveIcon className="w-4 h-4 text-amber-600" />` inside 'Play pre-lecture audio', rendered only when !gradingResult.isPass (3845–3848); marketing teaser `<SparklesIcon ... text-amber-500 ... />` in the locked 'Live Tutor Pro — Coming soon' card (2096); and selection states: the stats semester filter uses `chip-amber` when selected (StatsPanel.tsx:437/448) and the tutor toggle uses `bg-(--accent-wash-soft) text-(--accent-text-strong)` when active (3586) — while the system's own nav and segmented control express selection as paper+ink (globals.css:655-660, 673-679).
- Impact: The one-scarce-accent premise is the design system's core move; each leak devalues the moments that are supposed to own the color (due-now, the pass thread). Amber inside the FAILURE flow actively contradicts 'earned pass moment'. Two coexisting selected-state grammars (paper-card selection in nav/segmented vs amber-wash selection in stats/tutor toggle) reads as two different apps.
- Fix: Demote decorative icons and the lock warnings to ink-600/ink-400 (post ink-400 fix); make the fail-flow audio icon ink-600 or clay; give the teaser sparkle ink-400; unify selection on the paper+ink pattern (bg-paper-1 + hairline border + ink-900, as segmented-item already does), reserving chip-amber strictly for due-count badges.
- Verified: Read the stated rule at globals.css 9–10 and opened every cited violation line — all real. Corrected two characterizations: 4141 is an icon in the archive modal's 'Watch' secondary button (not a modal header), and 4732/4818 are lock warnings (not section eyebrows). Confirmed the fail-flow audio link renders only under !gradingResult.isPass (guard at 3845), the teaser sparkle at 2096, chip-amber selection at StatsPanel 437/448, the tutor toggle's amber active state at 3586, and that nav-item-active/segmented-item[data-active] use paper+ink with no accent (globals 655–660, 673–679).

**CC-6 · P1 · effort:small — --ink-300 (1.73–1.90:1 on paper) is used for real words and for idle icon buttons, not just decoration**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:542`
- Evidence: `<p className="text-ink-300 text-sm">{de ? "Noch keine Daten." : "No data yet."}</p>` — #c4baa9 on paper-1 = 1.90:1, on paper-0 = 1.73:1. Also words at 8–10px: weekday gutter `text-[8px] text-ink-300` (StatsPanel 496), 'kein Brief / no brief' at 9px (DashboardClient 4260), timeline footnotes at text-[10px] (3260, 3315) and 'Auto-translated' (4288). And .btn-ghost-icon's idle color is var(--ink-300) (globals.css:528) — interactive glyphs need 3:1 (WCAG 1.4.11), have 1.73–1.90 (ink theme: 2.14–2.36).
- Impact: An entire empty-state message and several status captions are borderline invisible on paper; close/trash/expand ghost buttons don't read as present until hovered — users miss that a control exists at all.
- Fix: Reserve ink-300 for genuinely decorative marks (dividers, dashes, idle numerals). Move all words to ink-400-after-darkening or ink-600 ('No data yet.' should match the panel's other empty states, which correctly use text-ink-600 — see StatsPanel 355, 370). Raise .btn-ghost-icon idle to ink-400 so icons clear ~3:1 after the ink-400 fix.
- Verified: Opened every cited line: StatsPanel 542 ('Noch keine Daten.' in text-ink-300 while the sibling empty states at 355/370 use text-ink-600 — inconsistency confirmed), StatsPanel 496 gutter, DashboardClient 4260/3260/3315/4288 captions, and globals.css 528 (.btn-ghost-icon color: var(--ink-300)). Recomputed ratios: #c4baa9 = 1.90/1.73:1 paper, ink #5c5344 = 2.36/2.14:1 — all match the claims.

**CC-7 · P1 · effort:small — The 50–79% pass-rate band bar (--grade-mid #e0a43a) is nearly invisible: 1.87:1 against its track**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:563`
- Evidence: `mod.passRate >= 50 ? "bg-(--grade-mid)" : ...` fills a 7px bar inside a `bg-paper-2` track (line 555). Recomputed against the actual track paper-2 #f1ece2: #e0a43a = 1.87:1 (and 2.18:1 vs the paper-1 card) — under the 3:1 required for meaningful graphics (WCAG 1.4.11). The neighbors pass: sage #5e7d58 = 3.92:1, clay #b06a4e = 3.55:1 vs the same track. Ink theme is fine (#e3ac4c = 9.11:1 vs ink paper-2 #161210).
- Impact: The warning band — exactly the modules a student should worry about — is the one bar you can barely see on paper theme. A module at 65% reads at a glance like an empty track next to crisp sage and clay bars; the three-tier encoding silently degrades to two tiers.
- Fix: Darken paper --grade-mid toward ~#b87f1e (2.93:1 vs the paper-2 track, 3.42:1 vs the paper-1 card) and/or add a 1px `color-mix(in srgb, var(--grade-mid) 55%, transparent)` border like the grade washes use, so the band clears 3:1 against its surroundings. Keep the ink-theme value as is.
- Verified: Read StatsPanel 555–563: fill and bg-paper-2 track confirmed. Corrected the finding's math — it computed against --track #ebe5d8 (1.75:1) but the actual track is paper-2 #f1ece2, giving 1.87:1; the conclusion is unchanged (far below 3:1 while sage 3.92 and clay 3.55 pass). Verified ink theme passes (9.11:1) and recomputed the proposed fix color (2.93/3.42:1).

**CC-8 · P1 · effort:small — text-ink-500 references a token that doesn't exist — the 'passed' level-timeline labels silently render unstyled**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3241`
- Duplicate-of/with: TY-1
- Evidence: `${current ? "text-(--accent-text-strong) font-semibold" : passed ? "text-ink-500 font-medium" : "text-ink-300 font-medium"}` — the @theme block defines only --color-ink-900/-600/-400/-300 (globals.css:31–34), so Tailwind 4 never generates a `text-ink-500` utility; the class is a no-op and the span inherits the ambient body color (--foreground = ink-900).
- Impact: The timeline's three-state hierarchy (current = accent, passed = mid, future = faint) collapses: passed labels inherit full-strength ink-900 and end up visually HEAVIER than the current level's label, inverting the intended emphasis on the earned position.
- Fix: Use `text-ink-600` (the closest existing step) — or, if a true mid-step is wanted between 600 and 400, add `--color-ink-500` to @theme plus per-theme values. Grep confirms line 3241 is the only ink-500 reference in the repo.
- Verified: Grep across src/: 'ink-500' appears exactly once, at DashboardClient 3241. Read globals.css @theme (lines 31–34): only 900/600/400/300 are registered, so Tailwind 4 emits no CSS for the class — confirmed no-op. No ancestor in the stepper sets a text color, so the span inherits body's ink-900 foreground, which inverts the passed/current hierarchy as claimed. (Note: the typography batch reports the same defect — flagging for cross-batch dedup, but it is unique within this batch.)

**CC-9 · P1 · effort:small — Heatmap level 1 is indistinguishable from an empty day: 1.00:1 luminance against --chart-zero on paper**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:307`
- Evidence: heatColor: `if (count === 1) return "bg-(--accent-heat-1)"` where --accent-heat-1 = 28% of --a-g2 (globals.css:119). Composited over the paper-1 card: #fbe3bd vs empty cell --chart-zero #ece6da = 1.00:1 — identical luminance, hue-only difference. Graphite accent: #cdcac4 vs #ece6da = 1.32:1 (gray vs gray-beige, nearly no hue delta either). Ink theme heat-1 = 1.73:1 vs #2a241c. The legend swatches (526–530) sit adjacent and are equally close.
- Impact: 'Studied once' vs 'didn't study' — the single most motivating distinction in a streak heatmap — is invisible to anyone with reduced color vision and genuinely squint-inducing for everyone on paper theme; under graphite it effectively disappears. Fails WCAG 1.4.11 for meaningful graphics (3:1).
- Fix: Luminance alone can't carry this step at any plausible wash (even a 40% mix only reaches 1.1:1), so encode activity with more than hue: give non-zero cells a hairline `border: 1px solid color-mix(in srgb, var(--a-g3) 35%, transparent)`, and make --chart-zero slightly darker/cooler (~#e6e0d2) to open distance. Steepen heat-1 to ~40% as a supporting move.
- Verified: Read heatColor (StatsPanel 304–311) and the legend (524–531); card is card-surface = paper-1, empty cells --chart-zero #ece6da. Recomputed composites myself: 28% #ef9f1f over #fffefb = #fbe3bd → 1.00:1 vs chart-zero (exact match); graphite composite #cdcac4 → 1.32:1; ink composite → 1.73:1 — all match. Corrected the recommendation: the original led with 'heat-1 → 40% mix', but that still only yields 1.1:1, so the border/darker-zero moves are the load-bearing fix.

**CC-10 · P2 · effort:small — body's Tailwind selection classes silently override the design-system ::selection token (20% vs the specified 30%)**
- Status: ⏳ open
- Where: `src/app/layout.tsx:118`
- Evidence: `<body className="... selection:bg-amber-500/20 selection:text-ink-900">` — Tailwind 4's selection variant emits `&::selection, & *::selection` in the utilities layer, which beats the base-layer token rule in globals.css:365–368 `::selection { background: color-mix(in srgb, var(--a-g2) 30%, transparent); color: var(--ink-900); }` (annotated 'CRAFT.md §1') regardless of specificity, because utilities cascade after base. The globals rule never applies to anything inside body.
- Impact: Text selection renders a third lighter than the system specifies, and there are now two competing sources of truth: anyone tuning the CSS token will see no change in the app and burn time hunting the ghost override.
- Fix: Delete `selection:bg-amber-500/20 selection:text-ink-900` from the body className; the globals.css ::selection rule (already theme/accent aware) takes over.
- Verified: Confirmed both rules exist: layout.tsx:118 body classes and globals.css 365–368 (inside @layer base, which Tailwind orders before utilities — so the utility wins by layer order, not specificity; adjusted the mechanism wording accordingly). Both resolve through --a-g2 so the visible difference is exactly the 20% vs 30% wash strength plus a dead token. Real but subtle — low severity is right.

**CC-11 · P2 · effort:small — ScribbleCanvas draws in Tailwind stone-900 (#1c1917), not the app's ink, and paints a max-glare #ffffff pad in the dark theme**
- Status: ⏳ open
- Where: `src/app/components/ScribbleCanvas.tsx:27`
- Evidence: `const INK = "#1c1917"; // warm near-black, matches the app's ink tones` — but --ink-900 is #211b12; #1c1917 is Tailwind's cool stone-900, so the comment is false. Line 70 `ctx.fillStyle = "#ffffff"` plus line 223 `bg-white` put a pure-white rectangle inside the espresso ink theme (#1b1713 page) — the only on-screen #fff surfaces in the app (the sketch thumbnail at DashboardClient 3965 shares the same bg-white; the design's whitest paper is #fffefb).
- Impact: During a late-night ink-theme quiz, opening the scribble pad fires a full-brightness white flash; and the stroke color is subtly cooler than every other black in the UI — a felt-but-not-named wrongness on the paper theme.
- Fix: Set INK = "#211b12" and fill/`bg-` with #fffefb (paper-1). The export constraint in the header comment ('dark-mode UIs must not leak into the export') is preserved — the pad stays a light fixed-color surface for the grader, just the app's own warm white. Update the thumbnail at DashboardClient 3965 to match. Optionally soften the ink-theme presentation with a stronger border around the pad.
- Verified: Read ScribbleCanvas lines 27, 70, 223: all three literals confirmed, and the comment's 'matches the app's ink tones' is factually wrong (#1c1917 = Tailwind stone-900 vs --ink-900 #211b12). Grep for white surfaces found one additional companion call site (bg-white sketch thumbnail, DashboardClient 3965) and confirmed the only other #ffffff uses are the print-only palette — added the thumbnail to the fix. The header comment's export rationale is acknowledged; the fix keeps the pad light, so no conflict.

**CC-12 · P2 · effort:small — Tutor brief page drifts from the system: brand italic in text-amber-600 and a default gray Tailwind shadow-sm on the copy button**
- Status: ⏳ open
- Where: `src/app/tutor/[id]/page.tsx:47`
- Duplicate-of/with: IA-16
- Evidence: `Tutor <em className="font-display italic text-amber-600">Prompt</em>` — every other brand italic uses text-(--accent-text) (DashboardClient 2013/2042, LoginClient 72/77); #de850b here is also 2.79:1 on paper-1. And copy-button.tsx line 29 uses `shadow-sm` — Tailwind's neutral gray shadow — while globals.css:83 declares 'Warm-tinted elevation (never gray)' and every other control uses the themed --shadow-e1.
- Impact: The shareable/server-rendered page — the one surface teammates or externals may see — is the least on-brand: a paler, non-compliant brand accent and the app's only cold gray shadow. Small, but it's precisely the kind of edge-of-product drift a craft-obsessed team catches.
- Fix: page.tsx:47 → `text-(--accent-text)` (after the accent-text darkening in the earlier finding); copy-button.tsx:29 → replace `shadow-sm` with `shadow-(--shadow-e1)` (or adopt btn-secondary wholesale).
- Verified: Read page.tsx:47 and copy-button.tsx:29: both literals confirmed. Grep confirmed all three other brand-italic call sites use text-(--accent-text) (DashboardClient 2013/2042, LoginClient 72), so this is genuine drift, not a deliberate second treatment. Recomputed #de850b = 2.79:1 on paper-1. Confirmed the 'Warm-tinted elevation (never gray)' comment at globals.css:83. (The shadow-sm half also appears in the elevation-shadows batch — cross-batch overlap noted for the parent's dedup.)


### Elevation, shadows & surfaces (18)

**EL-1 · P0 · effort:small — The signature hover-shadow cross-fade is silently clipped to invisibility on the app's primary card (due cards) and both grading-result cards**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2299`
- Evidence: Due card: `className="card-surface-elevated group cursor-pointer relative overflow-hidden pl-[26px]…"` (2299); also `card-surface-elevated p-7 md:p-8 relative overflow-hidden` (3760) and `card-surface-elevated overflow-hidden` (3817). The hover shadow lives on a pseudo-element: globals.css 422–431 `.card-surface-elevated::after { position:absolute; inset:-1px; box-shadow: var(--shadow-e2-hover); opacity:0; …}`. `overflow:hidden` clips the ::after descendant — its outward box-shadow renders entirely outside the card bounds, so nothing of it survives the clip.
- Impact: On the single most important interactive surface in the app — the 'Due today' card you tap to start a quiz — hovering produces the framer −1px lift (line 2295 `whileHover={{ y: -1 }}`) and a border darken, but the promised e2→e2-hover shadow deepen never appears. The card lifts without its shadow responding, which reads as a rendering glitch rather than physicality; meanwhile non-clipped elevated cards (upload form at 2663, tutor brief page) deepen correctly, so the flagship hover pattern behaves differently card to card.
- Fix: Remove `overflow-hidden` from these three cards and clip the amber thread itself instead (it already has `border-radius:999px` and its `top-3.5 bottom-3.5` inset avoids the 18px corners). Where clipping is truly needed (the 3817 card's tinted header meeting the rounded top), wrap the card's content in an inner `overflow-hidden rounded-[inherit]` div so the ::after shadow layer stays unclipped.
- Verified: Verified all three class strings at 2299/3760/3817 and the ::after rule at globals.css 422–439. CSS behavior re-derived: overflow:hidden clips descendant painting to the padding box; the ::after (inset:-1px) paints its non-inset box-shadow entirely outside the card, so the entire hover shadow is clipped, while the element's own resting e2 shadow (not a descendant) still shows — exactly the described asymmetry. Upload form (2663) confirmed unclipped, so the inconsistency between sibling elevated cards is real. Not addressed by the uncommitted mobile tweaks.

**EL-2 · P0 · effort:small — Login's Google button animates box-shadow directly on hover (transition-all + hover:shadow-lift), breaking the system's own no-interpolation rule**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/login/LoginClient.tsx:126`
- Duplicate-of/with: MO-3
- Evidence: `className="… transition-all cursor-pointer border border-(--line) shadow-(--shadow-e1) hover:-translate-y-px hover:shadow-(--shadow-lift) active:translate-y-0 …"`. motion.ts 9–10 states: 'Only `transform` and `opacity` ever animate. No blur transitions, no box-shadow interpolation (hover shadows cross-fade a pre-rendered layer).' globals.css 346–351 deliberately whitelists only `color, background-color, border-color, opacity, transform` for buttons — `transition-all` overrides that whitelist wholesale.
- Impact: The very first interactive element a user ever touches — the sole CTA on the branded login page — is the one place the motion system's cardinal rule is broken. The shadow tweens e1→lift on the paint path, and `transition-all` also picks up padding/width if anything ever changes them. It's also the only consumer of the `--shadow-lift` token, so the 'lift' tier of the elevation ladder exists solely to power a rule violation.
- Fix: Rebuild the hover exactly like `.card-surface-elevated`: keep `shadow-(--shadow-e1)` static, add a `::after` (or absolutely-positioned span) carrying `var(--shadow-lift)` that cross-fades opacity 0→1 on hover, and replace `transition-all` with the default whitelisted transition. Keep the −1px translate.
- Verified: Verified the full class string at LoginClient.tsx:126, the motion.ts rule (lines 9–10), and the base-layer whitelist (globals.css 346–351). Grep confirmed --shadow-lift is defined at globals.css 126/199 and consumed only here. NOTE for aggregation: the motion dimension carries the same finding (same line) — merge on assembly; this copy adds the sole-consumer-of---shadow-lift detail.

**EL-3 · P1 · effort:medium — Modal backdrop blur pops in after the fade instead of being 'static': backdrop-filter can't composite while its animated ancestor has opacity < 1**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4111`
- Evidence: Every modal scrim is a child of the fading container: `<motion.div {...overlayMotion} …><div className="fixed -inset-6 -z-10 bg-(--overlay) backdrop-blur-[3px]" …/>` (4111, 4163, 4327, 4440, 4906, 4955, 5011). overlayMotion (motion.ts 88–93) animates the parent's opacity 0→1 over 180ms. Per the CSS Filter Effects backdrop-root rules (implemented in Chromium/WebKit), an ancestor with opacity < 1 forms a new backdrop root, so the child's `backdrop-blur-[3px]` cannot sample the page behind it during the fade — the blur snaps on only when the parent reaches opacity 1, and cuts off instantly at the start of exit.
- Impact: The design's own note says 'Backdrop blur is a STATIC style, never animated' (motion.ts 86), but the effective result is worse than animating it: the tint fades smoothly, then the 3px blur appears as a discrete pop ~180ms later on all seven modals. It's the kind of two-stage settle a perfectionist eye reads as jank on every single dialog open.
- Fix: Move `bg-(--overlay) backdrop-blur-[3px]` onto the opacity-animated element itself (backdrop-filter keeps compositing while the element's own opacity animates — the standard overlay pattern), and give the modal panel its own sibling motion wrapper rather than nesting it inside the fading scrim container.
- Verified: Verified the DOM structure at all seven cited lines: the backdrop-blur scrim is a plain child of the overlayMotion-animated motion.div in every modal, and overlayMotion animates opacity over 0.18s (motion.ts 88–93). The rendering claim is spec-backed (Filter Effects L2 backdrop root: ancestor opacity < 1 restricts what backdrop-filter samples) and matches well-documented Chromium behavior; not re-tested visually in a browser here, but the code precondition is fully confirmed.

**EL-4 · P1 · effort:medium — z-index inversion: the tutor chat panel (z-70) and the floating quiz control bar (z-60, body portal) both render above the settings modal and its scrim (z-60)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4437`
- Evidence: Settings modal: `className="fixed inset-0 flex items-center justify-center p-4 z-[60]"` (4437), rendered inline in the app tree. TutorPanel: `fixed inset-y-0 right-0 z-[70] …` portaled to document.body (TutorPanel.tsx 290/299). Interactive control bar: `fixed bottom-… z-[60]` also portaled to `document.body` (3636–3642), so at equal z it paints after (above) the inline modal. The sidebar's settings button (2066–2069) is reachable while the quiz tab, tutor panel, and interactive mode are all active, and nothing closes the panel when the modal opens (setShowTutorPanel is only called at 1521, 3585, 3624).
- Impact: Open the tutor chat during a quiz, then click Settings in the sidebar: the modal's full-viewport scrim dims everything except the chat panel, which stays fully bright, interactive, and — on a 1280px laptop (modal right edge ≈ 920px, panel starts at 904px) — physically overlaps the dialog. Likewise the play/pause pill floats undimmed above the scrim during interactive mode. A blocking modal that fails to subordinate other chrome breaks the elevation story at its most literal level.
- Fix: Give modals a tier above all non-modal chrome (e.g. panels/floating bars at 60–70, all modal scrims at 80+, keeping toasts at 100 and tooltips at 200), or close/suppress the tutor panel and control bar while a modal is open. Document the ladder as tokens (--z-panel, --z-modal, --z-toast, --z-tip) so tiers can't drift.
- Verified: Verified all three z values and both createPortal(…, document.body) calls; verified the settings nav button opens the modal from any tab and that no code path closes the tutor panel or stops interactive mode when the modal opens. Geometry recomputed: max-w-[560px] centered on 1280px → right edge 920px; panel sm:w-[376px] → left edge 904px → 16px overlap. Equal-z paint-order argument holds because the portal nodes are appended to body after the app root.

**EL-5 · P1 · effort:small — Stats stat-cards hand-roll an e2 surface instead of using card-surface-elevated — and the loading skeleton renders the same grid at e1 with a different gap, so the page visibly shifts on load**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:461`
- Evidence: Loaded: `className="bg-paper-1 border border-hairline-card rounded-[18px] p-5 shadow-(--shadow-e2)"` inside a `gap-3.5` grid (457). Skeleton for the same four cards: `className="card-surface p-5"` (325) inside `grid … gap-4` (323) — card-surface is e1, and the comment at 319 claims the skeleton 'mirrors the final layout, so nothing jumps'. The skeleton also carries `style={{ animationDelay: `${i * 120}ms` }}` with no animation defined anywhere — a dead remnant of a staggered pulse that never runs.
- Impact: Every visit to Stats: cards materialize at a different elevation (e1→e2) and the grid gutter shrinks 16px→14px, a small but perceptible reflow that contradicts the skeleton's stated purpose. Once loaded, these are the only e2 surfaces in the app without the elevated-card behavior (no hover border response, no ::after cross-fade layer), so the elevation ladder's one bespoke clone drifts from the system.
- Fix: Use `card-surface-elevated p-5` for the loaded stat cards, make the skeleton use the identical class and `gap-3.5`, and either delete the dead `animationDelay` or restore the intended staggered pulse (e.g. an opacity keyframe on the placeholder bars).
- Verified: Verified lines 457/461 (hand-rolled e2 clone, gap-3.5) vs 323/325 (card-surface e1 skeleton, gap-4) and the comment at 319. Grepped the repo: no pulse/skeleton animation exists anywhere, so animationDelay is provably dead; and StatsPanel:461 is the only raw `shadow-(--shadow-e2)` consumer outside the utility classes, confirming the 'only bespoke e2 clone' claim. `border-hairline-card` is a valid token (@theme --color-hairline-card), so the clone renders correctly — the drift is elevation/gap, not border.

**EL-6 · P1 · effort:small — Active quiz-task card tweens box-shadow and ring via transition-all duration-300 as voice focus moves between cards**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3867`
- Duplicate-of/with: MO-4, LS-3
- Evidence: `className={`card-surface-elevated p-[22px] md:px-[26px] transition-all duration-300 ${ … ? "!border-(--accent-border-strong) ring-[3px] ring-(--accent-wash) shadow-[0_20px_48px_-20px_color-mix(in_srgb,var(--a-g3)_28%,transparent)]" : …}`}` — in Tailwind 4 both `ring-*` and `shadow-[…]` compile to `box-shadow`, and `transition-all` makes that box-shadow interpolate over 300ms every time `interactive.currentIndex` changes.
- Impact: During interactive voice mode the accent glow and 3px ring morph paint-side from card to card — precisely the box-shadow interpolation the motion system bans (motion.ts 9–10), on a large 20px-blur shadow, repeatedly through a session. The `0_20px_48px_-20px` accent shadow is also an ad-hoc value outside the e1/e2/e3/accent-glow ladder, and 300ms is not a DUR token (120/240/320).
- Fix: Constrain the transition to `transition-[opacity,border-color] duration-300` and put the ring+glow on a pre-rendered ::after/inner layer that cross-fades opacity (same pattern as card-surface-elevated). Consider promoting the accent focus shadow to a token (e.g. --shadow-focus-accent) since it is a legitimate 'due-now/active' accent signal.
- Verified: Verified the exact class string at 3867–3873, the state-driven toggle on interactive.currentIndex, and that Tailwind 4 rings compose into box-shadow (so transition-all does interpolate it). Ad-hoc shadow value confirmed absent from the token ladder; 300ms confirmed off the DUR scale. NOTE for aggregation: the motion dimension carries an equivalent finding at the same line — merge; this copy adds the off-ladder shadow-token point.

**EL-7 · P1 · effort:medium — Hover affordance is baked into all card surfaces, so static cards (All-clear, grading progress, upload form, results, quiz answer cards, tutor brief, Stats charts) respond like buttons**
- Status: ⏳ open
- Where: `src/app/globals.css:406`
- Evidence: `.card-surface:hover { border-color: var(--line); }` (406–410) and `.card-surface-elevated:hover { border-color: var(--line) } / :hover::after { opacity: 1 }` (432–439) apply unconditionally to every consumer. Non-interactive consumers verified: the 'All clear' card (DashboardClient 2249), grading-progress hero (3697), upload form card (2663), results card (3760), quiz answer cards (3867), tutor brief page (tutor/[id]/page.tsx 64), and every Stats chart card (StatsPanel 486, 537, 577, 623) all darken their border and/or deepen their shadow on hover.
- Impact: The one card where hover genuinely means 'you can tap me' — the due card — shares its hover language with a dozen inert surfaces, so the affordance carries no information. Mousing across the dashboard makes empty-state and chart panels twitch their borders, which feels busy against the system's own 'invisible until touched' philosophy (motion.ts 6) where 'touched' should mean actionable.
- Fix: Split the hover response out: keep `.card-surface`/`.card-surface-elevated` inert, and add `.card-interactive` (or gate on `[data-interactive]`/`:is(a,button)` wrappers) that owns border-darken + ::after cross-fade + lift. Apply it only to due cards, library rows, archive rows, and theme cards.
- Verified: Verified both unconditional :hover rules in globals.css (correctly gated behind @media (hover:hover), so desktop-only — impact statement remains fair) and spot-checked every listed consumer line: all are genuinely non-interactive surfaces carrying the class. No opt-out mechanism exists in the codebase.

**EL-8 · P1 · effort:small — ember-pulse — the app's one sanctioned ambient loop — animates box-shadow spread in a keyframe, violating the transform/opacity-only rule inside the token file itself**
- Status: ⏳ open
- Where: `src/app/globals.css:866`
- Evidence: `@keyframes ember-pulse { 0%,100% { opacity:1; box-shadow: 0 0 0 0 color-mix(in srgb, var(--a-g2) 35%, transparent); } 50% { opacity:0.75; box-shadow: 0 0 0 5px transparent; } }` (866–875) — an infinite 2s box-shadow interpolation via `.ember-dot` (734–735), used on upload/grading step indicators (DashboardClient 2652, 3733), the dashboard's in-progress dot (2478), and the tutor 'thinking' dot (TutorPanel 395), sometimes running for a minute-plus while grading.
- Impact: Every frame of the pulse repaints a shadow rather than compositing a transform — precisely the cost the motion rules exist to avoid, and it runs during the two longest waits in the product (upload pipeline, grading) when the main thread is already busy streaming progress. Rule-breaking in globals.css also licenses call sites to do the same (see the other box-shadow findings).
- Fix: Rebuild the pulse as a `::after` ring: a bordered pseudo-element that animates `transform: scale(1→2)` + `opacity: .35→0` — visually identical sonar effect, compositor-only. `.ember-dot` keeps its opacity beat.
- Verified: Verified the keyframes at 866–875, the .ember-dot binding at 734–735, and all four call sites (2478, 2652, 3733, TutorPanel 395). Also confirmed the reduced-motion block (globals 923) disables it, so the finding is purely about the rule violation + repaint cost during long waits, not accessibility.

**EL-9 · P1 · effort:small — Modal close buttons are five different components: radii, fills, and hover treatments drift per modal — two even have a no-op hover**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4122`
- Duplicate-of/with: IS-14
- Evidence: Archive/feedback: `w-8 h-8 rounded-full bg-paper-2 hover:bg-paper-2 …` (4122, 4178 — hover fill identical to resting fill, so the background gives zero hover feedback); prompts modals: `w-8 h-8 … rounded-[10px] … hover:bg-(--hairline)` (4921, 4983); prompt viewer: `w-8 h-8 … rounded-lg bg-paper-2 hover:bg-paper-2 … transition-all` (5037 — third no-op hover); calendar: bare `p-2` text button, no fill or radius (4338); settings: a fifth variant, `p-2 hover:bg-paper-2 rounded-full` with transparent resting fill (4458). Modal header dividers likewise alternate `border-(--hairline-card)` (4117, 4170, 5018) and `border-(--hairline)` (4913, 4962).
- Impact: The most repeated control in the overlay layer renders differently in every dialog — circle vs 10px vs 8px square vs naked icon — and in three modals hovering it changes only the icon color because `hover:bg-paper-2` equals the resting `bg-paper-2`. Users see this control constantly; the inconsistency and dead hovers cheapen the modal layer as a whole.
- Fix: Extract one `ModalClose` (suggest: `w-8 h-8 rounded-[10px] btn-ghost-icon`, which already defines hover fill+color and press scale) and use it in all seven modals; standardize modal header dividers on `--hairline-card`.
- Verified: Verified every cited close-button class string and both divider variants. Corrected the original evidence: settings (4458) is not the same bare button as calendar (4338) — it is a fifth distinct variant (rounded-full + hover fill), which strengthens the drift claim from four variants to five. The no-op hover:bg-paper-2 on resting bg-paper-2 is real at 4122, 4178, and 5037.

**EL-10 · P1 · effort:small — Tutor page copy button ships the only cool-gray shadow in the product: Tailwind default shadow-sm instead of the warm e1 token**
- Status: ⏳ open
- Where: `src/app/tutor/[id]/copy-button.tsx:29`
- Evidence: `className="group inline-flex items-center gap-2 rounded-xl border border-(--line) bg-paper-1 px-5 py-2.5 … shadow-sm transition hover:border-(--accent-border) …"`. Tailwind 4's `--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` — pure black at 10%, versus the system's paper e1 `rgba(50, 38, 20, 0.04)` (globals.css 84) under the explicit comment 'Warm-tinted elevation (never gray)' (globals.css 83). The bare `transition` utility also re-adds box-shadow to the transition list the base layer deliberately excludes.
- Impact: On the warm paper ground the black shadow reads colder and heavier than every other resting element; in ink theme it stays a light-mode gray instead of switching to the theme-tuned dark shadows like all e-tokens do (globals.css 184–199). Because this page is server-rendered and shareable, it's a public-facing surface where the palette discipline visibly slips. This is effectively a hand-rolled .btn-secondary that drifted.
- Fix: Replace with `btn-secondary` (which already provides paper-1 bg, --line border, e1 shadow, correct press state), or at minimum swap `shadow-sm transition` for `shadow-(--shadow-e1)` and the default transition whitelist.
- Verified: Verified the class string at copy-button.tsx:29 and the 'never gray' comment at globals.css:83–84. Grep confirmed this is the only shadow-sm/md/lg utility in src/ — the 'only cool-gray shadow in the product' claim is literally true. Theme-tuning gap confirmed: all e-tokens re-tune under [data-theme=ink]; shadow-sm does not.

**EL-11 · P1 · effort:small — Radius drift on the recurring icon-tile pattern (12/16/16/18px for the same squircle) and chart bar tops (5/6/8px within one Stats page)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2229`
- Evidence: Empty-state/progress icon tiles: `w-[52px] h-[52px] rounded-2xl` (16px — 2229, 2899, 2922, StatsPanel 364) vs `w-16 h-16 rounded-[18px]` (2611, 3698) vs `w-12 h-12 rounded-xl` (12px — dropzone, 2716) vs `w-12 h-12 rounded-2xl` (16px — TutorPanel 336, StatsPanel 352). Same Stats page, bar-chart tops: `rounded-t-[5px]` (StatsPanel 596) vs `rounded-t-lg` (8px, 651), skeleton `rounded-t-md` (6px, 337). One-off `rounded-[9px]` on the sign-out button (2131) beside 10px-radius neighbors (btn-ghost-icon, chips, brand-tile are all 10px).
- Impact: These tiles and bars are the same element repeated across screens; four different corner treatments make the pattern feel assembled rather than designed. The two adjacent bar charts on Stats visibly disagree about their cap radius. Off-ladder values (16, 6, 9) also mean the de facto radius ladder in globals.css (5/8/10/12/13/14/18/22) no longer describes the product.
- Fix: Pick one tile mapping (e.g. 48px tile → 12px, 52px → 14px, 64px → 18px) and apply it everywhere; unify chart bar caps at one value; change rounded-[9px] → rounded-[10px]. Consider registering the scale as Tailwind theme radii so arbitrary values stand out in review.
- Verified: Verified every cited call site by reading the code: 2229/2899/2922/StatsPanel 364 (52px+16px), 2611/3698 (64px+18px), 2716 (48px+12px), TutorPanel 336 + StatsPanel 352 (48px+16px), StatsPanel 596 vs 651 vs 337 bar caps, and 2131 rounded-[9px]. Softened the original 'stated scale' wording: no doc formally declares a radius scale, but the globals.css utility classes form a consistent de facto ladder (kbd 5, tip 8, chip/ghost/brand 10, nav/input 12, segmented 13, input-inset 14, card 18, glass 22) that these values fall outside.

**EL-12 · P1 · effort:small — Due card lacks the press state the system promises — whileHover without whileTap on the app's primary tap target; hoverLift preset exists but is never used**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2295`
- Duplicate-of/with: MO-11, IS-1, MT-5
- Evidence: Due card: `whileHover={{ y: -1 }} transition={springSoft}` with `onClick={() => startQuiz(review)}` (2292–2299) — no `whileTap`. motion.ts 129–140 defines both `pressable` and `hoverLift = { whileHover: { y: -1 }, whileTap: { scale: 0.985 }, … }` ('presses 120ms scale 0.985' per the header rules), and `hoverLift` has zero call sites in the codebase.
- Impact: Tapping a due card — the single action the whole product funnels toward — gives no physical acknowledgment before the tab switches, while every button, chip, and even list rows (`.press-row`, globals.css 784) compress or darken on press. On touch devices (no hover) the card gives no feedback at all. The unused `hoverLift` export shows this card was meant to use the full preset and drifted to a hand-rolled half.
- Fix: Replace the inline props with `{...hoverLift}` on the due-card motion.div.
- Verified: Verified 2292–2299 (whileHover present, whileTap absent, onClick starts the quiz), the hoverLift definition at motion.ts 136–140, grep confirming zero hoverLift consumers, and .press-row/.btn-ghost-icon press states in globals.css 780–786. One correction to the original: the theme-preview buttons (4483) DO have whileTap (0.98), so only the due card is missing press feedback. NOTE for aggregation: the motion dimension carries the same finding at the same line — merge.

**EL-13 · P2 · effort:small — Undo toast duplicates the tooltip's hardcoded shadow literal; neither is tokenized nor theme-tuned like every other shadow**
- Status: ⏳ open
- Where: `src/app/components/Toast.tsx:92`
- Evidence: Undo pill: `shadow-[0_6px_16px_-6px_rgba(33,27,18,0.4)]` — byte-identical to `.tip-bubble { box-shadow: 0 6px 16px -6px rgba(33, 27, 18, 0.4); }` (globals.css 827). Every other shadow lives in a themed variable (e1/e2/e3/lift all switch to black-based values under `[data-theme="ink"]`, globals.css 184–199); these two stay frozen at the paper-tinted literal in both themes.
- Impact: The two 'ink chip' surfaces (tooltip, undo bar) share a design intentionally but share it by copy-paste; retuning one will silently orphan the other. In ink theme they're also the only shadows that don't participate in the dark shadow ramp, sitting noticeably lighter than the e3 toasts they appear next to.
- Fix: Add `--shadow-ink-chip: 0 6px 16px -6px rgba(33,27,18,0.4)` in :root with an ink-theme tuning (e.g. `0 6px 16px -6px rgba(0,0,0,0.5)`), and reference it from both .tip-bubble and the undo pill.
- Verified: Verified byte-identical values at Toast.tsx:92 and globals.css:827, confirmed no [data-theme=ink] override exists for .tip-bubble or the toast literal, and confirmed all e-tokens do re-tune at 184–199 — the two frozen literals are genuinely the exceptions.

**EL-14 · P2 · effort:small — Accent swatches animate their selection ring as raw box-shadow (250ms inline transition)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4546`
- Evidence: `boxShadow: `${selected ? `0 0 0 3px var(--paper-1), 0 0 0 5.5px ${g2}` : "0 0 0 3px transparent, 0 0 0 5.5px transparent"}, inset 0 1px 0 …`` with `transition: "box-shadow 250ms cubic-bezier(0.16,1,0.3,1)"` (4544–4547).
- Impact: Selecting an accent tweens a two-layer spread shadow paint-side — a literal breach of the no-box-shadow-interpolation rule inside the very settings panel that showcases the design system. Visually it works (it's a color fade, not a blur morph), but it repaints a 40px circle + rings for 250ms and sets a precedent the codebase already follows elsewhere.
- Fix: Render the ring as an absolutely-positioned inset ::before/span (border: 2.5px solid g2, offset by the 3px paper gap) that cross-fades opacity + scales 0.9→1 on selection — same look, compositor-only, and it can share the springy check-pop already used for the CheckIcon (4550–4553).
- Verified: Verified the inline style object at 4544–4548: the two-layer selection ring lives in boxShadow with an explicit box-shadow transition. The transparent-to-color trick means it interpolates cleanly, so severity low (rule/precedent issue, not visible jank) is the right call.

**EL-15 · P2 · effort:small — Library level-progress dots tween their glow/ring shadows through transition-all**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3141`
- Evidence: 7-dot row: `w-[7px] h-[7px] rounded-full transition-all` with the current dot at `bg-(--accent-border) shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--a-g2)_40%,transparent)]` (3140–3148); interval stepper node: `w-5 h-5 rounded-full … transition-all` with current at `… border-2 border-amber-500 shadow-[0_0_8px_color-mix(in_srgb,var(--a-g2)_35%,transparent)]` (3230–3238).
- Impact: When a lecture levels up, the ring and 8px glow interpolate as box-shadow (via transition-all) instead of cross-fading — the same rule breach as the bigger cases, here in miniature. transition-all on these dots also transitions width/height/padding if any responsive class ever touches them.
- Fix: Change `transition-all` to `transition-colors` on both; the glow/ring can simply swap without a tween at this size, or move to an opacity-faded pseudo-element if the tween is wanted.
- Verified: Verified both call sites in the working tree (dot row at ~3140–3148, stepper node at ~3230–3238): both carry transition-all and state-dependent shadow classes that swap when currentLevel changes. Low severity appropriate — visible only at level-up moments on 7–20px elements.

**EL-16 · P2 · effort:small — Theme preview cards: 1.5px border on an e1 surface, hover-lift with no shadow response, and inner preview radius breaks the nesting rule**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4486`
- Evidence: `className="flex-1 … bg-paper-1 rounded-2xl p-[7px] pb-[11px] cursor-pointer shadow-(--shadow-e1)"` + `style={{ border: `1.5px solid ${selected ? "var(--a-g2)" : "var(--hairline-card)"}` …}}` (4486–4487), with `whileHover={{ y: -1 }}` (4483). Inner preview: `rounded-[11px]` (4491/4500/4509) inside outer 16px − 7px padding = 9px ideal.
- Impact: Three system deviations on one control: the only 1.5px solid card border in the app (every other card hairline is 1px, so the unselected state looks slightly thick/soft), a hover lift with a frozen e1 shadow (nothing deepens beneath the card as it rises), and inner corners (11px) rounder than the geometry allows (9px), leaving a faintly pinched corner margin. rounded-2xl (16px) is also off the app's radius ladder.
- Fix: Use `rounded-[14px]` outer with `rounded-[8px]` inner previews (nesting-correct on the app's scale), keep the border 1px and express selection with the border color + the existing check, and either drop the hover lift or pair it with the ::after shadow cross-fade.
- Verified: Verified 4483–4509: whileHover y:-1 with static shadow-(--shadow-e1) and no ::after layer; 1.5px inline border; nesting math recomputed (16−7=9px ideal vs 11px actual). Grep for '1.5px solid' found only this and the heat-cell hover outline, so 'only 1.5px card hairline' holds (chip-dashed uses 1.5px dashed, a deliberate non-hairline).

**EL-17 · P2 · effort:small — Floating interactive control bar composes its overlay surface ad hoc: inline e3 style, 18px radius plus hairline — matching neither card-glass nor the toast recipe**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3641`
- Evidence: `className="fixed … z-[60] … rounded-[18px] bg-paper-1 border border-(--hairline-card)"` with `style={{ boxShadow: "var(--shadow-e3)" }}` (3641–3642). Sibling overlay surfaces: `.card-glass` = paper-1 + 22px + e3, no border (globals.css 442–446); toasts = paper-1 + 18px + `shadow-(--shadow-e3)` class + semantic border (Toast.tsx 59).
- Impact: Three floating e3 surfaces, three recipes. The bar is closest to a toast but reaches e3 through an inline style object (invisible to a class grep of the elevation system) — exactly the drift that makes shadow audits necessary. Functionally identical, but it forfeits the single source of truth the tokens exist to provide.
- Fix: Swap the inline style for `shadow-(--shadow-e3)` and consider a small `.floating-bar` utility (paper-1, 18px, hairline-card, e3) shared with toasts so the overlay tier has one written recipe.
- Verified: Verified 3641–3642 (inline boxShadow style), .card-glass at globals.css 442–446 (22px, no border), and Toast.tsx 59 (18px, shadow-(--shadow-e3) utility, semantic border). Three distinct recipes for the same tier confirmed.

**EL-18 · P2 · effort:small — Login is the only card-glass paired with --hairline-card; all seven in-app modals use --line-soft**
- Status: ⏳ open
- Where: `src/app/login/LoginClient.tsx:107`
- Duplicate-of/with: LS-17
- Evidence: `<div className="card-glass px-[34px] py-9 border border-(--hairline-card)">` vs the seven dashboard modals, all `card-glass … border border-(--line-soft)` (DashboardClient 4115, 4167, 4330, 4443, 4911, 4960, 5015). Paper values: hairline-card = rgba(33,27,18,0.08) vs line-soft = rgba(33,27,18,0.10).
- Impact: The brand's front door draws the e3 glass surface with a fainter edge than every other instance of the same class — a 2%-alpha drift no one decided on. Because card-glass deliberately owns no border, each call site re-chooses one, and login chose differently. On the lamp-lit login backdrop the softer edge slightly under-defines the card.
- Fix: Standardize on `border-(--line-soft)` for all card-glass surfaces — or better, bake `border: 1px solid var(--line-soft)` into `.card-glass` itself so the pairing can't drift again.
- Verified: Verified LoginClient.tsx:107 and all seven modal panels (4115, 4167, 4330, 4443, 4911, 4960, 5015) carry border-(--line-soft); .card-glass (globals.css 442–446) confirmed borderless, so the pairing is re-chosen per call site. Token values recomputed from globals.css 80/124: 0.08 vs 0.10 alpha.


### Motion & animation (17)

**MO-1 · P0 · effort:small — Quiz column animates `padding` when the Tutor panel opens — layout-property animation the motion system explicitly forbids**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3529`
- Duplicate-of/with: LS-1
- Evidence: className={`max-w-4xl mx-auto transition-[padding] ${showTutorPanel ? "xl:pr-[392px]" : ""}`} — motion.ts rules: "Only `transform` and `opacity` ever animate." globals.css even scopes default transitions to "Only compositor/paint-friendly props — never layout" (line 347-350).
- Impact: On xl screens, toggling the Tutor slide-over transitions padding-right by 392px, forcing full reflow + text re-wrap of the entire quiz column (task cards, AutoGrowTextareas, whitespace-pre-wrap question bodies) on every frame of the ~150ms tween. This is the exact jank the system's first rule exists to prevent, on a screen where the user is mid-answer.
- Fix: Remove `transition-[padding]` (snap the gutter instantly, letting the panel's own 240ms slide carry the motion), or let the panel overlay content on xl like it already does below xl. If content must shift, animate a fixed-width sibling column via transform, never padding.
- Verified: Confirmed verbatim at line 3529; parent is the quiz tab motion.div (pageVariants, line 3525). Cross-checked motion.ts lines 9-10 and the globals.css transition whitelist (color/background-color/border-color/opacity/transform only). Corrected duration claim: Tailwind's default transition duration is 150ms, not ~200ms — the violation stands regardless.

**MO-2 · P0 · effort:medium — Mobile menu opens and closes with a raw display flip — the only fully unanimated surface in the app**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2035`
- Duplicate-of/with: MT-3, MT-15
- Evidence: Sidebar: className={`${showMobileMenu ? 'flex' : 'hidden'} app-shell-sidebar md:flex ...`} and main (line 2143): `${showMobileMenu ? "hidden" : "block"}`. The aside's only animation, initial={{ x: -24, opacity: 0 }} (lines 2031-2034), plays once at page mount — on mobile it plays while the aside is display:hidden, so it is never seen.
- Impact: Tapping the hamburger swaps the entire viewport content instantly, twice (menu in, content out) — the harshest state change in the app, on the platform where the app-shell entrance was already wasted. Every accordion, chevron and toast is choreographed; the primary mobile navigation pops.
- Fix: Drive the mobile menu with AnimatePresence: enter with the system's 240ms EASE_OUT rise/fade (pageVariants-style, or a y:-8 drop from the top bar), exit 200ms EASE_IN_OUT; cross-fade the Bars3/XMark icon swap on springTactile. Keep the desktop mount slide as-is.
- Verified: Confirmed: aside at 2031-2035 (mount-only slide, display flip via showMobileMenu), main hidden/block at 2143, raw icon swap at 2021. No transition utilities or AnimatePresence anywhere in the mobile-menu path. The uncommitted mobile tweaks (h-14/gap-3) do not touch this.

**MO-3 · P0 · effort:small — Login CTA interpolates box-shadow on hover via `transition-all` — direct violation of the no-shadow-interpolation rule on the first thing a user ever touches**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/login/LoginClient.tsx:126`
- Duplicate-of/with: EL-2
- Evidence: className="... transition-all ... shadow-(--shadow-e1) hover:-translate-y-px hover:shadow-(--shadow-lift) ..." — motion.ts: "No blur transitions, no box-shadow interpolation (hover shadows cross-fade a pre-rendered layer)". globals.css builds .card-surface-elevated::after (lines 422-439) precisely to avoid this.
- Impact: The Google sign-in button — the brand's first interaction — repaints a two-layer shadow every frame of every hover, while the rest of the system meticulously cross-fades pre-rendered layers. `transition-all` also transitions width/height/padding if anything ever changes them.
- Fix: Reuse the elevated-card pattern: static shadow-e1, plus an ::after with `box-shadow: var(--shadow-lift); opacity: 0` cross-faded to 1 on hover at 200ms var(--ease-cinematic); replace `transition-all` with the explicit compositor-safe property list.
- Verified: Confirmed verbatim at LoginClient.tsx:126 — transition-all with shadow-(--shadow-e1) → hover:shadow-(--shadow-lift). motion.ts rule quote and the .card-surface-elevated::after cross-fade pattern in globals.css both verified. (An elevation-dimension finding covers the same line; unique within this batch.)

**MO-4 · P0 · effort:medium — Interactive-mode card highlight cross-fades ring + 48px shadow through `transition-all duration-300`**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3867`
- Duplicate-of/with: EL-6, LS-3
- Evidence: className={`card-surface-elevated ... transition-all duration-300 ${interactive.active && interactive.currentIndex === idx ? "!border-(--accent-border-strong) ring-[3px] ring-(--accent-wash) shadow-[0_20px_48px_-20px_color-mix(in_srgb,var(--a-g3)_28%,transparent)]" : interactive.active ? "opacity-50" : ""}`} — Tailwind rings are box-shadows, so every advance interpolates two large multi-layer shadows; 300ms is also not a DUR token (120/240/320).
- Impact: Each "nächste Aufgabe" in voice mode repaints giant blurred shadows on two full-width cards simultaneously with the smooth scrollIntoView — the moment most likely to stutter on an iPad, in the app's hands-free flagship feature.
- Fix: Give the card a pre-rendered ::after (ring + deep shadow) toggled via opacity, and transition only opacity/border-color at 240ms EASE_OUT. Keep the opacity-50 dimming as-is.
- Verified: Confirmed verbatim at lines 3867-3873; ring-[3px]/shadow classes and transition-all duration-300 exactly as quoted. Verified DUR tokens in motion.ts (0.12/0.24/0.32 — no 0.3). The concurrent smooth scrollIntoView on index change confirmed at line 710.

**MO-5 · P1 · effort:small — The earned pass moment pops in raw — the result screen swaps in with zero entrance choreography**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3758`
- Duplicate-of/with: AX-5
- Evidence: ) : gradingResult ? (<div className="space-y-5"> — a bare conditional swap from the isGrading card. Only the thread animates: motion.div initial={{ scaleX: 0 }} ... delay: 0.2 (lines 3806-3809). motion.ts's own charter: "motion explains state changes and rewards completion", and globals.css reserves the accent for "the earned pass moment".
- Impact: After a minute of watching examiners deliberate, the verdict — the single most earned screen in the app — appears more abruptly than a tab switch. The pill, the display-serif "Level N, unlocked.", the brief card and buttons all pop; the thread draws under content that just materialized.
- Fix: Stagger the reveal: wrap the result in staggerContainer with riseChild on verdict pill → headline → date line → brief card (30ms stagger, 240ms EASE_OUT), pill scaling in on springTactile, and keep the 1s thread draw as the finale (delay ≈ 0.35s). Failure path gets the same rise minus the thread.
- Verified: Confirmed: `) : gradingResult ? (<div className="space-y-5">` at 3758-3759 is a plain ternary inside the long-mounted quiz tab — no motion wrapper, no AnimatePresence, no key change. The amber thread at 3806-3811 is verifiably the only animated element in the result reveal.

**MO-6 · P1 · effort:small — Stats heatmap staggers 26 columns at 35ms with 500ms fades — ignores the system's 30ms/cap-~8 stagger rule**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:511`
- Evidence: transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 + w * 0.035 }} for 26 week columns (the loop is hardcoded `for (let w = 0; w < 26; w++)`, line 226) → last column starts at 1.03s, finishes ~1.53s. motion.ts: "Enter 240ms EASE_OUT rise 8px, stagger 30ms (cap ~8 items)." The module bars (line 561) and forecast bars (line 594) correctly cap with Math.min(i, 8) but also use off-token duration 0.5; the heatmap's y:6 offset is a third rise value alongside the system's 8 and 10.
- Impact: The activity chart is still trickling in a second and a half after the rest of the stats page has settled — the longest uninterruptible entrance in the app, replayed on every visit to the Stats tab (the tab unmounts/remounts under AnimatePresence mode="wait").
- Fix: Cap the wave: delay: 0.15 + Math.min(w, 8) * 0.03 (or reveal in 4-column groups), duration DUR.gentle (0.32), rise y:8. Align the bar charts' 0.5s durations to DUR.gentle while there.
- Verified: Confirmed at StatsPanel 506-521: uncapped `w * 0.035`, duration 0.5, y:6; 26 weeks confirmed at line 226; the capped-but-0.5s bars at 561/594 confirmed. Corrected impact: columns keep stable keys, so the wave does NOT replay on semester-filter change — only on each tab visit (which is still every visit).

**MO-7 · P1 · effort:small — Floating voice-mode control bar has no exit animation — springs in, blinks out**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3636`
- Evidence: {interactive.active && createPortal(<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} ... />, document.body)} — conditional render outside any AnimatePresence, so exit props would be ignored anyway.
- Impact: Pressing Stop (or finishing the last task) makes the fixed bottom bar vanish in one frame after it arrived on a soft spring — an asymmetry you feel every single voice session, on the element closest to the user's thumb.
- Fix: Wrap the portal content in <AnimatePresence>{interactive.active && ...}</AnimatePresence> and add exit={{ opacity: 0, y: 16, transition: { duration: 0.16, ease: EASE_IN } }}.
- Verified: Confirmed at 3636-3642: `{interactive.active && createPortal(<motion.div initial/animate/springSoft ...>)}` — no exit prop, and the conditional is not a direct child of any AnimatePresence, so unmount is instant. Portal placement makes wrapping it locally in AnimatePresence the correct fix.

**MO-8 · P1 · effort:small — Scribble pad appears/disappears with no motion inside a card where every other disclosure uses the accordion**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3942`
- Evidence: {scribbleEnabled && openScribbles[task.id] && (<div className="mt-3 -mx-[12px] md:-mx-[16px]"><ScribbleCanvas ... /></div>)} (same for the free-answer pad, lines 4048-4061, heightPx={420}) — a raw conditional, while the materials disclosure in the due card animates with `variants={accordion}` inside AnimatePresence (lines 2420-2428).
- Impact: Toggling "Scribble" slams a 340-420px canvas into the card, shoving the submit button and following tasks down instantly — the largest unanimated layout shift in the app, right next to the system's most polished accordions.
- Fix: Wrap the pad in AnimatePresence initial={false} with the shared `accordion` variants (height/opacity, overflow hidden), exactly like the materials chips row.
- Verified: Confirmed both call sites (3942-3954 per-task pad, 4048-4061 free-answer pad with heightPx 420) are bare conditionals with no motion. Confirmed the materials disclosure at 2420-2428 uses AnimatePresence + accordion variants, so the inconsistency claim is fair.

**MO-9 · P1 · effort:small — Snooze pills and delete-confirm buttons animate in on springTactile but pop out on disarm**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2315`
- Evidence: motion.div initial={{ opacity: 0, scale: 0.9, y: -4 }} animate ... transition={springTactile} (snooze, 2315-2318) and motion.button initial={{ opacity: 0, scale: 0.92 }} (delete confirm, 2393-2396) — both plain conditionals with no AnimatePresence, and both auto-disarm via timers: setTimeout(() => setSnoozeArmedId(null), 5000) / setConfirmingDeleteId(null), 4000 (lines 1192-1210) and on Escape (lines 1182-1183).
- Impact: The +1/+3/+7 pills and "Really delete?" chip vanish in one frame when the timer fires, Escape is pressed, or an option is chosen — and the clock/trash icon they replace snaps back with no counterpart to its entrance. Enter/exit asymmetry on interactions used daily.
- Fix: Wrap each swap in <AnimatePresence mode="popLayout" initial={false}> and give the armed state exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12, ease: EASE_IN } }}; the idle icon re-enters with its existing spring.
- Verified: Confirmed: snooze motion.div at 2315-2318 and delete-confirm motion.button at 2393-2396 sit in raw ternaries with no AnimatePresence; the 5s snooze and 4s delete auto-disarm timers (1192-1210) and the Escape handler (snoozeArmedId/confirmingDeleteId branches, ~1182-1183) all verified — the exit pop happens on three separate triggers.

**MO-10 · P1 · effort:small — Tutor slide-over closes with the entrance curve — EASE_OUT on exit instead of the system's close easing**
- Status: ⏳ open
- Where: `src/app/components/TutorPanel.tsx:297`
- Evidence: initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} transition={{ duration: 0.24, ease: EASE_OUT }} — one shared transition, so the exit decelerates. motion.ts: "Move/close 200ms EASE_IN_OUT" and "easeInExpo — exits accelerate cleanly away."
- Impact: The panel leaves the way it arrived — fast start, long lazy settle at the edge — which reads as hesitation instead of a clean dismissal. Felt on every quiz (the panel is force-closed on each startQuiz).
- Fix: exit={{ x: 24, opacity: 0, transition: { duration: 0.2, ease: EASE_IN_OUT } }} (or EASE_IN), keeping the 240ms EASE_OUT entrance.
- Verified: Confirmed at TutorPanel 293-298: single shared transition {duration: 0.24, ease: EASE_OUT} applies to the exit too. motion.ts rule ("Move/close 200ms EASE_IN_OUT", EASE_IN doc comment) and the force-close in startQuiz (setShowTutorPanel(false), line 1521) both verified. Line corrected 295→297 (exit prop).

**MO-11 · P1 · effort:small — Due cards — the app's primary tap target — hover-lift but have no press state**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2295`
- Duplicate-of/with: EL-12, IS-1, MT-5
- Evidence: motion.div variants={riseChild} whileHover={{ y: -1 }} transition={springSoft} onClick={() => startQuiz(review)} (lines 2292-2299) — no whileTap. motion.ts's own hoverLift pairs them: `whileHover: { y: -1 }, whileTap: { scale: 0.985 }`, and repo-wide grep shows hoverLift has zero call sites while pressable is spread five times.
- Impact: Clicking the "Heute fällig" card — the action the whole app funnels toward — gives zero acknowledgment between press and the tab transition; on touch (where hover doesn't exist) the card is completely inert until the screen changes.
- Fix: Spread the existing hoverLift preset ({...hoverLift}) instead of the bare whileHover, or add whileTap={{ scale: 0.985 }}. Consider the same for the "Demnächst" rows, which have hover:bg but no .press-row.
- Verified: Confirmed at 2292-2299: whileHover without whileTap on the clickable due card. Verified by grep that hoverLift (motion.ts 136-140, which pairs hover with whileTap 0.985) is exported but never imported/used anywhere — the drift claim is accurate. (An elevation-dimension finding overlaps; unique within this batch.)

**MO-12 · P2 · effort:small — Quiz task cards enter with a 20px rise stacked on the page's 8px rise — the largest and least systematic offset in the app**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3864`
- Evidence: initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 8) * 0.03, duration: DUR.base, ease: EASE_OUT }} (lines 3861-3866) inside the quiz tab's motion.div using pageVariants (line 3525, initial y:8). The children animate independently of the parent, so both rises compound (~28px composite). System offsets are 8 (riseChild) and 10 (fadeRise).
- Impact: Opening a quiz feels noticeably 'travellier' than every other screen — cards float up nearly 3x the system distance while the page itself is also rising, a subtle double-motion the other tabs don't have.
- Fix: Make the cards variant children of the page container (variants={riseChild}, inheriting the 30ms stagger) or at least reduce to fadeRise's y:10. The stagger cap Math.min(idx, 8) is already correct — keep it.
- Verified: Confirmed: y:20 with explicit initial/animate at 3864-3866 (independent of the parent's variant cascade), quiz tab wrapper uses pageVariants (y:8) at 3525. motion.ts confirms system rises are 8 and 10 only. Compounding claim is mechanically correct since both play at mount.

**MO-13 · P2 · effort:small — Pipeline step indicators: only the 'done' check animates — idle→active pops, and mode="wait" is inert on non-motion children**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2646`
- Evidence: <AnimatePresence mode="wait">{progressStep > step ? (<motion.span key="done" initial={{ scale: 0.5, opacity: 0 }} ... transition={springTactile}>) : progressStep === step ? (<span key="active" className="ember-dot ...">) : (<div key="idle" ... />)}</AnimatePresence> — 'active' and 'idle' are plain span/div, so they get no enter/exit and the wait mode has nothing to wait for. Duplicated at the grading steps (lines 3727-3737).
- Impact: As the upload/grading pipeline advances, the amber 'now running' ring — the state the user is actually watching for — snaps in with no transition while the completed check pops satisfyingly, making the sequence feel half-finished.
- Fix: Promote all three states to motion.span with a shared { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.6, opacity: 0 } } on springTactile; then mode="wait" earns its keep.
- Verified: Confirmed at both sites: upload pipeline (~2646-2656) and grading steps (3727-3737) — in each, only key="done" is a motion.span; key="active" (ember-dot span) and key="idle" (plain div) are non-motion elements inside AnimatePresence mode="wait", so they mount/unmount instantly.

**MO-14 · P2 · effort:medium — 'Collapse all' animates every nested accordion's height simultaneously — the one case the height-animation exemption excludes**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:1307`
- Evidence: toggleAllLibrary clears both sets at once: setExpandedLibrarySemesters(new Set()); setExpandedLibraryModules(new Set()); (lines 1307-1311) — every semester body (variants={accordion}, ~line 2983) and every module body inside it (~line 3084) then runs concurrent height exit animations. motion.ts's own caveat: "framer `height:\"auto\"` is fine for these small panels" — a whole library tree is not a small panel.
- Impact: On a real library (several semesters × modules), one click triggers dozens of nested height interpolations, each forcing layout per frame inside an already-animating parent — visible stutter exactly when the user asks for a tidy sweep.
- Fix: When toggling all, collapse only the top level with animation and let inner accordions unmount instantly (pass a `disableAnimation` that swaps variants for {duration:0} / renders without motion), or stagger semesters by 30ms so at most one tree animates at a time.
- Verified: Confirmed: toggleAllLibrary at 1307-1311 clears both Sets in one click; semester body (AnimatePresence + accordion variants, ~2981-2990) and nested module body (~3082-3091) both height-animate, so all open panels exit concurrently, nested. motion.ts line 103 caveat quote verified.

**MO-15 · P2 · effort:small — Uploaded-file chips appear and disappear with no motion in an otherwise fully-transitioned upload flow**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2747`
- Evidence: {uploadedFiles.length > 0 && (<div className="flex flex-wrap gap-2 mb-4">{uploadedFiles.map((file, idx) => (<div key={file.name} ...>)}</div>)} — plain conditional list; removal via setUploadedFiles(prev => prev.filter(...)) (line 2756) reflows neighbors instantly. The drop-zone highlight beside it transitions (transition-colors, line 2701), the progress card animates every step.
- Impact: Dropping files or removing one makes chips blink in/out and the row snap-reflow — a small but repeated cheap moment at the very start of the app's core 'lecture → quiz' journey.
- Fix: AnimatePresence mode="popLayout" + layout on each chip: enter { opacity: 0, scale: 0.92 } → springTactile, exit { opacity: 0, scale: 0.92, duration: 0.12 }; surviving chips glide into place via the layout animation.
- Verified: Confirmed at 2747-2766: plain div chips keyed by file.name (stable keys already in place — a comment even notes the dedupe — so the AnimatePresence fix is drop-in), removal via filter at 2756, no motion anywhere. Drop-zone transition-colors at 2701 confirmed as the contrast.

**MO-16 · P2 · effort:small — JS smooth scrolling ignores prefers-reduced-motion — voice mode auto-scrolls animatedly for reduce-motion users**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:710`
- Evidence: document.getElementById(`iq-${interactive.currentIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); and window.scrollTo({ top: 0, behavior: "smooth" }) (line 1526). The globals.css guard `scroll-behavior: auto !important` (line ~933) only overrides the CSS property — an explicit JS `behavior: "smooth"` option still animates. Framer is covered (MotionConfig reducedMotion="user", line 1949); this is the one gap.
- Impact: Users who asked the OS for no motion still get repeated animated centering on every dictated task advance — precisely the vestibular-trigger category (large full-viewport scroll) reduced-motion exists for.
- Fix: const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches; …scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" }) — same for the startQuiz scrollTo.
- Verified: Confirmed: repo-wide grep finds exactly two JS smooth-scroll sites (710, 1526), neither guarded by matchMedia; layout.tsx's only reduced-motion check guards the theme fade, not scrolling. Spec-checked the claim: CSS scroll-behavior governs only behavior:"auto" scrolls, so the !important reset does not neutralize explicit behavior:"smooth". MotionConfig reducedMotion="user" at 1949 confirmed.

**MO-17 · P2 · effort:small — Stats skeleton carries an animationDelay with no animation — vestigial shimmer that never fires**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:325`
- Duplicate-of/with: EM-18
- Evidence: <div key={i} className="card-surface p-5" style={{ animationDelay: `${i * 120}ms` }}> — no animation/animate-* class anywhere on the element; the dashboard skeleton (DashboardClient.tsx ~line 2217) is deliberately commented "Skeleton — static paper blocks, no shimmer" and carries no such style.
- Impact: Dead motion code: either a pulse was designed and lost (the skeleton reads flatter than intended) or the delay is noise — a perfectionist's system file shouldn't leave the question open. Also note the 120ms step wouldn't match the 30ms stagger rule if the animation ever returned.
- Fix: Delete the style prop to match the intentional static-skeleton stance — or, if a breathing skeleton is wanted, add a shared opacity pulse (0.6→1, 1.2s ease-in-out, reduced-motion-guarded) and keep delays at i * 30ms.
- Verified: Confirmed at StatsPanel 324-331: animationDelay inline style on card-surface divs with no animation class or keyframe reaching them (card-glass even sets animation:none; no animate-* utility present). Dashboard skeleton's "static paper blocks, no shimmer" comment confirmed at ~2217 — the intent contrast is real.


### Interaction states & affordances (18)

**IS-1 · P0 · effort:small — Primary tap targets (due cards, upcoming rows, sidebar nav) have no press/active state despite the system mandating one and suppressing native tap highlight**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2295`
- Duplicate-of/with: EL-12, MO-11, MT-5
- Evidence: Due card: `whileHover={{ y: -1 }} transition={springSoft}` — no whileTap, even though motion.ts's own hoverLift (src/lib/motion.ts:136-140) pairs `whileHover: { y: -1 }` with `whileTap: { scale: 0.985 }`. Upcoming rows (L2517-2520): `onClick={() => startQuiz(review)} className="…cursor-pointer hover:bg-(--paper-hover)…"` — no `.press-row`, while the visually identical library lecture rows DO use it (L3107 `…transition-colors press-row`). Sidebar nav (L2050) uses `nav-item-idle` which defines only a hover (globals.css:686-691) and no `:active`. Meanwhile globals.css:300-301 sets `-webkit-tap-highlight-color: transparent; /* Cleaner touch feedback (we style our own :active states). */` and CRAFT §5 (globals.css:774-786) mandates scale 0.97/0.985 or `.press-row` darken.
- Impact: On phones/tablets (Tailwind v4 gates all `hover:` utilities behind hover-capable pointers, and framer's whileHover never fires on touch) tapping the app's single most important element — a due review card — or any nav item produces zero visual acknowledgment before navigation. The app feels unresponsive at exactly its hero moment, and directly contradicts its own comment 'we style our own :active states'.
- Fix: Add `whileTap={{ scale: 0.985 }}` (or spread `hoverLift`) to the due-card motion.div; add `press-row` to the Upcoming rows (matching library rows); add a `.nav-item-idle:active / .nav-item-active:active { background: … }` or `transform: scale(0.985)` rule to globals.css.
- Verified: Verified all cited code: due card L2292-2299 has whileHover but no whileTap; hoverLift with whileTap exists unused at motion.ts:136-140; upcoming rows L2517-2520 lack press-row while library rows L3107 have it; nav-item-idle (globals.css:681-691) defines hover only, no :active; tap-highlight suppression + comment at globals.css:300-301; CRAFT §5 press rules at 774-786. Confirmed tailwindcss ^4 with no @custom-variant hover override, so hover: utilities are (hover:hover)-gated. Not touched by the uncommitted h-14/gap-3 tweaks.

**IS-2 · P0 · effort:medium — Review-starting cards and rows are click-only <div>s — no button semantics, no keyboard access**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2298`
- Duplicate-of/with: AX-2
- Evidence: Due card is `<motion.div … onClick={() => startQuiz(review)} className="card-surface-elevated group cursor-pointer…">` (L2292-2299) and each Upcoming row is `<div onClick={() => startQuiz(review)} className="grid…cursor-pointer…">` (L2517-2520). Neither has role="button", tabIndex, or onKeyDown (zero tabIndex attributes exist in the whole file). The only keyboard path into a quiz is the global Enter shortcut, which starts `upcomingReviews.find(r => r.isDue)` — the FIRST due item only (L1925-1931).
- Impact: Keyboard users cannot start the 2nd due review or any scheduled review at all; focus-visible styling the system carefully built (globals.css:354-357) never applies because the elements can't receive focus. Screen readers announce the card as plain text.
- Fix: Make the card header/row a real <button> (the footer already stopPropagations at L2353, so nesting is avoidable by putting the button on the title region), or add role="button", tabIndex={0}, and Enter/Space key handling to both.
- Verified: Verified: onClick divs at L2292-2299 and L2517-2520 with no role/tabIndex/key handler; grep confirms no tabIndex anywhere in DashboardClient.tsx; global Enter handler at L1925-1931 starts only the first due item and only from the dashboard tab. Upcoming rows contain no focusable children, so there is genuinely no keyboard path to scheduled reviews.

**IS-3 · P0 · effort:small — Delete-lecture button is invisible but still tappable on touch devices ≥640px (iPad)**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2408`
- Duplicate-of/with: MT-7
- Evidence: `className="btn-ghost-icon w-8 h-8 … sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 sm:focus-visible:opacity-100 … cursor-pointer transition-opacity"`. Tailwind v4 compiles `group-hover:` inside `@media (hover: hover)`, so on an iPad (viewport ≥ sm, no hover pointer) the button is permanently `opacity-0` — yet it keeps its 32px hit area and arms the destructive 'Wirklich löschen?' confirm pill (L2392-2402) when tapped.
- Impact: Touch users on tablets either can never find the delete affordance, or worse, tap an invisible area next to the chevron and get a red 'Really delete?' pill appearing from nowhere. Hover-only reveal of a destructive control with no touch fallback — the focus-visible fallback shows the team handled keyboard but forgot touch.
- Fix: Show the button by default on non-hover devices: replace `sm:opacity-0 sm:group-hover:opacity-100` with a hover-capability-scoped hide, e.g. `[@media(hover:hover)]:sm:opacity-0 [@media(hover:hover)]:sm:group-hover:opacity-100`, keeping `focus-visible:opacity-100`.
- Verified: Verified exact className at L2408 and the armed-confirm branch at L2392-2402. Confirmed Tailwind v4 default (hover:hover) gating applies (no custom variant override in globals.css). The two-step confirm prevents accidental data loss, but the invisible-yet-tappable destructive control on a whole device class stands; severity high kept because the affordance is entirely absent on touch tablets.

**IS-4 · P0 · effort:small — Grading-model <select> has no visible keyboard focus state (globally suppressed, never restored)**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3984`
- Evidence: The quiz model picker uses `className="btn-secondary sm:w-[200px] h-12 … appearance-none …"` (L3981-3989, duplicated at L4063-4071). globals.css:358-362 kills the outline for all selects: `input:focus-visible, textarea:focus-visible, select:focus-visible { outline: none; }` under the comment 'Inputs keep their ring' — but the ring only exists on `.input-dark:focus` (globals.css:556-560). `.btn-secondary` (globals.css:507-524) defines no :focus style, so this select has NO focus indicator at all. Bonus drift: the identical control on the upload tab is styled `input-dark h-[52px]` (L2777-2780) — same picker, two different visual identities and heights (and only that one gets a focus ring).
- Impact: Tabbing to the model select before submitting a quiz shows nothing — a broken state in the matrix, violating the system's own CRAFT §2 'keyboard-only focus: accent outline' rule. The upload/quiz inconsistency also reads as visual drift for the same control.
- Fix: Give both model pickers one shared style (input-dark), or add `.btn-secondary:focus-visible { border-color: var(--accent-border-strong); box-shadow: 0 0 0 3px var(--accent-ring); }`.
- Verified: Verified the global select:focus-visible outline:none at globals.css:358-362, the absence of any :focus rule in .btn-secondary (507-524), the ring living only on .input-dark:focus (556-560), and both btn-secondary selects (L3981/L4063) vs the input-dark select (L2777). The keyboard-focused state is genuinely indicator-free on the quiz pickers.

**IS-5 · P1 · effort:small — Module dropdown removes the native arrow and provides no replacement — a <select> disguised as a text field**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2674`
- Evidence: `<select value={subjectInput} … className="input-dark w-full h-12 px-4 appearance-none cursor-pointer">` (L2671-2679) — `appearance-none` with no chevron. The model select 100 lines below explicitly paints one: `appearance-none bg-[url('data:image/svg+xml…M5 8l5 5 5-5…')] bg-no-repeat bg-[position:right_1rem_center]` (L2780), as do both quiz model pickers (L3984, L4066).
- Impact: The first field of the upload flow gives zero affordance that it opens a menu — it looks exactly like the read-only 'No modules defined' div that renders in its place when empty (L2681). Users with one preset may never discover they can switch modules.
- Fix: Add the same data-URI chevron background used by the model selects (extract it to a shared `select-chevron` utility class since it's now needed in four places).
- Verified: Verified L2671-2674: appearance-none, no background chevron; verified the sibling model selects at L2780/L3984/L4066 all carry the data-URI chevron; verified the visually-identical empty-state input-dark div at L2681. The inconsistency and missing affordance are real.

**IS-6 · P1 · effort:small — File picker is unreachable by keyboard: display:none input + label styled as a button**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2742`
- Evidence: `<input type="file" … className="hidden" id="file-upload" …/>` (L2725-2741) followed by `<label htmlFor="file-upload" className="btn-secondary px-4 py-2 text-sm cursor-pointer">` (L2742-2744). `hidden` = display:none, which removes the input from the tab order; a <label> is not focusable and receives no focus-visible outline. This is the only file input in the app, and the drop zone (L2700-2714) has only drag handlers, no onClick.
- Impact: Keyboard-only users cannot upload files at all (they can still paste text into the textarea, but PDF/DOCX/XLSX upload is mouse/touch-only). The 'Browse Files' control also never shows the system's accent focus ring.
- Fix: Replace `className="hidden"` with `className="sr-only"` so the input stays focusable, and style label focus via `input:focus-visible + label`/`peer-focus-visible` — or use a real <button> that calls `inputRef.current.click()`.
- Verified: Verified input className="hidden" at L2729 and the label-as-button at L2742; grep confirms this is the sole type="file" input in src/; the drop zone div has onDragOver/onDrop only, no click or key handlers. Keyboard file upload is genuinely impossible; softened the impact wording to note text-paste remains available.

**IS-7 · P1 · effort:small — Server-backed segmented controls (language, AI connection, PDF delivery) show no feedback until the round-trip completes**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4646`
- Evidence: Language switch: `onClick={() => { fetch('/api/settings', …).then(res => res.json()).then(data => { … if (data.language) setLanguage(data.language); }) }}` (L4645-4688) — `data-active` only flips after the POST resolves (same pattern for wrapperMode L4738+ and fileTransport via updateFileTransport L665-680). Contrast: the dictation segment in the same modal updates instantly (`updateDictationMode` sets state synchronously, L659-662).
- Impact: On a slow connection tapping 'English' does nothing for a second or more — no pressed state, no spinner, no optimistic highlight. Users click again; the control feels broken. Inconsistent feel between adjacent, identical-looking segments in the same settings modal.
- Fix: Optimistically set the local state on click and revert on error (a toast already exists for the failure path), or at minimum render the clicked item in a pending style (e.g. reduced-opacity active) until the response lands.
- Verified: Verified: language buttons (L4645-4688) and fileTransport (updateFileTransport L665-680, buttons L4824-4839) flip data-active only after fetch resolves; updateDictationMode (L659-662) is synchronous local state — the inconsistency between identical-looking segments is real. Corrected one detail: the instant dictation segment sits below (not above) the language segment; error toasts exist so an optimistic revert path is already available.

**IS-8 · P1 · effort:small — Comprehension-check chip morphs into a spinner + live streaming text — the button resizes continuously while loading**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3283`
- Evidence: `{compGen?.itemId === item.id ? (<><ArrowPathIcon className="w-3.5 h-3.5 animate-spin"/><span className="max-w-[260px] truncate">{compGen.message}</span></>) : (<><SparklesIcon …/>{…"Start check"}</>)}` (L3283-3295) — compGen.message is replaced by each NDJSON progress event (`setCompGen({ itemId, message: evt.data.message })`, L1848-1851), so the chip jumps from ~110px up to ~300px and re-wraps the surrounding `flex flex-wrap` row (L3277) on every progress tick.
- Impact: The library detail panel visibly reflows repeatedly during the ~30s generation; the neighboring result badge and date (L3297-3313) shift around. Violates the 'loading buttons preserve width' craft rule.
- Fix: Freeze the chip at its idle width (spinner replaces the icon, label stays 'Starting…'), and render the streaming progress message as a separate quiet line below the chip row.
- Verified: Verified the conditional chip content at L3283-3295, the per-event setCompGen at L1848-1851 replacing the message text, and the flex-wrap row at L3277 holding the result badge that reflows. max-w-[260px] caps growth but each different-length progress message still changes the chip's width mid-load.

**IS-9 · P1 · effort:medium — Edit-mode module delete is a role="button" span nested inside the module-header <button> — invalid and keyboard-dead**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3068`
- Evidence: The module header is `<button onClick={…toggle…} className="w-full …press-row">` (L3001-3079) and inside it edit mode renders `<span role="button" aria-label="Modul entfernen" onClick={(e) => handleDeleteLibraryModule(…)} className="…cursor-pointer…active:scale-90">` (L3068-3075). No tabIndex, no key handler; nested interactive content inside a <button> is invalid HTML. The armed confirm state (L3057-3065) also drops the `active:scale-90` press its idle sibling has.
- Impact: Keyboard users can never delete a module (Enter on the row just toggles the accordion); screen readers get a button-inside-button announcement. The confirm pill loses press feedback exactly at the destructive step.
- Fix: Restructure the header row so the toggle and the delete control are sibling buttons inside a div (the row is already `w-full flex`), making the delete a real <button> with the same classes.
- Verified: Verified the full structure at L3001-3079: outer <button> wraps both role="button" spans (idle at L3068-3075 with active:scale-90, armed confirm at L3057-3065 without it); neither span has tabIndex or key handling. Nested-interactive and keyboard-dead claims are accurate.

**IS-10 · P1 · effort:small — One Escape press closes two layers when the Tutor panel is open behind a modal**
- Status: ⏳ open
- Where: `src/app/components/TutorPanel.tsx:127`
- Evidence: TutorPanel registers its own listener: `const onKey = (e) => { if (e.key === "Escape") onClose(); }` (L125-132) with no awareness of overlays, while DashboardClient's global Escape handler (L1172-1188) closes the topmost modal and returns. Both listeners fire on the same keydown: with the settings modal (or feedback/prompt modal) open above an open tutor panel, Esc closes the modal AND the tutor panel simultaneously.
- Impact: The layered-dismissal model the app carefully ordered by z-index ('closes whichever overlay is on top', per the comment at DashboardClient L1167-1171) breaks: users lose their tutor chat pane when they only meant to dismiss the settings sheet.
- Fix: In TutorPanel's handler, ignore Escape if a higher overlay exists (e.g. check `e.defaultPrevented` and have the global handler call `preventDefault()`, or lift tutor-close into the global ordered chain).
- Verified: Verified both handlers: TutorPanel L125-132 unconditionally calls onClose() on Escape while open; the global ordered chain at DashboardClient L1172-1188 handles modals but never checks/coordinates with the tutor panel, and neither uses preventDefault/defaultPrevented. The sidebar settings button remains reachable while the tutor panel is open, so the collision scenario is real.

**IS-11 · P1 · effort:small — Multiple touch targets far below 44px: toast dismiss ~20px, tutor TTS 24px, file-chip remove 28px, snooze pills 28px**
- Status: ⏳ open
- Where: `src/app/components/Toast.tsx:73`
- Evidence: Toast close: `className="shrink-0 … cursor-pointer p-0.5"` around a `w-4 h-4` icon = 2+16+2 = 20px square (Toast.tsx:71-77; the undo bar's close at L103-109 is similar with p-1 = ~22px). TutorPanel speak button `w-6 h-6` = 24px (TutorPanel.tsx:376-379). Upload file-chip remove `w-7 h-7` = 28px (DashboardClient.tsx:2755-2758). Snooze pills `h-7 px-2.5` = 28px tall and auto-dismiss after 5s (DashboardClient.tsx:2327, timer at L1205-1209). Sign-out `w-9 h-9` = 36px (L2131).
- Impact: On phones, dismissing an error toast or hitting a time-limited snooze pill is a precision task; missing the 20px toast X taps whatever is underneath. All are below both Apple's 44pt guideline and a 44px bar.
- Fix: Grow hit areas without visual change using padding + negative margin (e.g. toast close `p-2.5 -m-2`, TTS button visual w-6 inside a `p-2 -m-2` wrapper), and make snooze pills `h-9`.
- Verified: Verified every measurement against the code: toast close p-0.5 + 16px icon = 20px (Toast.tsx:73), TTS w-6 h-6 = 24px (TutorPanel.tsx:379), file-chip remove w-7 h-7 = 28px (L2758), snooze pills h-7 = 28px with a confirmed 5000ms auto-reset (L1207), sign-out w-9 = 36px (L2131). The uncommitted working-tree tweaks only touch the primary submit buttons (h-14) and do not address any of these targets.

**IS-12 · P1 · effort:small — Push-notification toggle: switch visual without switch semantics, and no busy state through a multi-second async flow**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2074`
- Duplicate-of/with: IA-12
- Evidence: `<button onClick={togglePush} className="flex items-center gap-3 h-[38px] px-3 cursor-pointer nav-item-idle">…<span className="w-7 h-[17px] rounded-full…">` (L2074-2093) — a painted track/knob but no `role="switch"`/`aria-checked`, no disabled/pending state. `subscribeToPush` (L803-858) awaits the permission prompt + `navigator.serviceWorker.ready` + a network POST; during that whole time the knob sits still and the button stays clickable (re-entrant taps start parallel subscribe flows — there is no in-flight guard).
- Impact: Tapping the toggle appears to do nothing for seconds (especially on iOS PWA), inviting double-taps and parallel subscribe requests. Assistive tech does get on/off from the visible label text ('Notifications on/off'), but not as switch semantics, and gets no indication anything is in progress.
- Fix: Add role="switch" aria-checked={pushSubscribed}, plus a `pushBusy` state that disables the button and shows the knob in an intermediate position (or a small spinner), set on entry to togglePush.
- Verified: Verified the button and painted switch at L2074-2093 (no role/aria-checked/disabled) and the long async chain in subscribeToPush/togglePush (L803-884) with no busy flag or re-entrancy guard — knob state only changes via setPushSubscribed at the end. Corrected the impact: the label text ('Mitteilungen an/aus') does convey state to screen readers, so the semantic gap is role/busy-state, not total state invisibility.

**IS-13 · P1 · effort:small — Toggle/segmented buttons lack aria-pressed — inconsistently, since StatsPanel's own filter chips set it**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4663`
- Evidence: Every `.segmented-item` conveys selection only via `data-active={language === 'german'}` (L4662-4663; also dictation L4699-4721, wrapper L4737+, fileTransport L4823-4839); the Tutor toggle (L3583-3590, static 'Tutor' label), theme cards (L4481-4525) and accent swatches (L4539-4555, selection shown only by a check icon at opacity 0/1) likewise expose no pressed/selected state. Meanwhile StatsPanel does it right: `aria-pressed={semesterFilter === "all"}` (StatsPanel.tsx:436, 446) — the only two aria-pressed attributes in the app.
- Impact: Screen-reader users can't tell which theme, accent, language, or dictation mode is selected, or whether the Tutor panel is open — while the one control in StatsPanel behaves properly, making it an internal consistency break, not just an a11y gap.
- Fix: Add `aria-pressed` (toggles) or `role="radiogroup"`+`role="radio"`/`aria-checked` (segmented, theme, accent) mirroring the existing data-active conditions.
- Verified: Grep confirmed aria-pressed exists exactly twice in the app (StatsPanel 436/446) and nowhere else; verified segmented items use data-active only, the Tutor toggle's label never changes, and theme/accent selection is conveyed purely by border color and a check icon animated via opacity. Dropped the original's scribble-toggle example — its label text changes with state ('Scribble' → 'Close scribble'), so it does convey state textually.

**IS-14 · P1 · effort:small — Modal close buttons: four different treatments, three with dead hover (`bg-paper-2 hover:bg-paper-2`)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4122`
- Duplicate-of/with: EL-9
- Evidence: Archive modal close: `rounded-full bg-paper-2 hover:bg-paper-2` (L4122) — hover background is a literal no-op; same in the feedback modal (L4178) and prompt viewer (`rounded-lg bg-paper-2 hover:bg-paper-2`, L5037). Prompts-list and comp-feedback use `rounded-[10px] text-ink-400 hover:bg-(--hairline)` (L4921, L4983); settings uses `p-2 hover:bg-paper-2 rounded-full` from transparent (L4458); calendar close is bare `p-2` with color change only (L4338). The tutor page's back link repeats the pattern: `bg-paper-2 … hover:bg-paper-2` (src/app/tutor/[id]/page.tsx:55).
- Impact: The same element — 'close this sheet' — has four shapes/behaviors across sibling modals, and in three places the hover state literally does nothing (only the icon color shifts), which reads as a bug on a system that prides itself on state discipline.
- Fix: Extract one `.modal-close` recipe (e.g. the prompts-list variant: transparent → hover:bg-(--hairline), rounded-[10px], w-8 h-8) and use it in all modals + the tutor page link (fix its hover to `hover:bg-(--paper-hover)` or similar).
- Verified: Verified every citation via grep + read: dead `bg-paper-2 hover:bg-paper-2` at L4122, L4178, L5037 and tutor/[id]/page.tsx back link; working `hover:bg-(--hairline)` variant at L4921/L4983; transparent→paper-2 at L4458; bare p-2 color-only at L4338. Corrected the title's count of dead hovers from two to three in-app instances (plus the tutor-page link).

**IS-15 · P2 · effort:small — Accordion/disclosure toggles never set aria-expanded (only the mobile menu button does)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2355`
- Evidence: Materials disclosure (L2355-2370), library semester header (L2952-2958), module header (L3001-3007), lecture row (L3101-3107), and history entries (L4234-4241) are all <button>s that animate a chevron but carry no `aria-expanded`. The only instance in the entire src tree is the mobile menu: `aria-expanded={showMobileMenu}` (L2017).
- Impact: Assistive tech hears 'button' with no open/closed state on five different accordion levels; the one correct usage shows the team knows the pattern — this is drift.
- Fix: Add `aria-expanded={materialsOpen}` / `{semOpen}` / `{modOpen}` / `{itemOpen}` / `{isOpen}` to each toggle (the boolean is already in scope at every call site).
- Verified: Grep across src/ confirmed exactly one aria-expanded (L2017, mobile menu). Read the materials disclosure (L2355), semester header (L2952) and module header (L3001) buttons — all animate a chevron from an in-scope open boolean with no aria-expanded.

**IS-16 · P2 · effort:medium — Heatmap cells expose their data only via hover tooltips on non-focusable divs**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:517`
- Evidence: `<Tip …><div className={"heat-cell w-[13px] h-[13px]…"} /></Tip>` (L516-518) — Tip shows on mouseenter/focus (Tooltip.tsx:65-69), but the cell is a div with no tabIndex, so keyboard focus never happens and touch has no reliable path. Same wrapping for forecast bars (L583) and level-distribution bars (L629), though those carry visible count labels (L585, L631). The `.heat-cell:hover` ink outline (globals.css:789-792) is likewise hover-only.
- Impact: On phones — a primary context for a study app — per-day review counts in the heatmap are effectively unreachable (the bars at least show their numbers); keyboard users get nothing anywhere. The Tip component's own onFocus path (built for exactly this) never fires.
- Fix: Cheapest: make cells focusable (tabIndex={0}) so Tip's onFocus path fires, or show the hovered/tapped day's value in a fixed caption line under the heatmap (tap = set state).
- Verified: Verified heat cells are bare divs (L517) with no tabIndex anywhere in StatsPanel; Tooltip.tsx L62-69 confirms show-on-focus exists but requires a focusable anchor. Confirmed the forecast/level bars DO render visible count labels (L585, L631), so narrowed the impact to the heatmap being the real data-access gap.

**IS-17 · P2 · effort:small — Two competing auto-reset timers (4s and 5s) for the semester danger-zone confirms — the 5s one is dead code**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:1431`
- Evidence: L1213-1220 resets `confirmingNewSemester/confirmingResetSemester` after 4000ms; L1431-1438 registers a second effect doing the identical reset after 5000ms. Both watch the same deps, so the 4s timer always fires first and the 5s effect never has an observable effect. Armed windows also differ across the app: delete confirms 4000ms (L1193, L1200), snooze pills 5000ms (L1207).
- Impact: Maintenance trap plus an inconsistent 'grace period' rhythm: identical two-step confirms give users 4s in one place and 5s in another for no reason.
- Fix: Delete the duplicate effect at L1431-1438 and standardize a single ARM_TIMEOUT_MS (e.g. 5000) constant used by all four confirm timers.
- Verified: Read both effects: L1213-1220 (4000ms) and L1431-1438 (5000ms) are byte-for-byte the same reset logic with identical deps — the 5s one can never win. Also confirmed the 4000ms delete-confirm timers (L1191-1202) vs the 5000ms snooze timer (L1205-1209).

**IS-18 · P2 · effort:small — Disabled-cursor language is inconsistent: cursor-default (Scribble) vs cursor-not-allowed (system) vs cursor-wait (busy)**
- Status: ⏳ open
- Where: `src/app/components/ScribbleCanvas.tsx:238`
- Evidence: Scribble Undo/Clear: `disabled:opacity-40 disabled:cursor-default` (L238, L246). The design system's own baseline is `.btn-primary:disabled { cursor: not-allowed; }` (globals.css:502-505), other disabled controls use `disabled:cursor-not-allowed` (e.g. interactive-mode previous, DashboardClient L3655), and busy buttons deliberately use `disabled:cursor-wait` (snooze L2339, comprehension chip L3281). Grep confirms the Scribble pair is the only place using `disabled:cursor-default`.
- Impact: A perfectionist detail: hovering a disabled Undo reads as an inert label rather than a temporarily unavailable action, breaking the cursor vocabulary the rest of the app maintains (not-allowed = can't, wait = busy).
- Fix: Change both buttons to `disabled:cursor-not-allowed` to match the system baseline.
- Verified: Verified L238/L246 in ScribbleCanvas, the .btn-primary:disabled not-allowed baseline (globals.css:502-505), and via grep that these two buttons are the app's only `disabled:cursor-default` usage while cursor-not-allowed (L3655) and cursor-wait (L2339, L3281) are used consistently elsewhere.


### Layout, spacing & alignment (17)

**LS-1 · P0 · effort:small — Tutor slide-over animates the quiz column via transition-[padding] — a layout animation that violates the app's own motion law**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3529`
- Duplicate-of/with: MO-1
- Evidence: className={`max-w-4xl mx-auto transition-[padding] ${showTutorPanel ? "xl:pr-[392px]" : ""}`} — while src/lib/motion.ts (lines 9–10) states the system rule: "Only `transform` and `opacity` ever animate. No blur transitions, no box-shadow interpolation." Even the global base transitions (globals.css 346–351) deliberately whitelist "Only compositor/paint-friendly props — never layout, never filter."
- Impact: Toggling the tutor on xl screens reflows and re-wraps the entire quiz column (multi-paragraph question text, textareas) on every frame of the padding tween — visible text re-ragging and main-thread jank at the exact moment the user asks for help. It is the one place in the app that animates layout, and it contradicts the documented motion contract.
- Fix: Don't animate padding. Either (a) let the panel overlay without pushing (it already does below xl), or (b) wrap the quiz column in a transformed container and animate translateX(-196px) with springSoft while reserving the space statically, or (c) use framer-motion layout on the container so it FLIPs via transform. Remove transition-[padding].
- Verified: Confirmed verbatim at line 3529 in the working tree; re-read motion.ts lines 1–18 (transform/opacity-only rule is stated exactly as quoted) and globals.css 346–351 (base transition whitelist excludes layout props). transition-[padding] in Tailwind 4 emits transition-property: padding, so the xl:pr-[392px] toggle does tween layout. No other layout-animating transition exists in the file.

**LS-2 · P0 · effort:medium — The seven modals have no shared spatial contract: three height caps, three body paddings, two header paddings, and two of them dock to the bottom on phones while five stay centered**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:4952`
- Duplicate-of/with: MT-16
- Evidence: Height caps: max-h-[85dvh] (archive 4115, feedback 4167), max-h-[90dvh] (calendar 4330, settings 4443), max-h-[80dvh] (prompts 4911, comp-feedback 4960, prompt viewer 5015). Mobile anchoring: comp-feedback (4952) and prompt viewer (5008) use "items-end sm:items-center" while archive (4108), feedback (4160), calendar (4324), settings (4437) use "items-center". Headers: "p-6" (4117, 4170) vs "px-6 py-5" (4913, 4962, 5018) — with divider colors also split between --hairline-card and --hairline. Bodies: p-6 (4128), p-6 md:p-8 (4209), p-4 (4927), p-6 md:p-7 (4989), p-6 (5045); calendar/settings instead scroll the whole p-5 sm:p-6 md:p-7 panel.
- Impact: Opening different modals feels like visiting different apps: on a phone two dialogs slide up as near-bottom-sheets (still floating 16px above the edge with full 22px card-glass radii, so they read as misplaced cards, not sheets) while the rest center; header heights and inner air visibly differ between the feedback brief and the prompt viewer even though they are sibling document viewers.
- Fix: Define one modal recipe: items-center everywhere (or a real bottom-sheet variant with squared bottom corners and w-full below sm), a single max-h-[85dvh], header px-6 py-5, body p-6 md:p-8. Encode it as a shared ModalShell component or .modal-* utilities in globals.css so drift can't recur.
- Verified: Re-read all seven modal shells in the working tree: every quoted class string matches (85/90/80dvh caps, items-end sm:items-center on comp-feedback z-[80] and prompt viewer z-[90], p-6 vs px-6 py-5 headers, body paddings). Also confirmed card-glass = border-radius 22px in globals.css (line ~442) and overlay p-4 = the 16px float, so the 'misplaced card' description of the bottom-docked variants is accurate. Calendar/settings additionally use a whole-panel scroll pattern the others don't — the drift is even wider than stated.

**LS-3 · P0 · effort:medium — No card inner-padding scale — nine card types use eight different padding recipes, several hand-tuned to off-grid values**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3867`
- Duplicate-of/with: EL-6, MO-4
- Evidence: Quiz task card: "card-surface-elevated p-[22px] md:px-[26px]" (3867 — 22px vertical, 26px horizontal on md). Due card: "pl-[26px] pr-5 pt-[18px] pb-4" (2299 — 26/20/18/16). Upload form: "p-5 md:p-8" (2663). Free-quiz card: "p-5 md:p-7" (4015). Result card: "p-7 md:p-8" (3760). Right-rail cards: "p-5" (2549). Sidebar promo: "p-4" (2095). Stats cards: "p-5 md:px-6 md:py-[22px]" (StatsPanel.tsx 486).
- Impact: Cards that sit on the same screen breathe differently for no hierarchical reason — e.g. on the quiz tab the free-quiz card gets p-7 on md while the structured task cards get 22/26px and the result card gets p-8; the eye registers the rhythm change even if the user can't name it. This is the largest source of 'almost right' feel across every tab.
- Fix: Adopt a three-step card padding scale and map every card onto it: compact p-4 (16), standard p-5 (20), roomy p-6 md:p-8 (24/32). Kill the one-off 18/22/26px values (the due card's 26px left already includes the 3px thread — make it pl-6 with the thread inside the 24px gutter).
- Verified: All eight citations re-read in the working tree and every class string matches exactly (2095 p-4, 2299 pl-[26px] pr-5 pt-[18px] pb-4, 2549 p-5, 2663 p-5 md:p-8, 3760 p-7 md:p-8, 3867 p-[22px] md:px-[26px], 4015 p-5 md:p-7, StatsPanel 486 p-5 md:px-6 md:py-[22px]). No card padding scale is declared anywhere in globals.css. Not touched by the uncommitted mobile tweaks (those only change button heights/gaps).

**LS-4 · P1 · effort:small — Mobile top bar, its flow spacer, and the hardcoded 61px sidebar offset are three disagreeing heights**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2026`
- Evidence: The fixed bar (2008) row height is set by the menu button "p-2 -mr-2" + "w-6 h-6" icon = 40px, so the bar is 40+12(pt min)+12(pb)+1(border) ≈ 65px. The spacer (2026–2028) replicates the paddings but its inner content is "<div className=\"h-7\"></div>" = 28px (matching the 28px brand tile, not the 40px menu button), totalling ≈52px — 13px short. The sidebar (2035) assumes yet another number: "min-h-[calc(100dvh_-_61px)]".
- Impact: On every phone view, in-flow content starts ~13px higher than the fixed bar's true bottom edge, so the top of the page (and the open mobile menu's header) tucks under the translucent bg-(--paper-0)/92 bar, and content scrolls under it sooner than designed. The 61px sidebar constant matches neither the real ~65px bar nor the ~52px spacer, so the open menu's min-height is misaligned with the viewport by several pixels in both directions.
- Fix: Give the bar a deterministic height: put h-10 on the bar's flex row and the spacer's inner div (or extract one BAR_H constant used by bar, spacer, and the sidebar calc), and derive the sidebar min-h from the same value including the border.
- Verified: Re-derived the math from lines 2008–2035: menu button p-2 + 24px icon = 40px row; bar pt-[max(0.75rem,safe-area)] pb-3 border-b = ~65px total; spacer duplicates paddings but inner div is h-7 (28px) = ~52px; sidebar hardcodes calc(100dvh - 61px). All three numbers disagree — confirmed. Corrected the original impact's 'menu 4px taller / rubber-band' claim: with the 52px spacer the real symptom is the menu tucking 13px under the translucent bar, not overflow.

**LS-5 · P1 · effort:small — Success/error toasts ignore the safe area while the undo stack ten lines away handles it — toasts sit behind the iPhone home indicator**
- Status: ⏳ open
- Where: `src/app/components/Toast.tsx:49`
- Duplicate-of/with: MT-6
- Evidence: Card toasts: "fixed bottom-5 right-5 z-[100] …" (line 49). Undo toasts in the same component: "fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 …" (line 84). The app explicitly targets standalone iOS PWA (layout.tsx sets viewportFit: "cover" at line 43 and statusBarStyle "black-translucent" at line 28).
- Impact: In the installed PWA — the app's flagship mobile mode — every success/error toast renders 20px from the physical bottom edge, overlapping the 34px home-indicator zone; the dismiss X becomes hard to tap and the card looks cropped by the gesture bar. The inconsistency inside one 116-line file shows the safe-area fix was applied to one stack and forgotten on the other.
- Fix: Change line 49 to bottom-[max(1.25rem,env(safe-area-inset-bottom))] and right-[max(1.25rem,env(safe-area-inset-right))] to also cover landscape notches.
- Verified: Read the full Toast.tsx: line 49 is exactly "fixed bottom-5 right-5 z-[100]…" with no safe-area handling; line 84's undo stack uses the env(safe-area-inset-bottom) max() exactly as quoted. Verified layout.tsx has viewportFit: "cover" (line 43) and black-translucent status bar (line 28), so safe-area insets are live in the PWA and the discrepancy is real.

**LS-6 · P1 · effort:small — Five tabs, four content max-widths (980 / 768 / 1024 / 896 / 1024) — the identical header block jumps horizontally on every tab switch**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2152`
- Evidence: dashboard: "max-w-[980px] mx-auto" (2152), upload: "max-w-3xl mx-auto" (2599), library: "max-w-5xl mx-auto" (2813), stats: "max-w-5xl mx-auto" (3505), quiz: "max-w-4xl mx-auto" (3529). All five open with the same caps-label eyebrow + font-display text-[34px] sm:text-[40px] header pattern, inside <AnimatePresence mode="wait"> (2144).
- Impact: Because content is centered, every tab change moves the shared header pattern to a new left edge (dashboard→library shifts 22px, dashboard→upload shifts 106px). With AnimatePresence mode="wait" the shift happens between fade-out and fade-in, so the page appears to re-anchor itself on each navigation — the shell feels less solid than it is. 980px is also the only off-scale value.
- Fix: Pick two widths with intent: a reading width (max-w-3xl) for upload/quiz forms and one app width (max-w-5xl) for dashboard/library/stats — replacing the arbitrary 980px and 4xl. The header left edge then only moves when the content genre actually changes.
- Verified: All five max-width classes confirmed at the cited lines, and AnimatePresence mode="wait" confirmed at line 2144. Re-did the shift math: (1024−980)/2 = 22px and (980−768)/2 = 106px — correct for viewports wider than the container. Header lockup pattern verified identical across tabs (caps-label + 34/40px display h1).

**LS-7 · P1 · effort:small — Stats skeleton claims to 'mirror the final layout, so nothing jumps' but uses different gaps than the loaded state — the page visibly shifts on load**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:322`
- Duplicate-of/with: PP-12
- Evidence: Skeleton (comment line 319: "Loading skeleton (mirrors the final layout, so nothing jumps)"): root "flex flex-col gap-6" (322), grid "grid-cols-2 lg:grid-cols-4 gap-4" (323). Loaded: root "flex flex-col gap-4" (423), grid "gap-3.5" (457). The skeleton also renders only 3 sections vs 5+ loaded, and carries a dead style={{ animationDelay: `${i * 120}ms` }} (325) with no animation defined.
- Impact: When /api/stats resolves, section spacing snaps from 24px to 16px and card gutters from 16px to 14px — every card below the first row shifts up at the exact handoff moment the skeleton exists to smooth over. The code's own comment documents the intent being broken.
- Fix: Copy the loaded wrapper classes verbatim into the skeleton (gap-4 root, gap-3.5 grid) and add placeholder blocks for the missing sections so total height is stable too; delete or implement the dead animationDelay.
- Verified: Confirmed skeleton root gap-6 (322) + grid gap-4 (323) under the 'nothing jumps' comment (319), vs loaded root gap-4 (423) + grid gap-3.5 (457); skeleton has 3 sections vs 5+ loaded (semester filter, stat grid, heatmap, forecast, level charts…). Overlaps the elevation-shadows batch's stat-card finding only on the grid-gap detail; this finding's core (root gap + missing sections + broken comment) is distinct, so kept.

**LS-8 · P1 · effort:small — Activity heatmap scroller opens at the oldest week — on phones 'today' is off-screen with no auto-scroll and no edge fade**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:493`
- Duplicate-of/with: MT-14
- Evidence: <div className="overflow-x-auto custom-scrollbar pb-1"> wrapping "flex gap-1 min-w-max" of 26 week columns built oldest→newest (loop at 226: firstMonday = thisMonday − 25 weeks, w=0 rendered first). 26×13px cells + 25×4px gaps + weekday gutter ≈ 460px. No code sets scrollLeft anywhere in src/ (grep verified), and no mask-image/gradient fade exists on the container.
- Impact: On a 375px viewport the visible window shows roughly the oldest three months of the half-year range; the streak-relevant recent weeks — the emotional payoff of the chart — are hidden to the right, and nothing signals that scrolling is possible. Users see an apparently stale, mostly-empty heatmap.
- Fix: After mount, set el.scrollLeft = el.scrollWidth (a ref + layout effect), and add a mask-image linear-gradient edge fade on the container so truncation reads as 'more here'. GitHub-style anchoring to the newest week is what every user expects.
- Verified: Verified the week loop (lines 222–237): firstMonday is 25 weeks back and columns push oldest-first, so today's column is rightmost. Grep for scrollLeft across src/ returned zero hits; grep for mask-image/mask: in StatsPanel and globals.css returned zero hits. Width math re-derived: 26×13 + 25×4 + gutter ≈ 455–460px, wider than a 375px phone minus card padding. All claims hold.

**LS-9 · P1 · effort:small — Arming snooze swaps a 32px icon for a ~150px pill group inside the card's title row — the lecture title and level pill lurch on every arm/disarm**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2314`
- Duplicate-of/with: AX-13
- Evidence: Armed branch (2314–2333) renders three "+1/+3/+7" pills (each "h-7 px-2.5 rounded-full … whitespace-nowrap") in place of the idle "btn-ghost-icon w-8 h-8" (2336–2346); they share a flex row with the flex-1 min-w-0 title block (2305) and the Level pill (2311), so the extra ~120px is taken from the title's truncation width instantly, while only the pill group itself animates in (initial opacity/scale/y with springTactile).
- Impact: Clicking the quiet clock icon makes the card's headline text visibly re-truncate and the Level chip jump left — a large, un-choreographed layout pop for what should feel like a small local disclosure. It also auto-reverts after 5s (effect at ~1206: setTimeout(() => setSnoozeArmedId(null), 5000)), causing the same jolt in reverse while the user may be reading.
- Fix: Reserve the space: render the pills in an absolutely-positioned layer over the icon's slot (right-aligned, bg-paper-1 with shadow), or animate the swap width with a fixed-width container so the title never reflows.
- Verified: Re-read lines 2292–2350: conditional swap, pill classes, shared row with flex-1 min-w-0 title and Level pill all match; only the incoming pill group is animated (springTactile on opacity/scale/y), the row reflow itself is unanimated. Confirmed the 5s auto-disarm timer at lines 1205–1209 with its own comment. Width estimate (~44–48px per pill ×3 + gaps vs 32px icon) is fair.

**LS-10 · P2 · effort:small — Screen-header rhythm drifts across the five tabs: eyebrow→title gap is 10px or 12px, and the header's bottom margin is 32, 36 or 40px**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3508`
- Evidence: Dashboard: eyebrow then h1 "mt-2.5" (2175, 10px). Upload: eyebrow "mb-3" (2602, 12px), header "mb-10" (2601). Library: "mb-3" (2817), header "mb-8 md:mb-10" (2816). Stats: eyebrow "mb-2.5" (3508, 10px), header "mb-8 md:mb-10" (3507). Quiz: header "mb-9" (3547, 36px), eyebrow row "mb-3.5" (3548, 14px).
- Impact: The eyebrow/title/lede lockup is the app's signature moment on every screen, and its internal spacing changes by 2–4px and its clearance by up to 8px depending on the tab — exactly the kind of micro-inconsistency that makes a template feel hand-assembled rather than systematic.
- Fix: Fix one lockup and reuse it: eyebrow mb-3, h1, lede mt-3, header mb-8 md:mb-10 — then apply the same classes on all five tabs (quiz included).
- Verified: All five header lockups re-read at the cited lines: dashboard h1 mt-2.5, upload eyebrow mb-3 + header mb-10, library mb-3 + mb-8 md:mb-10, stats mb-2.5 + mb-8 md:mb-10, quiz header mb-9 + eyebrow row mb-3.5. The 10/12/14px eyebrow gaps and 32/36/40px clearances are all present as claimed.

**LS-11 · P2 · effort:small — The same model <select> is 52px tall on Upload and 48px in the Quiz — and wears two different skins (input-dark vs btn-secondary)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2780`
- Evidence: Upload: module select "h-12" (2674) and topic input "h-12" (2694), but the model select is "input-dark sm:w-[200px] h-[52px] px-4 text-sm" (2780) beside a submit that is "h-14 sm:h-[52px]" (2789, after the working-tree mobile tweak). Quiz: the identical model picker is "btn-secondary sm:w-[200px] h-12 px-4 text-[13px]" (3983) beside an "h-14 sm:h-12" submit — different height, different skin, different font size for the same component.
- Impact: On sm+ the upload form mixes 48px inputs with a 52px control row for no hierarchy reason, and the exact same model picker renders 4px shorter with a different surface treatment and 1px-smaller type on the quiz screen — the kind of drift users perceive as 'slightly off' when moving from upload to quiz.
- Fix: Standardize form controls at one height on sm+ (h-12, scaling the upload CTA row down from 52px or deliberately up to a named size) and give the model picker one consistent treatment (input-dark, one font size) in both places. The mobile h-14 CTA from the recent tweak can stay as the deliberate primary-action emphasis.
- Verified: Checked against the uncommitted working-tree tweaks: they only changed the submit buttons (h-14 mobile / flex-none, gap-3) — the selects are untouched, so the 52-vs-48px sm+ drift and the input-dark vs btn-secondary + text-sm vs text-[13px] skin split for the identical picker remain real. Evidence updated to quote the current post-tweak button classes.

**LS-12 · P2 · effort:small — Empty/error state cards use five different paddings (p-9, p-10, p-12 md:p-16, p-14) and two icon-tile sizes for the same pattern**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2228`
- Evidence: Dashboard empty: "card-surface-elevated p-9 flex flex-col items-start" (2228 — also the only left-aligned one, and the only one on an elevated surface). Library no-results: "card-surface p-10" (2888, bare icon, no tile). Library error/empty: "card-surface p-12 md:p-16" (2898, 2921). Stats error: "card-surface p-14" with icon tile "w-12 h-12" (StatsPanel.tsx 351–352), while the others use "w-[52px] h-[52px]" tiles (2229, 2922, StatsPanel 364).
- Impact: The rest-state screens — the moments the design intentionally slows down and speaks — each breathe differently: 36 vs 40 vs 48/64 vs 56px of air, plus a 48px icon tile where siblings use 52px, plus one left-aligned outlier. Side by side (library empty vs stats empty on adjacent tabs) the mismatch is visible.
- Fix: One EmptyState recipe: card-surface p-12 md:p-16, w-[52px] icon tile, display-serif title, max-w-sm lede — reuse it in all six locations (also fixes the left-aligned dashboard empty state vs centered everywhere else).
- Verified: All six call sites re-read: 2228 (p-9, items-start, card-surface-elevated), 2888 (p-10, bare MagnifyingGlassIcon), 2898/2921 (p-12 md:p-16, centered, 52px tiles), StatsPanel 351 (p-14, w-12 tile), StatsPanel 363 (p-12 md:p-16, w-[52px] tile). Every quoted class matches; the surface-level split (elevated vs flat) is an extra inconsistency beyond the original claim.

**LS-13 · P2 · effort:small — Settings 'Appearance' section puts its body copy above the caps-label heading — inverted against every sibling section in the same modal**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4468`
- Evidence: Lines 4468–4471: <p className="text-xs text-ink-600 mb-4">…Wie dein Lernraum beleuchtet ist…</p> followed by <h4 className="caps-label mb-2.5">Theme</h4>. Every other section leads with the h4 caps-label, description after (dictation: h4 at 4693 then p at 4694; AI connection: h4 at 4724 then p at 4725).
- Impact: Scanning the settings modal, the eye uses the caps-labels as section anchors; the first section breaks the scan pattern with an orphaned paragraph floating directly under the modal header, reading like a stray subtitle rather than part of 'Theme'.
- Fix: Move the sentence below the Theme heading (or add an 'Appearance' caps-label above it, or drop it — the modal's own subtitle already covers the idea) so all sections follow the h4 → description → control order.
- Verified: Confirmed at 4468–4471: the p precedes the h4 with no heading above it, while both sibling sections (Interaktiver Modus · Diktat at ~4693, KI-Verbindung at ~4724) lead with their caps-label h4 then the description paragraph. The inversion is real and unique to the first section.

**LS-14 · P2 · effort:small — Dashboard 'Upcoming' rows use 22px gutters / 13px vertical padding while library rows use 20px / 14–16px — same list-row DNA, different metrics**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2520`
- Evidence: Upcoming rows: "py-[13px] px-[22px]" with divider "mx-[22px]" (2516, 2520). Library module headers: "px-5 py-4" (3007); lecture rows: "px-5 py-3.5" (3107). All are hover-highlight rows inside card-surface containers.
- Impact: Two screens apart, visually identical row lists sit on different gutters (22 vs 20px) and off-grid vertical rhythm (13px), so cards that should feel like one component family are optically misaligned relative to their card padding (px-5 content elsewhere in the same cards).
- Fix: Settle list rows on px-5 (matching card content gutters) with py-3.5, and dividers on mx-5; delete the 22/13px one-offs.
- Verified: Confirmed at the cited lines: 2516 divider mx-[22px], 2520 row py-[13px] px-[22px] with hover:bg-(--paper-hover); 3007 module header px-5 py-4 press-row; 3107 lecture row px-5 py-3.5 hover:bg-paper-0 press-row. Same interaction pattern (hover-highlight rows in card-surface), different metrics — as claimed.

**LS-15 · P2 · effort:small — Heatmap grid fills only ~460px of a ~900px desktop card, with the legend right-aligned past the grid's edge**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:494`
- Evidence: Cells are fixed "w-[13px] h-[13px]" in "flex gap-1 min-w-max" (494, 517): 26 weeks ≈ 460px including the weekday gutter, inside a card that spans the max-w-5xl stats column. The legend row is "flex items-center justify-end" (524), pinning Less/More to the card's far right, hundreds of pixels from where the grid ends. Legend swatches are also w-3 (12px) vs the 13px cells (526–530).
- Impact: On desktop the marquee chart floats in the card's left half with a large dead zone, and its legend is visually attached to nothing. The composition reads unfinished compared to the tightly-fitted flex-1 bar charts below it on the same page.
- Fix: Let cells flex to fill (grid with 26 equal columns, aspect-square cells) or center the fixed grid and left-align the legend to the grid's right edge; match legend swatch size to cell size (13px).
- Verified: Confirmed: 26 fixed-width week columns (loop at 226), w-[13px] cells with gap-1 (517), min-w-max container (494), legend justify-end with w-3 swatches (524–530). Width math re-derived at ≈455–460px vs a max-w-5xl (1024px) column — the dead-zone claim is fair on any desktop viewport; the forecast/level charts below do use flex-1 full-width bars.

**LS-16 · P2 · effort:small — 3-up segmented controls in Settings wrap German labels to two lines on small phones, breaking the pill's line rhythm**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4705`
- Evidence: Dictation segmented (4699–4722) puts "Hybrid · empfohlen" / "Gemini" / "Browser" in flex-1 .segmented-item cells (globals.css 643: flex:1, padding 8px 10px, font-size 13px, weight 600). In the max-w-[560px] modal (overlay p-4, panel p-5 on mobile) at a 375px viewport, each cell nets roughly 78–80px of text width — "Hybrid · empfohlen" (~120px at 13px/600) wraps, as do the AI-connection labels "Proxy für alles" / "Nur Generierung" (4759, 4785).
- Impact: One segment wraps to two lines while its neighbors stay single-line: the whole control grows taller (flex stretch equalizes the cells, so the wrapped segment forces everyone to its height) with mixed one- and two-line labels inside the active pill — a visually broken control on precisely the settings screen that showcases the design system.
- Fix: Shorten the labels on mobile ("Hybrid" with the ' · empfohlen' hint moved to the description; "Proxy", "Generierung", "Fallback") or add whitespace-nowrap + truncation with a 12px floor and let the description carry the nuance.
- Verified: Verified the labels at 4705 ("Hybrid · empfohlen") and 4759/4785 ("Proxy für alles", "Nur Generierung") and the .segmented-item CSS (flex:1, 8px 10px padding, 13px/600). Width math: 375 − 32 (overlay p-4) − 40 (panel p-5) ≈ 303px content, ÷3 minus item padding ≈ 78px per cell — the long labels do wrap. Corrected the original impact's 'uneven cell heights' claim: flex stretch keeps cells equal-height; the real defect is the mixed line counts and doubled control height.

**LS-17 · P2 · effort:small — Unmotivated 1–2px near-misses in the hand-tuned metric set (px-[34px] vs py-9, pt-[18px] vs pb-4, pt-[46px])**
- Status: ⏳ open
- Where: `src/app/login/LoginClient.tsx:107`
- Duplicate-of/with: EL-18
- Evidence: Login auth card: "card-glass px-[34px] py-9" (107 — 34px vs 36px axes). Due card: "pt-[18px] pb-4" (18 vs 16px, DashboardClient.tsx 2299). Main content: "pt-8 md:pt-[46px]" (DashboardClient.tsx 2143 — 46px, neither 44 nor 48). Also h-[50px] mt-[26px] gap-[11px] on the login button (126).
- Impact: The app clearly embraces optical hand-tuning (h-[38px] nav, 264px sidebar), but these pairs differ by 2px within the same box with no optical rationale — they read as typed-in approximations, and they make the spacing system unauditable because intentional and accidental off-grid values are indistinguishable.
- Fix: Where no optical reason exists, snap to the neighbor: login card p-9 both axes, due card pt-4 pb-4 (the amber thread already provides the top accent), main md:pt-12 or md:pt-11. Document the few deliberately off-grid constants (38px nav height, 264px rail) in a comment so future edits keep the distinction.
- Verified: All four citations confirmed in the working tree: LoginClient 107 card-glass px-[34px] py-9; LoginClient 126 h-[50px] mt-[26px] gap-[11px]; DashboardClient 2299 pt-[18px] pb-4; DashboardClient 2143 pt-8 md:pt-[46px]. The h-[38px] nav items (2050+) and w-[264px] sidebar (2035) also verified, so the 'deliberate vs accidental off-grid' framing is accurate.


### Accessibility (19)

**AX-1 · P0 · effort:medium — All seven modals lack dialog semantics and any focus management (no role, no initial focus, no trap, no restore)**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:4433`
- Evidence: Every overlay is a bare motion.div: `{showSettingsModal && (<motion.div key="settings-overlay" {...overlayMotion} className="fixed inset-0 flex items-center justify-center p-4 z-[60]" onClick={closeSettingsModal}>` — same pattern for archive (L4105), feedback (L4157), calendar (L4322), prompts list (L4900), comprehension feedback (L4949), prompt viewer (L5006). Grep across src confirms zero occurrences of role="dialog", aria-modal, autoFocus, or .focus() into a panel; the only .focus() call is the ⌘K search (L1900). Escape works (global handler L1172) but nothing else does.
- Impact: When a modal opens, a screen reader announces nothing and focus stays on the trigger behind the dim overlay. Tab then walks through the entire invisible background page (sidebar, cards, footer) while the modal visually blocks it — a keyboard user must blindly traverse dozens of hidden controls to reach the settings panel, and on close focus is stranded wherever it drifted. This affects every overlay in the app.
- Fix: Add `role="dialog" aria-modal="true" aria-labelledby={titleId}` to each modalPanel, move focus to the panel (or its close button) on open, trap Tab inside (a ~20-line focus-trap hook shared by all seven, or `inert` on the app shell while open), and restore focus to the trigger on close. The shared modalPanel pattern makes this one wrapper component.
- Verified: Read all seven modal blocks (L4105, 4157, 4322, 4430, 4900, 4949, 5006): every one is a bare motion.div + card-glass panel with no role/aria-modal. Grepped src/ for role="dialog", aria-modal, autoFocus, .focus( — only hit is librarySearchRef.current?.focus() at L1900. Escape handler confirmed at L1172-1189. Finding fully accurate.

**AX-2 · P0 · effort:small — Due cards and all 'Upcoming' rows are click-only divs — the app's core action is keyboard-inaccessible beyond the first item**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2298`
- Duplicate-of/with: IS-2
- Evidence: Due card: `<motion.div key={review.id} variants={riseChild} whileHover={{ y: -1 }} ... onClick={() => startQuiz(review)} className="card-surface-elevated group cursor-pointer ...">` — no role, no tabIndex, no onKeyDown (grep confirms zero tabIndex in the file). Upcoming row (L2517–2520): `<div onClick={() => startQuiz(review)} className="grid grid-cols-[1fr_auto_auto] ... cursor-pointer ...">`. Escape hatches: the 'Start reviewing' button (dueItems[0], L2192), the Enter shortcut (also only the first due item, L1925-1933), and a 'Review ahead' button for scheduledItems[0] that only renders when nothing is due (L2198).
- Impact: A keyboard or switch user can start the FIRST due review, but cannot open due review #2..N, nor any scheduled review while anything is due — the primary interaction of a study app is mouse/touch-only. Screen readers announce the cards as plain text with no hint they are actionable, while the nested snooze/delete buttons ARE focusable, which makes the card read as inert content with orphaned controls.
- Fix: Make the card title the real control: wrap the topic line in a `<button onClick={() => startQuiz(review)}>` (topic + 'Level X of 7' as its accessible name) and keep the div onClick as a bonus hit area, or add `role="button" tabIndex={0}` + Enter/Space onKeyDown to the div. Same for the Upcoming rows.
- Verified: Confirmed motion.div onClick at L2298 and upcoming-row div onClick at L2519, both with cursor-pointer and no role/tabIndex/onKeyDown; grep shows zero tabIndex anywhere in the file. Corrected one overstatement: a 'Review ahead' button (L2198) starts scheduledItems[0], but only in the zero-due state — the core claim (items #2..N unreachable) holds.

**AX-3 · P0 · effort:small — html lang="en" while the app's default UI language (and the entire login page) is German**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/layout.tsx:54`
- Duplicate-of/with: TY-5
- Evidence: `<html lang="en" className={...}>` is hardcoded (layout.tsx L53-57), but DashboardClient defaults `initialLanguage = "german"` (L505, and page.tsx L44 `config?.language ?? "german"`) and LoginClient is 100% hardcoded German ('Lerne weniger.' L76, 'Melde dich mit Google an…' L113). The language toggle in Settings never updates the lang attribute — grep confirms no `document.documentElement.lang` write exists anywhere.
- Impact: Screen readers pick the speech engine from `lang` — German text like 'Guten Morgen', 'Jetzt wiederholen', 'Verständnis-Check' gets pronounced with English phonetics, which is close to unintelligible. WCAG 3.1.1 (Language of Page) fails for the app's default audience.
- Fix: Set `lang="de"` as the server default (mirroring initialLanguage), and in the settings language handler also run `document.documentElement.lang = next === 'german' ? 'de' : 'en'`. For mixed content (English quiz text inside a German UI) add `lang` on the quiz body container.
- Verified: Read layout.tsx in full: lang="en" hardcoded at L54. Verified initialLanguage default "german" (DashboardClient L505, page.tsx L44) and German-only LoginClient copy (L76, L113). Grepped src/ for documentElement.lang and lang= — no dynamic writes anywhere. Overlaps a typography-dimension finding on the same line but stands on its own a11y merits.

**AX-4 · P0 · effort:small — Library edit-mode 'Remove module' controls are role="button" spans with no tabIndex or key handler — module deletion is impossible by keyboard, and they're nested inside another button**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3069`
- Evidence: Inside the module-header `<button>` (L3001-3008, className="w-full flex items-center ... press-row"): `<span role="button" aria-label={... "Modul entfernen" ...} onClick={(e) => handleDeleteLibraryModule(e, modKey, lectures)} className="w-[30px] h-[30px] rounded-full ...">` (L3068-3076) and the armed confirm `<span role="button" onClick=...>...löschen?</span>` (L3059-3067). Neither has tabIndex={0} nor onKeyDown, and both sit inside the expand/collapse button.
- Impact: Keyboard users can enter Edit mode ('Bearbeiten' is a real button, L2866-2870) but then cannot arm or confirm a module delete — the feature dead-ends. Screen readers encounter a button nested inside a button (invalid ARIA structure); pressing Enter on the header toggles the accordion instead. The two-step confirm is unreachable non-visually.
- Fix: Restructure the module header row as a div containing two sibling real `<button>`s (header-toggle + delete) laid out with flex, instead of nesting. If the row must stay one button, render the delete control as an absolutely-positioned sibling. role="button" spans always need tabIndex={0} and Enter/Space handling — but a real <button> here is simpler and fixes the nesting too.
- Verified: Read L2995-3085: both role="button" spans confirmed at L3059 and L3068-3076, nested inside the `<button className="w-full flex ...">` opened at L3001. No tabIndex/onKeyDown on either span. 'Bearbeiten' toggle is a real button. Enter on the header fires the accordion onClick. Fully accurate.

**AX-5 · P0 · effort:small — No live region anywhere: the grading verdict — the app's earned moment — is never announced to screen readers**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3758`
- Duplicate-of/with: MO-5
- Evidence: Grep across src finds zero `aria-live` (the only announcements are Toast's role="status"/"alert", Toast.tsx L58/L91). Submitting answers swaps the quiz for the grading screen (`{isGrading ? ... : gradingResult ? ...}` L3696/3758) whose progress text (setGradingMsg, examiner steps) and final verdict header render silently. The upload pipeline progress (L2609–2660) is equally silent, and grading success fires no toast — only the error paths call addToast (L1789, L1802, L1813).
- Impact: A screen-reader user submits, waits ~60 seconds, and hears nothing — not the examiner progress steps, not the pass/repeat verdict, not the next review date. They must manually re-explore the page to discover whether they passed. The most emotionally-designed moment in the product ('the earned pass moment') is inaudible.
- Fix: Add one visually-hidden `aria-live="polite"` region near the quiz root that mirrors key transitions: 'Grading started', the current gradingMsg on step changes, and on completion 'Passed — Level 4 unlocked, next review Friday 12 July' / 'Repeat — comes back tomorrow'. Same region can serve the upload pipeline ('Module created, first review tomorrow').
- Verified: Grepped src/ for aria-live: zero hits. Verified the isGrading/gradingResult conditional swap (L3696/3758) and read the grading `done` handler (L1762-1784): it only sets state, no toast — addToast fires exclusively on error/timeout paths. Toast roles confirmed at Toast.tsx L58/L91. Fully accurate.

**AX-6 · P1 · effort:small — Selected state is visual-only across nav tabs, all segmented controls, and the theme/accent pickers**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4662`
- Evidence: Language segments: `<button ... className="segmented-item" data-active={language === 'german'}>Deutsch</button>` (L4662-4663) — data-active drives CSS only (globals.css L655). Same for dictation (L4703-4717), AI connection (L4757-4803), PDF delivery (L4828-4836). Sidebar nav (L2050–2069) marks the active tab purely via `nav-item-active` class — no aria-current. Theme cards (L4481+) and accent swatches (L4539+) convey selection via border color / box-shadow ring and a CheckIcon that heroicons renders aria-hidden. Meanwhile StatsPanel's semester chips DO set `aria-pressed` (StatsPanel L436/446) — the correct pattern exists in the codebase but only there.
- Impact: A screen-reader user opening Settings hears 'Deutsch, button. English, button.' with no way to know which is active; same for every preference, the current tab, and the chosen theme/accent. They must toggle blindly and infer from side effects.
- Fix: Add `aria-pressed={active}` to every segmented-item, theme card and accent swatch (or make each group role="radiogroup" with role="radio"/aria-checked and arrow-key movement), and `aria-current="page"` on the active sidebar nav button. This mirrors the pattern already shipped in StatsPanel.
- Verified: Grepped data-active: 10 call sites (L4663-4836), all CSS-only per globals.css L655. Read sidebar nav L2050-2069: class-switching only, grep confirms zero aria-current/aria-checked/role="switch" in the file. Theme/accent pickers (L4481, L4539-4556) use border/boxShadow + CheckIcon for selection. StatsPanel aria-pressed at L436/446 confirmed. Fully accurate.

**AX-7 · P1 · effort:small — Keyboard focus is invisible on the grading-model selects: global CSS strips select outlines but .btn-secondary defines no replacement**
- Status: ⏳ open
- Where: `src/app/globals.css:358`
- Evidence: globals.css L358-362: `input:focus-visible, textarea:focus-visible, select:focus-visible { outline: none; }` — the replacement ring only exists on `.input-dark:focus` / `.input-inset:focus` (L556–575). But the quiz tab's model pickers are `<select value={gradingModel} ... className="btn-secondary sm:w-[200px] h-12 ...">` (DashboardClient L3981–3984 and L4063–4066), and `.btn-secondary` (L507-525) has no :focus rule at all. The upload tab's select correctly uses input-dark (L2674) — proving the drift.
- Impact: Tabbing to the model select on the quiz screen produces zero visible focus indication — a keyboard user loses their place right next to the primary submit button. WCAG 2.4.7 failure on a control that sits in the main task flow.
- Fix: Either give the quiz selects the input-dark focus treatment, or scope the outline-stripping rule to `.input-dark, .input-inset` instead of all inputs/selects: `select:focus-visible { outline: 2px solid color-mix(in srgb, var(--a-g2) 60%, transparent); }` for any select without its own ring.
- Verified: Read globals.css L340-380 (outline-strip rule at L358-362) and the full .btn-secondary block (L507-525: background, border, shadow, hover, active — no :focus). Both quiz selects confirmed as btn-secondary (L3981, L4063); upload select is input-dark (L2674) with its own focus ring at L556. The working-tree diff touches the surrounding gaps but not the selects. Fully accurate.

**AX-8 · P1 · effort:medium — ink-400 (2.65:1) and ink-300 (1.9:1) are used for meaningful text throughout — far below AA contrast**
- Status: ⏳ open
- Where: `src/app/globals.css:76`
- Evidence: `--ink-400: #a89d8b` (L76) on paper-1 #fffefb = 2.65:1, on paper-0 #f6f3ec = 2.41:1; `--ink-300: #c4baa9` (L77) = 1.90:1 / 1.73:1 (AA requires 4.5:1 at these sizes). These aren't decoration: caps-label section headers are ink-400 at 11px (globals L468/477), library footnotes are `text-[10px] text-ink-300` (DashboardClient L3260), review-history 'kein Brief / no brief' is text-ink-300 at 9px (L4260), heatmap weekday labels are 8px ink-300 (StatsPanel L496), plus the quiz '⌘↵ to submit' hint tier. Ink theme is also sub-AA: ink-400 #7c7160 on #252019 = 3.38:1.
- Impact: Users with moderate low vision (and anyone on a dim screen in daylight) cannot read the layer of the UI that carries schedule dates, section labels, keyboard hints, and status footnotes. The quiet-paper aesthetic is achievable at compliant ratios — right now the whole 'whisper' tier is illegible for a real slice of users.
- Fix: Retune the two tokens toward compliance where they carry words: shift --ink-400 to ~#857a67 (≈4.5:1 on paper-1) and reserve current ink-300 for purely decorative strokes; where 10px ink-300 text exists, promote it to ink-400/ink-600. Verify the ink theme equivalents (target ≥4.5:1 against paper-1 #252019).
- Verified: Recomputed all ratios with WCAG relative luminance: ink-400/paper-1 = 2.65:1, ink-400/paper-0 = 2.41:1, ink-300/paper-1 = 1.90:1, ink-theme ink-400 = 3.38:1 — all match the claims. Verified token hexes (globals L74-77, L175-178) and every cited call site (caps-label L468/477, DashboardClient L3260/L4260, StatsPanel L496). Corrected line to 76. Note: overlaps the color-contrast dimension's ink-400/ink-300 findings — flag for cross-batch dedupe.

**AX-9 · P1 · effort:medium — Stats heatmap and chart data live only in hover tooltips on non-focusable divs (and Tip puts aria-label on generic divs, which ARIA ignores)**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:516`
- Evidence: `<Tip key={cell.key} label={`${cell.date.toLocaleDateString(locale)} — ${cell.count} ...`}><div className="heat-cell w-[13px] h-[13px] rounded-[3px] ..." /></Tip>` (L516-518) — Tip shows on focus (Tooltip.tsx L68 onFocus) but the div has no tabIndex so focus never lands there; Tip also mirrors the label into `aria-label` on the div (Tooltip.tsx L51–58), which is prohibited/ignored on a generic role. Same pattern for the 14-day forecast bars (L584-585) and the 7-dot level indicators in the library (DashboardClient L3139–3149). Cell intensity is conveyed by color alone (heatColor classes).
- Impact: Keyboard and screen-reader users get no access to six months of per-day activity or per-day forecast details; low-vision users can't distinguish the amber intensity steps. The forecast/level charts survive because counts are printed as text — the heatmap has no text alternative at all (grep: no sr-only in StatsPanel).
- Fix: Give the heatmap a text fallback: either make each cell a focusable element with role="img" and the existing label (`tabIndex={0}` on ~180 cells is heavy — a per-week roving tabindex or a single visually-hidden monthly summary sentence is lighter), and add a visually-hidden summary like 'Reviewed on 34 of the last 180 days; busiest day 12 June with 8 reviews.' In Tooltip.tsx, only mirror aria-label when the child is interactive.
- Verified: Read StatsPanel L505-600 and Tooltip.tsx in full: heat cells are bare divs inside Tip (L516-518), Tip's aria-label mirroring confirmed (L51-58), onFocus-only reveal confirmed (L68), no tabIndex anywhere. Forecast bars do print counts as visible text (L586) — the finding correctly concedes this. Grep confirms zero sr-only in StatsPanel. Adjusted line 517→516.

**AX-10 · P1 · effort:medium — TutorPanel slide-over: focus never enters it, streamed replies are silent, and the composer has placeholder-only labeling**
- Status: ⏳ open
- Where: `src/app/components/TutorPanel.tsx:333`
- Duplicate-of/with: MT-11
- Evidence: The panel opens as `<motion.aside ... aria-label={de ? "Live Tutor Chat" : "Live tutor chat"}>` (L293-300) portaled to document.body (createPortal, last line of file) — no focus move on open (grep: zero autoFocus/.focus() in the file), no focus return on close, and since it's portaled to the end of body, Tab from the 'Tutor' toggle walks the whole quiz first. The message list `<div ref={scrollRef} className="flex-1 overflow-y-auto ...">` (L333) has no aria-live, so the streamed tutor answer (and the 'denkt nach…' state, L393-397) is never announced. The composer AutoGrowTextarea (L408–418) has only `placeholder={de ? "Frag deinen Tutor…" : "Ask your tutor…"}` — AutoGrowTextarea passes props straight to a bare textarea.
- Impact: A screen-reader user presses 'Tutor', hears nothing happen, and must hunt to the end of the page to find the panel; after sending a question the reply streams in complete silence. The main input has no accessible name once text is typed (placeholder disappears).
- Fix: On open, focus the composer textarea; on close, return focus to the Tutor toggle. Wrap the messages container in `aria-live="polite"` (announce completed messages, not every streamed token — e.g. a hidden live node updated in the stream's finally block). Add `aria-label={de ? "Frag deinen Tutor" : "Ask your tutor"}` to the textarea.
- Verified: Read TutorPanel L290-440 and the file tail: createPortal(..., document.body) confirmed, aside has aria-label but grep shows no autoFocus/.focus() anywhere in the component; message list at L333 has no aria-live; composer at L408-418 is placeholder-only. Read AutoGrowTextarea.tsx: it forwards props to a plain textarea, adding nothing. Fully accurate.

**AX-11 · P1 · effort:small — Upload and quiz form fields have visual labels that aren't programmatically associated**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2667`
- Evidence: `<label className="caps-label leading-tight">{`Modul (Semester ${currentSemester})`}</label>` (L2667) has no htmlFor and the `<select>` below no id (L2671-2675); same for 'Thema/Topic' (L2688 label / L2689-2695 input) and 'Vorlesungsmaterial' (L2699 label / textarea below, placeholder-only). Quiz answer boxes are labeled by a `<span className="caps-label">Deine Antwort</span>` (L3907) with no id/aria-labelledby on the AutoGrowTextarea below (L3928+); the library search (L2832-2843) is placeholder-only. Only the file input's label is correctly wired (`htmlFor="file-upload"`, L2744).
- Impact: Screen readers announce 'edit text, blank' for the topic field and 'combo box' with no name for the module picker; in the quiz, ten identical unnamed textareas are indistinguishable. Clicking the visual labels also doesn't focus the fields — a small motor-accessibility loss.
- Fix: Add id/htmlFor pairs on the upload form, `aria-label={"Search module or lecture"}` on the library search, and per-task names on quiz textareas: `aria-label={`${task.label} — your answer`}` (task.id is already unique).
- Verified: Read L2660-2770 (upload form), L3900-3935 (quiz answer), L2830-2850 (library search): all labels are bare `<label>` elements without htmlFor, fields have no id/aria-label; the quiz label is a span; the one wired label (htmlFor="file-upload") confirmed at L2744. AutoGrowTextarea adds no labeling. Fully accurate.

**AX-12 · P1 · effort:small — Toast close buttons are hardcoded aria-label="Close" in a bilingual app, and toasts auto-dismiss on a fixed 5s timer with no pause**
- Status: ⏳ open
- Where: `src/app/components/Toast.tsx:74`
- Duplicate-of/with: MC-18
- Evidence: `<button onClick={() => onDismiss(toast.id)} className="shrink-0 text-ink-600 ... p-0.5" aria-label="Close">` (L71-77, and L106 on the undo bar) — English-only while every other label in the app is language-switched; ToastStack's props are only `{ toasts, onDismiss }` (L44), it never receives `language`. Dismissal: `window.setTimeout(() => dismissToast(id), variant === "undo" ? UNDO_DISMISS_MS : AUTO_DISMISS_MS)` (L37, 6000/5000ms) — no pause on hover/focus, and the undo action vanishes after 6s regardless.
- Impact: German screen-reader users hear an English 'Close' mid-German UI; slower readers (or anyone mid-mouse-travel) lose error messages and — worse — the undo affordance for snooze before they can act on it (WCAG 2.2.1). The close hit area is also ~20px (p-0.5 on a 16px icon), below any touch guideline.
- Fix: Pass the UI language into useToasts/ToastStack (or accept a closeLabel prop). Pause the dismiss timer on mouseenter/focusin of the stack and resume on leave — standard toast behavior. Bump close-button padding to p-2 (≥36px). Consider 10s for undo toasts.
- Verified: Read Toast.tsx in full: aria-label="Close" at L74 and L106, ToastStack signature takes only toasts/onDismiss, fixed setTimeout at L37 with no pause/clear-on-hover logic anywhere, close button p-0.5 + w-4 icon ≈ 20px. All claims accurate.

**AX-13 · P1 · effort:medium — Two-step confirms (snooze, delete) destroy keyboard focus when they arm, then time out after 4–5s**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2314`
- Duplicate-of/with: LS-9
- Evidence: Arming snooze replaces the focused clock button with the pill row: `{snoozeArmedId === review.id && !snoozingIds[review.id] ? (<motion.div ...>{[1, 3, 7].map(...)}</motion.div>) : (<button onClick={... setSnoozeArmedId(review.id)}>` (L2314-2343) — the focused element unmounts, dropping focus to <body>. The armed state then self-resets: `window.setTimeout(() => setSnoozeArmedId(null), 5000)` (L1205-1209); delete confirms reset at 4000ms (L1191-1195). Same swap for the delete trash button → 'Wirklich löschen?' motion.button (L2392-2417).
- Impact: A keyboard user activates snooze, focus silently jumps to the top of the document, and they have 5 seconds to tab all the way back to pills that will have disappeared. The forgiving two-step pattern — a design centerpiece — is effectively unusable without a mouse.
- Fix: After arming, move focus programmatically to the first pill / the confirm button (ref + effect, or render the confirm as the same persistent button whose label and handler change so focus never unmounts). Extend or suspend the auto-reset while any pill/confirm has focus.
- Verified: Verified the conditional swap at L2314 (snooze) and L2392-2417 (delete): the armed UI is a different element conditionally rendered in place of the trigger, so the focused node unmounts and focus falls to body. Timers confirmed: 5000ms snooze (L1205-1209), 4000ms delete (L1191-1195). Escape does back out of armed confirms (L1182-1184) but doesn't fix the focus loss. Adjusted line 2337→2314.

**AX-14 · P2 · effort:small — Tooltips violate WCAG 1.4.13: not dismissible with Escape and not hoverable**
- Status: ⏳ open
- Where: `src/app/components/Tooltip.tsx:62`
- Evidence: The wrapper handles `onMouseEnter/onMouseLeave/onMouseDown/onFocus/onBlur` only (L62-69) — no keydown, so Escape doesn't hide an open tooltip while a control is focused. The bubble itself is `pointer-events: none` (globals.css L828), so pointer users can't move onto it. It's also role="tooltip" (L75) without aria-describedby wiring — harmless here since the label is mirrored to aria-label, but the role is inert.
- Impact: Keyboard users who focus a control get a persistent bubble they can't dismiss without blurring, which can cover adjacent content (e.g. the interactive control bar's tightly packed buttons); magnifier users can't hover the bubble to keep reading. Formal 1.4.13 failure.
- Fix: Add a document keydown listener while `pos` is set: Escape → hide(). That single change satisfies 'dismissible'. Hoverable matters less at 260px max-width but could be added by delaying hide 100ms and cancelling if the pointer enters the bubble (requires removing pointer-events:none).
- Verified: Read Tooltip.tsx in full: event handlers are exactly onMouseEnter/Leave/Down + onFocus/Blur (L62-69), no keydown listener exists; .tip-bubble has pointer-events: none (globals.css ~L828, verified); portal span is role="tooltip" with no describedby wiring. Fully accurate.

**AX-15 · P2 · effort:small — Long scrollable text regions (prompt viewer, grading error, history briefs) are unreachable by keyboard scrolling**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:5045`
- Evidence: Prompt viewer body: `<div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-6"><pre ...>{promptModal.content}</pre></div>` (L5044-5046) — no tabIndex and no focusable children, so arrow keys can never scroll it. Same for the grading error `<pre className="... max-h-40 overflow-y-auto ...">` (L3685) and the expanded history brief `<div className="max-h-64 overflow-y-auto custom-scrollbar"><FeedbackBody .../></div>` (L4292).
- Impact: Keyboard-only users can read only the first screenful of a multi-page prompt or a long feedback brief; the rest is physically unreachable. (Chrome makes scrollables focusable heuristically, but Safari/Firefox don't.)
- Fix: Add `tabIndex={0} role="region" aria-label={promptModal.title}` (and equivalents) to these three scroll containers so they take focus and respond to arrow/PageDown keys in every browser.
- Verified: Verified all three scroll containers: prompt viewer (L5044-5046, pre of plain text), grading error pre (L3685), history brief wrapper (L4292) — none have tabIndex or focusable descendants. The browser-heuristic caveat is correctly stated. Fully accurate.

**AX-16 · P2 · effort:small — Heading outline is broken: brand wordmark rendered as h1 alongside each page h1, and h2/h3/h4 levels skip and shuffle across surfaces**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2013`
- Evidence: The brand wordmark is an h1 in the mobile top bar (`<h1 className="text-[15px] font-bold ...">SRS <span ...>Master</span></h1>`, L2013) AND in the sidebar (L2042), alongside each tab's real h1 (greeting L2175, library L2818, stats L3509, quiz topic L3565) — so at any viewport a screen reader sees the logo as an h1 above the page title. Under the dashboard h1, the empty state jumps straight to h3 (L2232). Modal titles are inconsistent levels: calendar uses h2 (L4334), settings/feedback/archive use h3 (L4448/L4172/L4118) with h4 sections below; the feedback modal has two sibling h3s — title (L4172) and the caps label (L4188).
- Impact: Screen-reader users navigating by headings (the single most-used SR navigation method) get a table of contents where the site logo appears as a page title and levels skip, making the dashboard structure hard to skim.
- Fix: Demote both brand wordmarks to `<p>` or a div (they're logos, not headings), keep 'Due today'/'Upcoming' as h2 (already correct), fix the empty/all-clear card titles from h3 to h2, and standardize modal titles as h2 with h3 sections.
- Verified: Enumerated every heading in the file: brand h1s at L2013/L2042 confirmed, tab h1s at L2175/2603/2818/3509/3565, empty-state h3 at L2232 directly under the h1 (skips h2), calendar h2 (L4334) vs settings/feedback/archive h3 (L4448/4172/4118), sibling h3s at L4172+L4188. Corrected one detail: the mobile bar is md:hidden, so only two h1s (not three) are in the accessibility tree at once — substance unchanged.

**AX-17 · P2 · effort:small — Push notification row renders a fake switch with no switch semantics**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2090`
- Evidence: `<button onClick={togglePush} className="... nav-item-idle">...<span className={`w-7 h-[17px] rounded-full relative inline-block transition-colors ${pushPermission === "granted" && pushSubscribed ? "bg-ink-900" : "bg-[color-mix(...)]"}`}><span className={`absolute top-0.5 w-[13px] h-[13px] rounded-full bg-paper-1 transition-transform ...`}></span></span></button>` (L2081-2093) — a decorative thumb-in-track with state conveyed only by which text variant renders ('Mitteilungen an/aus/blockiert').
- Impact: Screen readers announce it as a plain button; the on/off state IS in the visible text, so it's not broken, but the toggle affordance is invisible non-visually and the 'blocked' state gives no hint that activation will fail. Minor compared to the segmented controls, but the same class of gap on a stateful control.
- Fix: Add `role="switch" aria-checked={pushPermission === "granted" && pushSubscribed}` to the button and `aria-disabled` (or a clearer disabled treatment) when pushPermission === "denied" since clicking then only re-prompts a dead end.
- Verified: Read L2081-2093: fake track/thumb spans inside a plain button confirmed, state only in the label text variants; grep confirms zero role="switch"/aria-checked in the codebase. The finding fairly concedes the visible-text state. Accurate.

**AX-18 · P2 · effort:small — No skip link: keyboard users tab through the full sidebar (9+ stops) before reaching content on every tab switch**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2005`
- Evidence: DOM order inside `<div className="flex flex-col md:flex-row w-full print:hidden">` (L2005) is: mobile brand button, menu button (L2016), sidebar brand button (L2035+), 5 nav buttons (L2050-2069), push toggle (L2076), Live-Tutor teaser, sign-out (L2131), THEN `<main>` (L2143). No skip link exists anywhere (grep: no 'skip to', no href="#main"), and `<main>` has no id or tabIndex to target.
- Impact: Every keyboard journey to the day's reviews costs ~9 extra Tab presses past identical chrome; combined with the non-focusable due cards the keyboard path through the app is consistently slower than it needs to be.
- Fix: Add a classic visually-hidden-until-focused skip link as the first child of body ('Zum Inhalt springen / Skip to content') targeting `<main id="main" tabIndex={-1}>`. The paper design system's kbd/focus tokens already give it a natural styled appearance on focus.
- Verified: Verified DOM order (shell div L2005 → top bar → aside L2035 with nav L2049-2069, push toggle, sign-out L2131 → main L2143), main has no id/tabIndex, and grepped for skip links / #main anchors: none exist. Stop count of ~9 checks out on desktop (mobile bar is md:hidden). Accurate.

**AX-19 · P2 · effort:small — Sub-44px touch targets cluster on high-frequency controls (snooze pills 28px, tutor speak 24px, toast close ~20px)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2327`
- Evidence: Snooze interval pills: `className="h-7 px-2.5 rounded-full ..."` (L2327-2329, 28px tall, appear for 5 seconds under time pressure). Tutor read-aloud: `className="w-6 h-6 rounded-lg ..."` (TutorPanel L379, 24px). Toast close: `p-0.5` around a w-4 icon (Toast.tsx L73, ~20px). By contrast the app elsewhere is careful — sign-out uses `w-9 h-9 -m-1` (L2131), file-remove uses w-7 with negative margin (L2757).
- Impact: On iPhone/iPad (explicitly supported — safe-area insets, PWA install flow, Apple Pencil scribble) these are the controls used mid-flow: snoozing from bed, dismissing an error, replaying tutor audio. Sub-28px targets measurably raise mis-taps; the snooze pills combine a small target with a 5s deadline.
- Fix: Extend hit areas without changing visuals, matching the existing sign-out pattern: pills → `h-7` visual inside a `min-h-[44px] py-2 -my-2` wrapper or just h-9 px-3; tutor speak → `w-9 h-9 -m-1.5`; toast close → `p-2 -m-1.5`.
- Verified: Verified all three targets: snooze pills h-7 (L2327-2329), tutor speak w-6 h-6 (TutorPanel L379), toast close p-0.5 + w-4 icon (Toast.tsx L73); the sign-out w-9 h-9 -m-1 counter-example confirmed at L2131. Checked the uncommitted working-tree diff: it only enlarges the three primary submit/generate buttons (h-14) and select-row gaps — none of these targets are touched, so the finding is not already fixed.


### Empty, loading & error states (18)

**EM-1 · P0 · effort:small — Upload pipeline failure has no persistent error state — the 60s progress screen silently snaps back to the form**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:1657`
- Evidence: In handleGenerate, the NDJSON error branch does only `setProgressMsg(msg); addToast("error", ...)` (lines 1657–1661), then the `finally` block runs `if (!sawDone) setIsGenerating(false)` (line 1686) — the pipeline progress screen unmounts immediately. There is no `uploadError` equivalent of the quiz flow's persistent inline error card (`gradingError && !isGrading` at line 3679 renders a clay-wash panel with the raw server message in a mono block plus retry guidance).
- Impact: Generation takes ~1 minute and the microcopy invites patience ('Takes about a minute', line 2798). Users look away during such waits; if the AI pipeline fails, the only signal is a 5-second toast. They return to the upload form (still populated, but with no failure trace) and must guess whether the module was created — the failure moment is undesigned while the sibling grading flow got it right.
- Fix: Mirror the grading pattern: keep an `uploadError` state, and on error render a persistent clay-wash card above the form ('Your module wasn't created', the server message in the mono block, and a 'Try again' affordance that re-submits the still-populated form). Clear it on the next submit.
- Verified: Read handleGenerate in full (1603–1688): error branch at 1657–1661 only sets progressMsg + toast; finally at 1686 drops isGenerating so the tracker unmounts. Grepped for uploadError — does not exist. Confirmed gradingError renders a persistent inline card at 3679–3694, and the 'Takes about a minute' copy at 2795–2799. One correction: the form is NOT cleared on error (fields only reset in the done branch), so 'pristine' overstated — title adjusted; the substance (no persistent failure record) stands.

**EM-2 · P0 · effort:medium — Leaving the quiz mid-grade orphans the result — and starting another quiz shows the OLD verdict under the NEW quiz's header**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3752`
- Evidence: The grading screen promises 'Du kannst diese Seite verlassen — das Ergebnis wartet auf dich' / 'You can leave this page — we'll have it ready when you're back' (lines 3752–3756). But (a) when `done` fires (lines 1762–1784) it only sets state — no toast — and the sidebar nav (lines 2049–2070) has no quiz entry to return to, so a rescheduled/passed item's card vanishes from the due list and the result is unreachable; (b) `startQuiz` (line 1452) has no `isGrading` guard — clicking any due card mid-grade sets a new `selectedReview` and `setGradingResult(null)` while `isGrading` stays true, so the grading screen re-renders under lecture B's header (quiz view keys off `selectedReview`, line 3522), and when lecture A's stream finishes, `setGradingResult(...)` (line 1774) paints A's verdict beneath B's title.
- Impact: The copy explicitly invites navigation, then breaks its promise: the earned pass moment (the design system's one celebration) can silently evaporate, or worse, appear attributed to the wrong lecture — a trust-destroying moment in a grading product.
- Fix: Guard `startQuiz` while `isGrading` (or scope grading state per item); when `done` arrives on another tab, fire a success toast with a 'View result' action that restores the result screen; optionally show a small ember-dot 'grading…' pill in the sidebar while a grade is in flight.
- Verified: Verified the promise copy at 3752–3756; the done branch (1762–1784) calls no addToast; grepped setActiveTab("quiz") — only startQuiz (1522) sets it, and the nav (2049–2070) has dashboard/upload/library/stats/settings only. Verified startQuiz (1452–1528) has no isGrading check and resets gradingResult/gradingError, while isGrading is cleared only in handleGrade's finally (1815) — so the misattribution sequence is real: quiz view renders on selectedReview (3522), grading screen on isGrading (3696), result on gradingResult (3758), all cross-item.

**EM-3 · P0 · effort:small — Every voice-mode error message is hardcoded German — English users get untranslated failure toasts**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/useInteractiveQuiz.ts:306`
- Duplicate-of/with: MC-1
- Evidence: All eight `setError` strings are German literals regardless of the `language` option the hook already receives: 'Mikrofon-Zugriff wurde blockiert…' (306), 'Transkription fehlgeschlagen — nutze den „Nächste“-Button…' (478), 'Mikrofon nicht verfügbar…' (508, 575), 'Standard-Spracherkennung wird in diesem Browser nicht unterstützt…' (548), 'Aufnahme wird in diesem Browser nicht unterstützt…' (589), 'Sprachausgabe fehlgeschlagen…' (618, 641, 649). DashboardClient surfaces them verbatim: `if (interactive.error) addToast("error", interactive.error)` (line 704). The hook localizes STT language (`rec.lang = langRef.current === "English" ? "en-US" : "de-DE"`, line 278) but not its own copy.
- Impact: The app is meticulously bilingual everywhere else (every string has a `language === 'german' ?` branch). Error states — precisely the moments where comprehension matters most — are the one place the English experience collapses into German. Mic-permission failures on iOS are common, so this is regularly seen, not theoretical.
- Fix: The hook already receives `language`; route all setError strings through a small de/en message map, matching the tone of the rest of the app's error copy.
- Verified: Read useInteractiveQuiz.ts end-to-end: all eight cited setError lines (306, 478, 508, 548, 575, 589, 618, 641, 649) are German literals with no language branch, while rec.lang (278) and the /api/transcribe lang param (419, 470) ARE localized from the same prop. Confirmed DashboardClient toasts interactive.error verbatim at 704 and passes language at 693. The bilingual convention elsewhere is real (e.g. push errors at 806, 815–817 both have en branches).

**EM-4 · P1 · effort:small — Error toasts auto-dismiss after a fixed 5s with no hover-pause — long server errors are unreadable**
- Status: ⏳ open
- Where: `src/app/components/Toast.tsx:37`
- Evidence: `window.setTimeout(() => dismissToast(id), variant === "undo" ? UNDO_DISMISS_MS : AUTO_DISMISS_MS)` (line 37) — errors and successes share the same 5000ms (line 18). Nothing pauses the timer on hover/focus, and error toasts carry raw backend messages, e.g. `addToast("error", `Generierungsfehler: ${msg}`)` (DashboardClient line 1660) where `msg` is an arbitrary pipeline error.
- Impact: A two-line German API error at ~200 wpm needs more than 5 seconds; the moment a user moves the pointer to read (or screenshot) it, it can vanish mid-read. For the upload flow the toast is currently the ONLY failure record, compounding the severity. Success toasts disappearing fast is right; errors disappearing fast is a craft failure.
- Fix: Give error toasts a longer or no auto-dismiss (dismiss-on-click stays), and pause all toast timers on pointerenter/focus, resuming on leave — the standard forgiving pattern.
- Verified: Read Toast.tsx in full (117 lines): timer at line 37 fires unconditionally per variant; no pointerenter/focus handlers anywhere in ToastStack; AUTO_DISMISS_MS = 5000 at line 18 shared by success and error. Confirmed error toasts carry raw server messages (DashboardClient 1660, 1789). The manual dismiss X exists but doesn't help a toast that vanishes mid-read.

**EM-5 · P1 · effort:small — Sidebar 'Semester N' eyebrow flashes 'Semester 1' on every load — violating the app's own no-flash first-paint rule**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2044`
- Evidence: `const [currentSemester, setCurrentSemester] = useState<number>(1)` (line 562) renders in the brand block as `Semester {currentSemester}` (lines 2043–2045) from first paint; the real value only arrives via a client-side `fetch('/api/settings')` effect (lines 594–610). Meanwhile page.tsx documents the standard: 'The extra reads kill first-paint flashes: without them the client briefly rendered German UI for English users and a late-popping pass-rate card' (page.tsx lines 19–21) — and already queries AppConfig server-side, but selects only `language` (line 24), not `currentSemester` or `modulePresets`.
- Impact: Any student past semester 1 watches the brand mark's eyebrow flip from 'SEMESTER 1' to 'SEMESTER 3' on every single app open — exactly the pop-in class the codebase explicitly fixed for language and pass-rate. The upload tab's 'Modul (Semester 1)' label (line 2667) and 'No modules defined' placeholder (line 2682) flash the same way if reached quickly.
- Fix: Extend the existing AppConfig select in page.tsx to include `currentSemester` (and modulePresets), pass them as initial props like `initialLanguage`, and seed the useState from them.
- Verified: Confirmed useState(1) at 562, client-only /api/settings fetch at 594–610, sidebar render at 2043–2045, upload-tab label at 2667 and placeholder at 2682. Read page.tsx in full: the no-flash comment is at lines 19–21 and the AppConfig select at line 24 fetches `{ language: true }` only — the fix pattern (initialLanguage prop, line 44) exists and simply wasn't extended.

**EM-6 · P1 · effort:small — Stats error state is a dead end — no retry affordance, unlike the Library's matching error state**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:349`
- Evidence: The error branch renders only an icon and 'Statistiken konnten nicht geladen werden.' / 'Couldn't load statistics.' (lines 349–358) — no button, and the fetch effect runs once on mount (`useEffect(..., [])`, lines 112–135), so the only recovery is leaving and re-entering the tab. The Library's equivalent failure state ships a `btn-primary` 'Erneut versuchen / Try again' that re-triggers the fetch (DashboardClient lines 2910–2915).
- Impact: A transient network blip strands the user on a dead-end card with no visible way out; the inconsistency with the Library's designed recovery makes the Stats tab feel like the unfinished sibling. Actionability is the difference between an error state and an error message.
- Fix: Add the same 'Try again' primary button that resets `loading`/`error` and re-runs the fetch (extract the fetch into a callable `load()`).
- Verified: Confirmed the error branch at 349–358 contains only the icon + sentence, no interactive element; the fetch effect at 112–135 has an empty dep array with no exposed reload function. Confirmed the Library error card's retry button at DashboardClient 2910–2915 (`setIsLoadingReviews(true); fetchReviews()`), so the inconsistency claim is accurate.

**EM-7 · P1 · effort:small — No branded 404 or error boundary — tutor-brief links can dead-end on Next's default unstyled pages**
- Status: ⏳ open
- Where: `src/app/tutor/[id]/page.tsx:35`
- Evidence: `if (!item || !item.tutorPromptContent) notFound();` (line 35) — but the app has no not-found.tsx, error.tsx, or global-error.tsx anywhere under src/. The tutor page is a shareable/external artifact — linked from the library (DashboardClient line 3347) and from calendar ICS events (api/calendar/route.ts line 49) — with its own branded header, yet a stale or mistyped id renders Next's default black-on-white '404 This page could not be found', and any server crash renders the default unstyled error screen.
- Impact: The one place a guest or future-you most plausibly lands from outside the app (an old calendar entry after the item was deleted) is the only surface with zero 'Paper & Ember' — no warm paper, no brand tile, no route home. For a design system this deliberate, the system pages are part of the product.
- Fix: Add src/app/not-found.tsx and error.tsx styled like the existing empty states (paper card, brand tile, display-serif headline, 'Zurück zum Dashboard' primary action).
- Verified: Ran `find src -name "not-found*" -o -name "error*"` — zero matches; src/app contains only the routes listed. Confirmed notFound() at tutor/[id]/page.tsx:35, and that the page IS externally reachable: linked from the library at DashboardClient:3347 and embedded in calendar events at api/calendar/route.ts:49 — exactly the stale-link scenario claimed.

**EM-8 · P1 · effort:medium — Installable PWA with zero offline handling — service worker has no fetch handler or fallback page**
- Status: ⏳ open
- Where: `public/sw.js:1`
- Duplicate-of/with: MT-9, PP-8
- Evidence: sw.js handles only `push`, `notificationclick`, `install`, `activate` — there is no `fetch` listener, no precache, no offline fallback (whole file, 47 lines). Yet the app ships a full manifest.json (`display: standalone`) and actively instructs users to install it: 'Auf dem iPhone/iPad zuerst über Teilen → Zum Home-Bildschirm hinzufügen…' (DashboardClient lines 814–817).
- Impact: A student who installed the app (as told to) and opens it on the subway gets the OS browser's generic dinosaur/error page inside a standalone window — the least designed moment possible in an app whose entire premise is a daily ritual. Even a static branded 'Du bist offline — deine Reviews warten' page would preserve the world.
- Fix: Add a minimal fetch handler that network-first serves navigations and falls back to a precached /offline page styled in Paper & Ember (plus the icon assets).
- Verified: Read sw.js in full (47 lines): exactly four listeners (push, notificationclick, install, activate), no fetch handler, no caches API usage anywhere. Read manifest.json: display standalone, start_url '/'. Confirmed the install instruction toast at DashboardClient 814–817. Searched src for any offline page — none exists.

**EM-9 · P1 · effort:small — Tutor 'Read aloud' fails silently — spinner disappears and nothing happens**
- Status: ⏳ open
- Where: `src/app/components/TutorPanel.tsx:169`
- Evidence: `speakMessage`'s catch block is `console.error("[tutor] TTS failed:", err); setSpeakingId(null);` and `finally { setTtsLoadingId(null); }` (lines 169–174). No toast, no inline hint, no fallback to `speechSynthesis` — unlike the interactive quiz, which falls back to browser voices (useInteractiveQuiz playQuestion lines 684–687) AND surfaces 'Sprachausgabe fehlgeschlagen — das Diktat startet trotzdem' (lines 613–649).
- Impact: User taps the speaker icon, sees the tiny spinner for a beat, then nothing. No explanation, no retry cue — it reads as a broken button, and TTS via a rate-limited preview model is exactly the call that WILL intermittently fail. The same app already solved this failure gracefully one component over.
- Fix: On TTS failure, either fall back to `speechSynthesis` like the interactive mode, or show a small toast/inline note ('Vorlesen gerade nicht möglich') so the tap is acknowledged.
- Verified: Read TutorPanel.tsx in full: speakMessage (139–175) catches at 169–174 with only console.error + state resets — no user-facing signal of any kind, and TutorPanel receives no toast function in its props. Confirmed the interactive hook's contrasting graceful path: TTS failure → speakWithSynthesis fallback (playQuestion 684–687) with an error message only when both engines fail (641, 649).

**EM-10 · P1 · effort:small — Tutor connection errors masquerade as tutor speech — with a raw ⚠️ emoji, persisted into chat history**
- Status: ⏳ open
- Where: `src/app/components/TutorPanel.tsx:236`
- Evidence: On stream failure the error text is written INTO the model message: `acc = acc || (de ? `⚠️ Der Tutor ist gerade nicht erreichbar (${msg.slice(0,120)}). …` : …)` (lines 236–238), rendered with the normal 'Tutor' caps-label byline and body styling (lines 371–399), then committed via `saveHistory(streamItemId, next)` in the finally block (lines 247–255) so it replays from sessionStorage on every reopen. It even gets a working 'Read aloud' button (shown whenever `msg.text` is non-empty, line 374). The design system elsewhere never uses emoji — errors are ExclamationTriangleIcon on clay washes (e.g. Toast.tsx line 68).
- Impact: A network hiccup becomes a permanent, first-person 'utterance' in the study thread — visually indistinguishable from tutoring content, decorated with an emoji the visual language forbids, and re-shown later as if the tutor said it. It also pollutes the history sent back to the model on the next turn (`historyForApi = [...messages, userMsg]`, line 196).
- Fix: Render failures as a distinct system row (clay wash, warning icon, 'Erneut senden' action), exclude it from `saveHistory` and from `historyForApi`, and drop the emoji.
- Verified: Confirmed every link in the chain by reading TutorPanel.tsx in full: ⚠️ literal at 236–238; the message renders through the ordinary model-message branch (371–399) with the Tutor byline and a Read-aloud button gated only on msg.text (374); finally block persists via saveHistory at 253; historyForApi (196) maps ALL messages including the persisted error. Confirmed Toast.tsx uses ExclamationTriangleIcon (line 68) and no emoji appears elsewhere in the UI code. Extra nuance: `acc = acc ||` means a partially-streamed reply that then errors keeps the truncated text with NO error indicator at all.

**EM-11 · P1 · effort:medium — Stats tab forgets everything between visits — skeleton flash and count-up-from-zero replay on every tab switch**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:108`
- Evidence: `const [loading, setLoading] = useState(true)` (line 108) and the `fetch("/api/stats")` effect (lines 112–135) run on every mount, and StatsPanel is unmounted whenever `activeTab !== "stats"` (DashboardClient lines 3498–3519). `AnimatedNumber` keeps `display` in useState(0) (line 72), so on remount it counts up from 0 again over 1.1s (lines 85–89), and the heatmap columns re-stagger (`delay: 0.15 + w * 0.035`, line 511).
- Impact: Check stats, glance at the library, come back five seconds later: full skeleton flash, then all four stat numbers count up from 0 again and the heatmap re-cascades. Data the app held moments ago is theatrically re-loaded — entrance choreography that delights once becomes jank on the third viewing and makes the app feel amnesiac.
- Fix: Cache the last StatsResponse in the parent (or a module-level ref) and hydrate instantly on remount, revalidating in the background; play the count-up/stagger only on the first mount per session.
- Verified: Confirmed loading useState(true) at 108, once-per-mount fetch at 112–135 with no external cache, and conditional mounting at DashboardClient 3498–3519 (`{activeTab === "stats" && ... <StatsPanel/>}`), so every tab switch is a cold mount. Confirmed AnimatedNumber's display starts at 0 (line 72) and animates 1.1s toward value (85–89) — the 'from current display' logic only helps within a mount — and the heatmap week stagger at 507–511.

**EM-12 · P2 · effort:small — Interactive-mode button is offered on browsers that can't run it — the `supported` flag is computed but never used**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3592`
- Evidence: The hook computes and returns `supported` (useInteractiveQuiz lines 134–138, 908) precisely for capability gating, but the button renders on `{parsedTasks.length > 0 && !interactive.active && (...)}` alone (DashboardClient lines 3592–3603) — `interactive.supported` appears nowhere in the file. On an unsupported browser the mode starts, reads the question, then dies with a runtime error toast ('Mikrofon nicht verfügbar…', useInteractiveQuiz line 575).
- Impact: An affordance that cannot work is presented as available, and the failure arrives late (after TTS begins) instead of never being offered — the opposite of the app's otherwise careful capability handling (cf. the iOS push pre-check at lines 805–818).
- Fix: Gate on `interactive.supported`: hide the button, or render it disabled with a Tip explaining the browser limitation.
- Verified: Confirmed supported computed at useInteractiveQuiz 134–138 and returned at 908; grepped DashboardClient for '.supported' — the only hit is an unrelated file-upload variable at 1598, so the flag is genuinely unused. Traced the unsupported-browser path: start() → playQuestion → beginListening with no Ctor and micPromise resolving null → setError at 575. The push pre-check contrast (805–818) is accurate.

**EM-13 · P2 · effort:small — Library tab renders nothing at all during the initial load — the only screen without a skeleton**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2920`
- Evidence: All library body blocks are gated away while loading: search requires `rawItems.length > 0` (line 2829), the error state requires `!isLoadingReviews` (line 2897), the empty state requires `!isLoadingReviews && !reviewsError` (line 2920), and the accordion maps over the then-empty `libraryBySemester`. While `isLoadingReviews` is true the tab shows only the header — no skeleton — whereas the dashboard has designed skeleton cards ('Skeleton — static paper blocks, no shimmer', lines 2216–2225) and Stats a full layout-mirroring skeleton (StatsPanel lines 319–347).
- Impact: In the no-SSR-items window a user landing on Library sees a bare headline over blank paper, then content pops in — the one lifecycle the loading system skips, noticeable exactly when the app is at its slowest.
- Fix: Add two or three static paper-block accordion-row skeletons matching the semester/module card geometry, gated on `isLoadingReviews && rawItems.length === 0`.
- Verified: Verified all four gates (2829, 2897, 2920, and the accordion deriving from rawItems), plus both sibling skeletons (dashboard 2216–2225, StatsPanel 319–347). Scope note: `isLoadingReviews` initializes to true only when SSR items are empty (line 536: `useState(initialItems.length === 0)`), so this bites new/empty accounts and stale-SSR windows — narrow but real, consistent with 'low'.

**EM-14 · P2 · effort:small — Dashboard shows 'Upload your first lecture' onboarding when the reviews fetch failed — the documented retry intent is only half-shipped (Library got it, Dashboard didn't)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2226`
- Evidence: The dashboard's branch is `: upcomingReviews.length === 0 ? (/* Empty state */ 'Nothing here yet … Upload your first lecture')` (lines 2226–2246) with no `reviewsError` check, and the header subtitle likewise falls through to 'Lade deine erste Vorlesung hoch' (line 2187). Yet the fetch-error comment states the intent: 'Distinguish a fetch failure from a genuinely empty library so the UI can show a retry affordance instead of the "upload your first lecture" state' (lines 930–932) — implemented only in the Library tab (lines 2897–2917). `reviewsError` is read at exactly two render sites: 2897 and 2920, both in Library.
- Impact: In the empty-SSR + failed-refetch window (stale standalone-PWA sessions, flaky first loads), the same state renders a designed error card with retry in Library but cheerful onboarding on the app's primary screen — an inconsistency where the code's own documented intent is half-shipped.
- Fix: Mirror the Library's error card on the dashboard branch (`reviewsError && upcomingReviews.length === 0` → 'Couldn't load your reviews' + Try again), and switch the header subtitle accordingly.
- Verified: Confirmed the branch at 2226–2246 lacks any reviewsError check, the subtitle fallthrough at 2187, the intent comment at 930–932, and the Library-only implementation at 2897–2917. Caveat verified and impact reworded: page.tsx SSRs the item list, so 'empty + fetch failed' usually means genuinely empty — the strongest defensible claim is the Library/Dashboard inconsistency against the code's own stated intent, which holds; severity stays low.

**EM-15 · P2 · effort:medium — Login page (and NextAuth error copy) is German-only in a bilingual app**
- Status: ⏳ open
- Where: `src/app/login/LoginClient.tsx:14`
- Evidence: The entire login surface is hardcoded German — ERROR_MESSAGES (lines 14–21: 'Dieses Google-Konto ist … nicht freigeschaltet.' etc.), hero copy 'Lerne weniger. Behalte mehr.' (lines 76–78), button 'Mit Google anmelden' (line 136), privacy note and footer. No language branch exists anywhere in the file, while every post-login string in the app is bilingual via the `language` setting.
- Impact: An English-mode user who gets signed out (or denied access — the moment they most need to understand what happened) faces an all-German wall including the error explanation. Understandable pre-auth (no stored pref), but the design's bilingual promise breaks at the front door.
- Fix: Derive a best-effort locale from `Accept-Language`/`navigator.language` and provide English mirrors for at least the auth-error messages and the sign-in button.
- Verified: Read LoginClient.tsx in full (165 lines): zero occurrences of a language prop or branch; ERROR_MESSAGES at 14–21, hero at 75–78, button at 136, footer at 160 — all German literals. Contrast with the rest of the app (every user-facing string branches on language) verified throughout this review.

**EM-16 · P2 · effort:small — Google avatar has no error fallback — a dead image URL leaves a broken-image glyph in the sidebar**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2109`
- Evidence: `{userImage ? (<img src={userImage} … />) : (<div className="w-8 h-8 rounded-full bg-(--accent-wash) …">{initial}</div>)}` (lines 2107–2121) — the designed initials fallback renders only when `userImage` is null; there is no `onError` handler, so an expired googleusercontent URL or a third-party-image blocker shows the browser's broken-image icon inside the identity strip.
- Impact: The user identity row — visible on every screen — degrades to the single cheapest-looking artifact possible, while a perfectly designed fallback sits one branch away.
- Fix: Add `onError` that flips an `avatarFailed` state to render the existing initials tile (small client wrapper or state in the sidebar).
- Verified: Confirmed the img at 2107–2114 has referrerPolicy and className but no onError, and the initials tile at 2116–2120 is reachable only via the null branch. Mitigation noted: `referrerPolicy="no-referrer"` (line 2112) already avoids the most common googleusercontent 403, but expired URLs and content blockers remain — hence low, not medium.

**EM-17 · P2 · effort:small — A dead ?quizId deep link is swallowed silently — no explanation why the notification led nowhere**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:1551`
- Evidence: The deep-link consumer strips the param and only acts when the item exists: `const review = upcomingReviews.find(r => r.id === quizId); if (review) startQuiz(review);` (lines 1551–1553) — the not-found path (deleted lecture, other account) does nothing, per the comment 'Consume the deep link EXACTLY ONCE now — whether or not the item is found' (line 1542). Push notifications and calendar events mint exactly these /quiz/<id> links (sw.js lines 26–41; quiz/[id]/page.tsx redirects to /?quizId=).
- Impact: Tap a 'review due' notification for a lecture you deleted yesterday: the app opens to the plain dashboard with zero acknowledgment. The user can't distinguish 'link broken' from 'app ignored me' — a designed one-line answer is missing.
- Fix: In the not-found branch, toast: 'Diese Wiederholung existiert nicht mehr.' / 'That review no longer exists.'
- Verified: Confirmed the consumer at 1530–1555: param stripped at 1546–1549, then `if (review) startQuiz(review)` with no else. Confirmed the link supply chain: quiz/[id]/page.tsx redirects to /?quizId=<id> and sw.js notificationclick navigates to the notification's URL (26–41). addToast is in scope in the component, so the one-line fix is trivially available.

**EM-18 · P2 · effort:small — Stats skeleton carries a staggered animationDelay for an animation that doesn't exist**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:325`
- Duplicate-of/with: MO-17
- Evidence: `<div key={i} className="card-surface p-5" style={{ animationDelay: `${i * 120}ms` }}>` (line 325) — no animation is defined on `.card-surface` or any skeleton class (globals.css's only ambient loops are ember-pulse and eq-pulse, lines 735/744, plus tooltip tip-in), and no Tailwind animate-* class is applied. The dashboard skeleton explicitly documents the choice: 'Skeleton — static paper blocks, no shimmer' (DashboardClient line 2217). The delay is dead styling.
- Impact: Harmless at runtime but it's a fossil of an intended staggered pulse that never shipped — either the static-skeleton rule wins (delete the delay) or the stats skeleton was meant to breathe (add the subtle pulse and honor the 120ms stagger). Right now the code contradicts itself about which.
- Fix: Remove the `animationDelay` style, or define a gentle opacity pulse keyframe (reduced-motion-guarded) if a breathing skeleton is actually wanted.
- Verified: Confirmed the style at line 325. Grepped every animation/@keyframes in globals.css: only ember-pulse (735/866), eq-pulse (744/877), and tip-in (829–844) exist — nothing targets card-surface or the skeleton divs, and no animate-* utility is on the element, so animationDelay provably does nothing. Dashboard's 'no shimmer' comment confirmed at 2217.


### Microcopy & bilingual consistency (20)

**MC-1 · P0 · effort:small — Voice-mode (Interactive) error messages are hardcoded German — English users get German error toasts**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/useInteractiveQuiz.ts:306`
- Duplicate-of/with: EM-3
- Evidence: Nine setError() strings ignore the language option the hook already receives: line 306 `setError("Mikrofon-Zugriff wurde blockiert. Bitte erlaube das Mikrofon und starte erneut.")`, line 478 `"Transkription fehlgeschlagen — nutze den „Nächste“-Button, um weiterzugehen."`, lines 508/575 `"Mikrofon nicht verfügbar — bitte Zugriff erlauben…"`, line 548 `"Standard-Spracherkennung wird in diesem Browser nicht unterstützt — wechsle in den Einstellungen zu Hybrid oder Gemini."`, line 589, lines 618/641/649 `"Sprachausgabe fehlgeschlagen — das Diktat startet trotzdem."`. The hook DOES localize STT (`rec.lang = langRef.current === "English" ? "en-US" : "de-DE"`, line 278) and DashboardClient surfaces these verbatim as toasts (`if (interactive.error) addToast("error", interactive.error)`, DashboardClient.tsx:704).
- Impact: An English-mode student using the flagship hands-free mode hits mic/TTS failures and gets untranslated German instructions referencing a '„Nächste“-Button' that their UI labels 'Next task'. This is the single largest bilingual-parity break in the app: exactly at the stressful failure moment, the product stops speaking the user's language.
- Fix: Thread the existing `language` option into every setError call (a small `msg(de, en)` helper inside the hook). Also rename the button reference per language ('Next task' vs '„Nächste“').
- Verified: Opened useInteractiveQuiz.ts in full. Counted all setError call sites: exactly 9 (lines 306, 478, 508, 548, 575, 589, 618, 641, 649), all hardcoded German with no language branch. Confirmed the hook receives language (line 128) and DashboardClient passes 'English'/'German' (line 693); STT and TTS both localize (lines 278, 624) so the omission is only in error copy. Confirmed the toast pipeline at DashboardClient.tsx:704 surfaces the string verbatim, and the EN UI tooltip for that button is 'Next task' (DashboardClient.tsx:3664). Grepped for any localization wrapper around these errors elsewhere — none exists.

**MC-2 · P1 · effort:small — Review-history verdict badges show raw English 'PASS'/'REPEAT' while every sibling badge is localized**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4244`
- Evidence: History rows render `{entry.passed ? "PASS" : "REPEAT"}` with no language ternary. The identical badge concept is localized everywhere else: result screen `(language === "german" ? "Bestanden" : "Passed")` (line 3765), library feedback summary line 3443, comprehension chip line 3303, comp-feedback modal line 4968.
- Impact: A German user opening 'Bewertungs-Verlauf' sees English shouty-caps PASS/REPEAT chips stacked directly beneath a brief full of 'Bestanden/Wiederholen' vocabulary — the one modal where the grading vocabulary matters most reads as unfinished.
- Fix: Reuse the same ternary as line 3443: de ? 'Bestanden'/'Wiederholen' : 'Passed'/'Repeat' (keep the uppercase styling via the existing `uppercase tracking` classes).
- Verified: Read the history modal (lines 4212–4312): line 4244 is exactly `{entry.passed ? "PASS" : "REPEAT"}` with the same pill styling as the localized siblings. Verified all four cited comparison sites (3765, 3443, 3303, 4968) do fork on language. Also confirmed the modal heading is 'Bewertungs-Verlauf' (4216) in German mode, so the badge sits in German context. No other localization mechanism found.

**MC-3 · P1 · effort:small — Stream-error fallback 'Unbekannter Fehler' is always German, producing mixed-language toasts in English mode**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:1658`
- Evidence: Three identical fallbacks: line 1658 and 1786 `const msg = evt.data.message ?? "Unbekannter Fehler";` and line 1854 `errMsg = evt.data.message ?? "Unbekannter Fehler";`. In English mode the toast then reads `Generation error: Unbekannter Fehler` / `Grading error: Unbekannter Fehler` (lines 1660, 1789) because the prefix IS localized but the fallback is not.
- Impact: English users see a half-translated Frankenstein toast at the worst moment (pipeline failure). The German half is also the weakest copy in the app — 'Unknown error' is exactly the robotic dev-speak the brand voice avoids everywhere else ('Connection lost — reloading status…' shows the house style).
- Fix: Localize the fallback and warm it up, e.g. de: 'Etwas ist schiefgelaufen — bitte erneut versuchen.' / en: 'Something went wrong — please try again.'
- Verified: Verified all three fallback sites (1658, 1786, 1854) are exactly as quoted, with no language ternary, while the toast prefixes on 1660/1789 do fork ('Generierungsfehler'/'Generation error'). Also confirmed the surrounding disconnect/timeout copy (1667–1678, 1796–1808) is fully bilingual, so this is the lone unlocalized string in those handlers. Note: the 1854 site feeds `throw new Error(errMsg)` whose message lands in a toast the same way.

**MC-4 · P1 · effort:small — German interval names ('Tag 7') leak into English tooltips via LIB_LEVEL_FULL**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3139`
- Evidence: `LIB_LEVEL_FULL = ["Tag 1", "Tag 3", "Tag 7", …]` (line 71) is interpolated into tooltips whose surrounding text IS localized: line 3139 `Tip label={`Level ${l+1} (${LIB_LEVEL_FULL[l]}): ${… (language === "german" ? "Bestanden" : "Passed")…}`}` and line 3229 `Tip label={`${label} (${LIB_LEVEL_FULL[l]}): ${status}`}`. Also the mastery tooltip line 3198 says '(Day 365)' in English — proving the English term exists but isn't used for the dots.
- Impact: English-mode library tooltips read 'Level 3 (Tag 7): Passed' — one German word wedged inside an otherwise-translated sentence, on the 7-dot progress row and the interval stepper, two of the most hovered elements in the library.
- Fix: Make LIB_LEVEL_FULL a pair (de: 'Tag 7', en: 'Day 7') or derive it: de ? `Tag ${n}` : `Day ${n}`.
- Verified: Grepped LIB_LEVEL_FULL: used at exactly lines 3139 and 3229, both inside otherwise-localized tooltip templates; the constant at line 71 is German-only ('Tag N'). Confirmed the English mastery tooltip at line 3198 uses 'Day 365', so the English vocabulary exists in the same component but not for the dots/stepper. No English variant of the array exists anywhere in the repo.

**MC-5 · P1 · effort:medium — Login screen is entirely German (including all auth error messages) yet ends on an English tagline**
- Status: ⏳ open
- Where: `src/app/login/LoginClient.tsx:15`
- Evidence: ERROR_MESSAGES (lines 14–21) are German-only, e.g. `AccessDenied: "Dieses Google-Konto ist für diesen privaten Lernbereich nicht freigeschaltet."`; headline 'Lerne weniger. Behalte mehr.' (76–78), button 'Mit Google anmelden' (136) — no language branching anywhere. Then the footer (line 160) switches to English: `© {year} SRS Master · Built for serious students`.
- Impact: An English-mode user who signs out or gets AccessDenied lands on a fully German page and must decode a German error to recover — the app's bilingual promise breaks at its front door. Meanwhile German users get an untranslated English brand tagline as the page's last word, which reads as an oversight rather than a choice.
- Fix: Pre-auth language can come from `navigator.language`/Accept-Language with German default; at minimum translate ERROR_MESSAGES (the recovery path) and localize or translate the footer tagline ('Für ernsthafte Studierende gebaut').
- Verified: Read LoginClient.tsx in full: zero occurrences of any language check — ERROR_MESSAGES (14–21), headline, value props, auth card, and button copy are all German; the footer at line 160 is the sole English string. The finding's caveat is fair: the app language lives in server-side AppConfig behind auth, so pre-auth localization genuinely requires navigator.language/Accept-Language as recommended. Not addressed anywhere else (login/page.tsx just passes error/callbackUrl).

**MC-6 · P1 · effort:medium — Tutor-brief page is German-only and exposes the raw database ID in user-facing copy**
- Status: ⏳ open
- Where: `src/app/tutor/[id]/page.tsx:92`
- Evidence: Footer: `Erstellt am {item.createdAt.toLocaleDateString("de-DE", …)} {" · "}ID: {item.id}` (lines 92–95) — hardcoded de-DE locale plus a raw item ID. Back link is `← Zurück` (line 57, a text arrow instead of the ArrowLeftIcon affordance used app-wide, e.g. DashboardClient:3541). CopyButton: `{copied ? "Kopiert!" : "Prompt kopieren"}` (copy-button.tsx:41). notFound metadata: `title: "Nicht gefunden"` (line 25).
- Impact: English users reach this page from the localized 'Tutor brief' chip (DashboardClient:3353) and land in German with German date formatting. 'ID: cmb3x…' is developer debris on an otherwise beautifully composed page — no student needs a CUID, and no other screen in the app leaks internals like this.
- Fix: Read the user's stored language (the page is server-rendered and the AppConfig is one query away) or at least drop the raw ID and use the icon-based back affordance for visual consistency.
- Verified: Read page.tsx and copy-button.tsx in full: footer at 92–95 hardcodes 'de-DE' and prints `ID: {item.id}` (a Prisma row id — raw internal identifier confirmed); '← Zurück' at 57, German CopyButton at copy-button.tsx:41, 'Nicht gefunden' at 25 — all with zero language branching in either file. Corrected one evidence nit: '←' is the Unicode arrow character, not ASCII, but the substance (plain-text arrow vs the app's ArrowLeftIcon pattern, cf. DashboardClient:3541) holds. Entry point 'Tutor-Brief'/'Tutor brief' chip at DashboardClient:3353 confirmed localized.

**MC-7 · P1 · effort:small — Grading-failure guidance tells a student to check 'the database, Gemini API key, or server logs'; push setup can toast 'VAPID key not configured.'**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3690`
- Evidence: Error box: de `"Bitte überprüfe die Datenbank, den Gemini API-Schlüssel oder die Server-Logs und versuche es erneut."` / en `"Please check your database, Gemini API key, or server logs, and click below to try submitting again."` (lines 3689–3691) — note the EN adds 'click below' that DE omits, and there is no button rendered inside the error box (resubmit is the normal Submit button further down). Push: `if (!vapidKey) { addToast("error", "VAPID key not configured."); return; }` (line 832) — untranslated acronym jargon amid otherwise warm bilingual push copy (lines 806, 815–817, 824).
- Impact: This is the sharpest tone break in the app: at the moment of failure, the 'built for serious students' voice turns into an ops runbook. Students don't have server logs; 'VAPID' means nothing to anyone but the developer. The DE/EN asymmetry ('click below' vs nothing) also shows one language was edited without the other.
- Fix: Rewrite blame-free and actionable: 'Deine Antworten sind noch da — versuch es einfach erneut. Wenn es wieder passiert, warte kurz und lade die Seite neu.' Mirror in EN. Replace the VAPID toast with the existing generic 'Mitteilungen konnten nicht aktiviert werden.' and log the real cause to console.
- Verified: Verified lines 3688–3692 exactly as quoted, including the EN-only 'click below' with no button inside the error box (the box at 3679–3694 contains only icon, message, pre, and this paragraph). Verified line 832 `"VAPID key not configured."` is unlocalized while every neighboring push string (806, 815–817, 824) forks on language — updated the cited context lines to include 806/824 which I read directly. Both halves confirmed.

**MC-8 · P1 · effort:small — Mastery items show the impossible 'Level 8 von 7' on due cards**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2312`
- Evidence: Due card pill: `Level&nbsp;{review.level + 1}&nbsp;{de ? "von" : "of"}&nbsp;7` (line 2312), where `level: item.currentLevel` (formatItems, line 479). The library's own code documents that the counter is uncapped: `const inMastery = item.currentLevel >= LEVELS; // all 7 cleared; now looping T365 (currentLevel is an uncapped mastery counter)` (line 3186) and renders a dedicated 'Meister ×N' badge instead (lines 3195–3203). The quiz header (3554) and result screen (3780 'Level N, freigeschaltet.') inherit the same overflow without the 'von 7' absurdity.
- Impact: The first time a year-mastered lecture comes due, its dashboard card reads 'Level 8 von 7' — a mathematically impossible label at the exact moment the app should be celebrating the user's longest-running success. The library already solved this ('Meister ×N'); the dashboard contradicts it.
- Fix: Mirror the library's mastery treatment on due/scheduled rows and the quiz header: when level >= 7 show the 'Meister/Mastery' pill (accent-washed, consistent with line 3199) instead of 'Level N von 7'.
- Verified: Traced the data flow: formatItems (line 479) sets `level: item.currentLevel` with no cap, and the library's own comment at 3186 states currentLevel is an uncapped mastery counter, so a mastered item (currentLevel >= 7) that comes due renders 'Level 8 von 7' at line 2312. Confirmed the library's alternative treatment (mastery badge 3195–3203, else 'Level N von 7' at 3206) and the capless quiz header (3554) / result headline (3780). Strengthened the evidence with the line-479 derivation. Conditional but real and internally contradictory.

**MC-9 · P1 · effort:small — German 'Demnächst' labels two different concepts visible on the same screen (Upcoming reviews vs Coming-soon feature)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2503`
- Evidence: Dashboard section header: `{de ? "Demnächst" : "Upcoming"}` (line 2503). Sidebar Live-Tutor-Pro teaser: `{language === "german" ? "Demnächst" : "Coming soon"}` (line 2101). On desktop both render simultaneously — the sidebar card sits beside the dashboard list. English correctly distinguishes the two meanings; German collapses them into one word.
- Impact: A German user scanning the dashboard sees 'Demnächst' twice with different meanings: 'these reviews are coming up' and 'this feature doesn't exist yet'. Momentarily, the upcoming-reviews section can read as unreleased. Precisely the kind of homonym collision a copy pass exists to catch.
- Fix: Rename the sidebar teaser to 'Bald verfügbar' (or 'In Arbeit'), keeping 'Demnächst' for the schedule where it reads most naturally.
- Verified: Confirmed both strings verbatim at 2503 and 2101. Verified simultaneity: the sidebar (md:flex, line 2035) with the Live Tutor Pro card is always visible on md+ while the dashboard tab renders the Upcoming section whenever scheduledItems exist — so both 'Demnächst' labels are on screen at once. English forks correctly ('Upcoming' vs 'Coming soon'), so the collision is German-only as claimed.

**MC-10 · P1 · effort:small — German terminology drift: 'Wiederholungen' and Denglish 'Reviews' name the same thing, even within one screen**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2575`
- Evidence: Dashboard header: `${dueItems.length} ${dueItems.length === 1 ? "Wiederholung ist" : "Wiederholungen sind"} bereit` (line 2183) while the right rail on the SAME view says `${passRate30.passed} von ${passRate30.total} Reviews bestanden` (line 2575). Stats tab continues in Denglish: 'Reviews gesamt' (StatsPanel:413), 'noch keine Reviews' (408), 'inkl. überfälliger Reviews' (394), heatmap tooltip 'N Reviews' (516), module tooltip 'N Reviews' (547), 'Review-Last · nächste 14 Tage' (579) — whereas cards/library say 'Nächste Wiederholung' (3465), 'Wiederholung verschieben' (2335).
- Impact: The app's core unit of work has two German names distributed by tab, sometimes 300px apart. 'Wiederholung' is clearly the house term (it carries the emotional copy: 'Wiederholen ist kein Rückschritt…', line 3799), so 'Reviews' reads like untranslated leftovers and quietly cheapens the Stats tab.
- Fix: Pick 'Wiederholung(en)' as the canonical German term and sweep: 'X von Y Wiederholungen bestanden', 'Wiederholungen gesamt', 'inkl. überfälliger', tooltip 'N Wiederholungen'. Keep 'Review-Last' only if a shorter 'Pensum · nächste 14 Tage' doesn't fit.
- Verified: Verified every cited site: 2575 'Reviews bestanden' sits in the right rail of the same dashboard view as 2183's 'Wiederholung(en)… bereit' (corrected the 2183 quote to the actual singular/plural ternary — substance unchanged). StatsPanel confirmed at 394, 408, 413, 516, 547, 579 using German-mode 'Review(s)'; house-term sites 3465, 2335, and the emotional line at 3799 confirmed using 'Wiederholung'. Genuine split by tab, exactly as described.

**MC-11 · P1 · effort:small — The examiner's brief has two German names: 'Gutachter-Brief' on the result screen, 'Feedback & Auswertung' in the modal**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4188`
- Evidence: Feedback modal header: `{language === "german" ? "Feedback & Auswertung" : "Examiner's brief"}` (line 4188). Result screen for the same artifact: `(language === "german" ? "Gutachter-Brief" : "Examiner's brief")` (line 3822). English is consistent in both places; German is split. Entry links say a third thing: 'Letztes Feedback' (lines 2378, 3435).
- Impact: The grading brief is the app's most distinctive artifact — the 'Gutachter' metaphor (two examiners + head examiner, lines 3704–3706) is world-building the German copy invests in, then abandons in the modal where users actually read the brief. 'Feedback & Auswertung' is generic LMS-speak by comparison.
- Fix: Use 'Gutachter-Brief' in the modal header too; 'Letztes Feedback' can stay as the casual entry-point label since English mirrors it ('Last feedback').
- Verified: Confirmed 4188 and 3822 verbatim: same English label ('Examiner's brief') in both, different German. Entry points at 2378 and 3435 confirmed as 'Letztes Feedback'/'Last feedback' in both languages, so keeping that label is consistent. The Gutachter world-building confirmed at 3704–3706 and 3739–3745 ('Gutachter 1 & 2', 'Chef-Gutachter'). Clean inconsistency, German-side only.

**MC-12 · P1 · effort:small — Upload page eyebrow says 'Neues Modul' but the flow creates a lecture — a confusion the codebase itself documents**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2602`
- Evidence: Eyebrow: `{language === 'german' ? 'Neues Modul' : 'New module'}` (line 2602), yet the form's first field selects an EXISTING module preset (line 2667 'Modul (Semester N)') and the output is one lecture card. The code comment at lines 1286–1288 admits the trap: `// One card = one lecture (SRSItem) — "Modul" here misled: the module's other lectures survive this delete` and the toast was corrected to 'Vorlesung gelöscht.' (1288). Nav calls the tab 'Material hochladen' (2056) — a third framing. The generating headline repeats the error: 'Dein Modul entsteht' / 'Building your module' (2614).
- Impact: Uploading a fifth lecture into 'Anatomie' under a headline announcing a 'new module' misstates the mental model the library is built on (Semester → Modul → Vorlesung). The team already fixed this exact confusion once (delete toast) but the upload flow still teaches it.
- Fix: Change the eyebrow to 'Neue Vorlesung' / 'New lecture' (and the progress headline to 'Deine Vorlesung entsteht' / 'Building your lecture') — the H1 'Aus einer Vorlesung wird ein Quiz.' (2604) already sets this up perfectly.
- Verified: Confirmed 2602 eyebrow, 2667 existing-module select, the 1286–1288 comment plus corrected toast 'Vorlesung gelöscht.' (1288), and nav 'Material hochladen' (2056). Found one additional occurrence strengthening the finding: the in-progress headline 'Dein Modul entsteht'/'Building your module' at 2614 repeats the wrong noun — added it to evidence and recommendation. H1 at 2604 confirmed as 'Aus einer Vorlesung wird ein Quiz.'

**MC-13 · P1 · effort:small — 'AI connection' settings copy misuses the app's core term 'Module' and the EN lock message says 'generation' while grading**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4728`
- Evidence: Description: de `"Wähle aus, für welche Module der experimentelle Gemini Proxy genutzt werden soll."` / en `"Choose which modules should use the experimental Gemini proxy."` (lines 4727–4729) — but the segmented options are pipeline stages: 'Proxy für alles' (4759), 'Nur Generierung' (4782), 'Nur Fallback' (4805), not course modules. The lock notice shows when `isGenerating || isGrading` (4731) but EN reads 'Settings locked while AI generation is in progress.' while DE correctly says 'während eine KI-Aktion läuft.' (4734; same pair repeats at 4817–4820).
- Impact: In an app where 'Modul' strictly means a course module (library hierarchy, presets, deletion), 'für welche Module' sends users hunting for a per-course toggle that doesn't exist. The EN lock message is simply wrong during grading — evidence the German copy was revised and English wasn't.
- Fix: Reword to match the options: de 'Wähle, welche Schritte über den experimentellen Gemini Proxy laufen.' / en 'Choose which steps run through the experimental Gemini proxy.' Align the EN lock message with DE: 'Settings locked while an AI task is running.'
- Verified: Confirmed 4727–4729 description, all three segmented options (4759, 4782, 4805 — pipeline stages, not modules), and the lock condition `(isGenerating || isGrading)` at 4731 with the mismatched EN string at 4734. Found the same DE-correct/EN-stale lock pair duplicated at 4817–4820 (PDF delivery section) — added to evidence; a fix should sweep both. 'Modul' as course-module confirmed throughout (2667, 3067, presets).

**MC-14 · P2 · effort:small — English button-label case drifts into Title Case: 'Browse Files', 'Add Presets', 'Subscribe to Log History', 'Video Archive'**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2743`
- Evidence: `"Browse Files"` (2743), `"Add Presets"` (2683 — also plural + noun where German says just 'Hinzufügen'), `"Subscribe to Log History"` (4404), modal header `"Video Archive"` (4118). The established system is sentence case everywhere else: 'Generate my quiz set' (2792), 'Start reviewing' (2193), 'Sync to calendar' (2510), 'Try again' (2914), and even the same concept in card footers: 'Video archive (N)' (2388).
- Impact: Four stray Title Case labels against ~40 sentence-case ones read as inherited from another product. 'Video Archive' vs 'Video archive (2)' is the same feature cased two ways one click apart.
- Fix: Sentence-case all four: 'Browse files', 'Add preset', 'Subscribe to review history', 'Video archive'.
- Verified: Confirmed all four Title Case sites (2743, 2683, 4404, 4118) and all five sentence-case comparators (2792, 2193, 2510, 2914, 2388) verbatim. The 'Video Archive' modal header (4118) vs the card footer 'Video archive (N)' (2388) pairing is real — same feature, two casings. Overlaps with the done-calendar finding only on the 4404 string; the two findings critique different dimensions (casing vs naming), so both stand.

**MC-15 · P2 · effort:small — Percent formatting is inconsistent: '87 %' with a space in the library, '87%' without in the dashboard rail and stats**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2571`
- Evidence: No space: pass-rate card `{Math.round((passRate30.passed / passRate30.total) * 100)}%` (2571), StatsPanel `${mod.passRate}%` (551) and the big stat-card suffix `%` (401, 473–474). With space: `Ø {avg} %` (3041), comprehension `{Math.round(item.comprehensionScore)} %` (3121, 3306, 4972), `≈ {summary.mastery} %` (3447), result headline `${Math.round(gradingResult.comprehensionScore)} %` (3773). None of these fork by language.
- Impact: The same metric family (pass/comprehension percentages) renders '87 %' in the library and '87%' on the dashboard/stats. German typography (DIN 5008) wants the narrow space, English wants none — currently BOTH languages get a random mix depending on which screen they're on.
- Fix: Decide per locale and centralize: a tiny `fmtPercent(n, de)` returning de ? `${n} %` (ideally NARROW NO-BREAK SPACE) : `${n}%`, used in all nine call sites.
- Verified: Recounted every cited call site in both files: no-space at DashboardClient 2571, StatsPanel 551 and the suffix-'%' stat card (suffix declared at 401, rendered at 473–474 — added 401 for precision); spaced at 3041, 3121, 3306, 3447, 3773, 4972 (regular space, not narrow no-break). Confirmed none branch on language. Real split within the same metric family.

**MC-16 · P2 · effort:small — Ellipsis and quote discipline drifts: ASCII '...' bookends in the upload placeholder, inconsistent space-before-ellipsis, straight quotes in one English string**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2771`
- Duplicate-of/with: TY-13
- Evidence: Upload textarea placeholder uses ASCII dots on BOTH ends: `"...oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein..."` (2771, EN same). Everywhere else uses the real '…': 'Modul oder Vorlesung suchen…' (2841), 'Frag deinen Tutor…' (TutorPanel:417). Spacing wobbles: 'Schreibe deine Antworten hier …' (4045) and 'Tippe A, B, C oder D …' (3936) put a space before '…' while 'suchen…' and 'Starte KI-Pipeline…' (1608) don't. English straight quotes at 3894 `'· say "next task" to move on'` vs curly '“…”' at 2891; German correctly uses „…“ (1705, 2891, 3894).
- Impact: Punctuation is where a paper-and-ink design either convinces or doesn't. Leading '...' in the drop-zone placeholder is the most visible offender — it sits on the primary upload surface and mimics trailing-off speech backwards.
- Fix: Sweep: real '…' everywhere, no leading ellipsis (rewrite as 'Oder füge deine Skripte, Transkripte oder rohen Text hier ein …'), one spacing rule (no space before '…' is the app's majority), curly quotes in EN strings.
- Verified: Grepped for ASCII '...' across DashboardClient: line 2771 is the only user-facing string using it (both DE and EN, leading and trailing). Confirmed real '…' at 2841, 1608, TutorPanel:417; space-before-… at 4045 and 3936/3937; straight quotes in the EN string at 3894 while its German side uses „…“ and 2891 EN uses proper curly quotes. All evidence exact.

**MC-17 · P2 · effort:small — The done-calendar feed gets a third name mid-section: 'Erledigt-Kalender' heading, then 'Verlaufshistorie abonnieren' / 'Subscribe to Log History' button**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4404`
- Evidence: Section heading: `{language === "german" ? "Erledigt-Kalender (optional)" : "Done calendar (optional)"}` (4397). The button beneath: `{language === "german" ? "Verlaufshistorie abonnieren" : "Subscribe to Log History"}` (4404). 'Verlaufshistorie' is a tautology (Verlauf = Historie), 'Log History' is doubled jargon, and neither matches the heading it sits under. The caption introduces yet more phrasing: 'Verfolge deinen täglichen Fortschritt durch Abonnieren deiner erledigten Wiederholungen.' (4407–4409).
- Impact: One small optional feature is named three ways in 60 vertical pixels; the German tautology and English 'Log' read as machine translation in an otherwise carefully written modal ('Subscribe once — all future reviews will automatically appear…', 4347).
- Fix: Unify on the heading's term: button 'Erledigt-Kalender abonnieren' / 'Subscribe to done calendar'; caption 'Deine erledigten Wiederholungen erscheinen als Kalendereinträge.'
- Verified: Read the calendar modal (4320–4419): heading at 4397, button at 4404, caption at 4406–4409 all confirmed verbatim — three phrasings for one feature within one <div>. The modal's other copy (4344–4390) is indeed carefully written, making the contrast fair. 'Verlaufshistorie' tautology and EN 'Log History' both real.

**MC-18 · P2 · effort:small — Toast close buttons announce 'Close' to screen readers in both languages**
- Status: ⏳ open
- Where: `src/app/components/Toast.tsx:74`
- Duplicate-of/with: AX-12
- Evidence: `aria-label="Close"` hardcoded on both dismiss buttons (lines 74 and 106). ToastStack's props are only `{ toasts, onDismiss }` (line 44) — no language reaches the component. Contrast with DashboardClient, which localizes even icon-button labels: `aria-label={language === "german" ? … "Menü schließen" … }` (2018) and tooltip labels 'Schließen — Esc' everywhere (e.g. 4119, 4337, 4980).
- Impact: Invisible in visual QA but audible to every German screen-reader user on every toast — the app is otherwise unusually diligent about localized aria-labels, so this is a gap in an established standard, not a missing standard.
- Fix: Pass a `language` (or pre-localized closeLabel) prop into ToastStack and use 'Schließen'/'Close'.
- Verified: Read Toast.tsx in full: both aria-label="Close" sites confirmed (74, 106); grepped the file for 'language' — zero hits, and the ToastStack signature (line 44) takes only toasts/onDismiss, so no localization path exists. Confirmed the app's established localized-aria pattern at DashboardClient 2018 and the 'Schließen — Esc' tooltips (4119, 4337, 4980).

**MC-19 · P2 · effort:small — History-modal footnote is changelog-speak frozen into permanent UI: 'Briefe werden ab jetzt … gespeichert'**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4307`
- Evidence: `{language === "german" ? "Briefe werden ab jetzt bei jeder Bewertung gespeichert — ältere Einträge haben noch keinen." : "Briefs are stored per review from now on — older entries don't have one yet."}` (lines 4305–4309), rendered unconditionally under every non-empty history list. 'ab jetzt'/'from now on' anchors to the deploy date, and 'noch keinen'/'yet' implies old entries will eventually get briefs — they never will.
- Impact: Release-notes voice leaking into evergreen UI. In a year, 'from now on' under a fully-populated history reads as a bug, and the false promise of 'yet' is exactly the kind of small dishonesty the rest of the copy avoids (cf. the 'Honest footnote' pattern at line 3259).
- Fix: Timeless phrasing: de 'Einträge ohne Brief stammen aus der Zeit vor den gespeicherten Gutachter-Briefen.' / en 'Entries without a brief predate stored examiner's briefs.' Better: only show the footnote when at least one entry lacks feedback.
- Verified: Confirmed the string at 4305–4309 and that it renders unconditionally inside the non-empty-history branch (no `entry.feedback` check on the footnote itself), so it shows even when every entry has a brief. Per-entry 'kein Brief' badge exists separately at 4260. The 'Honest footnote' comment at 3259 confirmed, making the internal-standard comparison fair.

**MC-20 · P2 · effort:small — Greeting thresholds disagree between languages: German switches off 'Morgen' at 11, English at 12**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2163`
- Evidence: `const greeting = de ? (hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend") : (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");` (lines 2162–2164). Between 11:00 and 11:59 the two languages disagree about what part of day it is. Additionally `hour < 11`/`hour < 12` means 00:00–04:59 renders 'Guten Morgen'/'Good morning' to a 2 a.m. studier.
- Impact: A user toggling languages before noon sees the app change its mind about the time of day, and the 'kind at 11pm' brand (the Ink theme's own subtitle, line 4475) is undercut when a 1 a.m. session gets a chirpy 'Good morning' instead of acknowledging the late hour.
- Fix: Align both to the same boundaries (11 is the more natural German cut; use it for English too or vice versa) and consider a small-hours branch (hour < 5 → 'Noch wach?' / 'Still up?') — a cheap moment of the delight this greeting exists for.
- Verified: Confirmed lines 2162–2164 verbatim: DE cuts 'Morgen' at 11, EN at 12, so 11:00–11:59 genuinely disagrees across languages; the small-hours claim (00:00–04:59 → morning greeting) follows from hour<11/12 with no lower bound. 'Kind at 11pm' Ink subtitle confirmed at 4475. The core inconsistency is factual; the delight suggestion is opinion but clearly framed as such.


### Mobile & touch ergonomics (19)

**MT-1 · P0 · effort:medium — Primary navigation lives behind a top-corner hamburger — no bottom tab bar on a phone-first PWA**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2015`
- Evidence: <button onClick={() => setShowMobileMenu(!showMobileMenu)} ... className="p-2 -mr-2 text-ink-600 hover:text-ink-900 cursor-pointer"> — the only mobile nav entry point, fixed in the TOP bar (line 2008: `md:hidden ... fixed top-0`); the four tabs + settings (lines 2050–2069) render only inside the hamburger-toggled sidebar (line 2035).
- Impact: On an iPhone in standalone mode, every tab switch costs two taps and a reach to the least-reachable corner of a tall screen. The app has exactly 4 top-level destinations — the textbook case for a bottom tab bar. Dashboard/Upload/Library/Stats each become one thumb-zone tap; instead the dominant platform pattern (iOS tab bar, thumb reach) is inverted. The mobile menu also full-screen-replaces content (line 2143 `${showMobileMenu ? "hidden" : "block"}`), so peeking at nav means losing your place entirely.
- Fix: Add a fixed bottom tab bar below `md:` with the four tab icons + labels (Dashboard, Upload, Library, Stats), padded with `pb-[env(safe-area-inset-bottom)]`, paper surface + top hairline, active state via the existing nav-item tokens; move Settings into a top-bar gear or an overflow. Keep the hamburger only if secondary content (Tutor-Pro card, identity strip) needs a home, or fold those into Settings.
- Verified: Confirmed all cited lines verbatim: hamburger at 2015-2022 in the fixed top bar (2008), nav buttons 2050-2069 only inside the class-toggled aside (2035), main display-swapped at 2143. Grepped for any bottom nav (`fixed bottom` in DashboardClient) — only the voice bar and toasts exist. manifest.json display:standalone confirmed. High severity fair for a 4-destination phone PWA.

**MT-2 · P0 · effort:small — Every core input is 13–14px — iOS auto-zooms on focus in the app's most-used interaction**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:3938`
- Evidence: Quiz answer field: className={`input-inset w-full px-4 py-[13px] text-sm leading-[1.6] ...`} — 14px. Same on the free-answer textarea (4046 `text-sm`), upload textarea (2772 `text-sm`), library search (2842 `text-sm`), settings preset input (4623 `text-sm`), tutor composer (TutorPanel.tsx:418 `text-sm`), and the model selects (`text-[13px]`, 3984/4066). layout.tsx viewport deliberately allows pinch zoom (no maximumScale) — correct for a11y, but it means iOS zooms the page ~1.15× whenever an input under 16px is focused.
- Impact: Answering a quiz question — the core loop of the app — starts with the viewport lurching into a zoom the user then has to pinch back out of, on every task, every day. The fixed top bar and card layout drift half off-screen while typing. This is the single most common 'cheap web app' tell on iOS, and the working-tree diff already bumps BUTTON text to 15px on mobile while leaving the inputs that actually trigger the zoom at 14px.
- Fix: Make all focusable text controls ≥16px below `sm:` — `text-base sm:text-sm` on the textareas, search, preset input, tutor composer, and the selects (or set `font-size: max(16px, 1em)` on input/textarea/select inside a `@media (pointer: coarse)` block in globals.css so it's enforced at the token layer, matching how the design system centralizes everything else).
- Verified: Opened every cited input: 3938, 4046, 2772, 2842, 4623, TutorPanel 418, selects 3984/4066 — all text-sm or text-[13px] as claimed. Verified .input-inset (globals 562) and .input-dark (globals) declare NO font-size, and grepped globals.css for any 16px/coarse-pointer input rule — none. layout.tsx viewport (lines 40-45) has no maximumScale. The uncommitted diff touches only btn-primary heights/text — inputs untouched, so not already fixed.

**MT-3 · P0 · effort:small — The mobile menu snaps open with a raw display toggle — zero motion, violating the app's own enter law**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2035`
- Duplicate-of/with: MO-2, MT-15
- Evidence: className={`${showMobileMenu ? 'flex' : 'hidden'} app-shell-sidebar md:flex ...`} on the <motion.aside> whose `initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }}` (2032–2033) runs once at mount — toggling a `hidden` class never re-triggers it. Main content swaps the same way (2143: `${showMobileMenu ? "hidden" : "block"}`). motion.ts states the law: 'Enter 240ms EASE_OUT rise 8px' and pageVariants animate every tab change.
- Impact: Every tab transition, modal, toast, and accordion in the app obeys the 240ms cinematic system — but the single most-performed mobile gesture (opening/closing the menu) is an instantaneous full-screen content swap with no enter, no exit, no continuity. It feels like a different, cheaper app exactly at the moment a phone user orients themselves. Because main is display-hidden, the collapsed body height can also discard the page scroll position, so closing the menu can dump the user back at the top.
- Fix: Mount the menu conditionally inside <AnimatePresence> (overlay panel sliding from the leading edge, 240ms EASE_OUT, exit 200ms) over a dimmed backdrop instead of display-swapping the shell — this also preserves the main content and its scroll position underneath, and gives tap-outside-to-dismiss for free.
- Verified: Confirmed at 2031-2035: motion.aside with mount-only initial/animate; visibility driven purely by hidden/flex class swap, which framer-motion never re-animates. Main at 2143 confirmed hidden/block. motion.ts line 11 states the 240ms enter law verbatim. Scroll-loss mechanism is sound: display:none on main collapses document height, clamping window scroll on mobile's natural page scroll (comment at 2141-2142).

**MT-4 · P1 · effort:medium — Data-bearing tooltips are mouse-only — the stats heatmap and charts go mute on touch**
- Status: ⏳ open
- Where: `src/app/components/Tooltip.tsx:65`
- Evidence: The Tip wrapper binds only `onMouseEnter={schedule} onMouseLeave={hide} onMouseDown={hide} onFocus={show}` — no touch/press path. It's used where the tooltip IS the data: heatmap day counts (StatsPanel.tsx:516 `label={`${cell.date.toLocaleDateString(locale)} — ${cell.count} … reviews`}` on a 13×13px div), per-module details (547), the 14-day forecast (583), and level distribution (629).
- Impact: On iPhone the entire per-day activity history, module review counts, and forecast dates are simply unreachable — the heatmap becomes decoration. The cells are also 13px squares, far below any touch threshold, so even a tap-to-show implementation would need bigger hit areas. Perfectionist detail: iOS buttons don't focus on tap, so the icon-button tips never appear on touch either (harmless there thanks to aria-labels, but it confirms nothing in the Tip system works on the platform the PWA targets).
- Fix: Give Tip a coarse-pointer mode: on `pointerdown` with pointerType 'touch', show the bubble immediately and dismiss on next outside tap/scroll. For the heatmap specifically, consider a tap-to-pin readout row under the grid (date — N reviews) since 13px cells can't carry individual taps; and enlarge cells to ~16px with the existing gap on mobile.
- Verified: Read Tooltip.tsx in full — handlers at 65-69 are exactly onMouseEnter/onMouseLeave/onMouseDown/onFocus/onBlur; grepped the file and StatsPanel for onTouch/onPointerDown: none. Confirmed all four data-bearing Tip sites (StatsPanel 516, 547, 583, 629) and the 13×13px heat-cell at 517. The div cells aren't focusable, so no keyboard/tap fallback exists for the heatmap data.

**MT-5 · P1 · effort:small — Tapping a due card — the app's most important touch action — gives zero press feedback**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2295`
- Duplicate-of/with: EL-12, MO-11, IS-1
- Evidence: Due card: `whileHover={{ y: -1 }}` + `onClick={() => startQuiz(review)}` (2298) with no whileTap and no press-row; upcoming rows likewise only `hover:bg-(--paper-hover)` (2520). Meanwhile globals.css:301 globally disables the native cue (`-webkit-tap-highlight-color: transparent` — 'we style our own :active states'), and motion.ts even ships the right tool: `hoverLift = { whileHover: { y: -1 }, whileTap: { scale: 0.985 } }`.
- Impact: On touch, hover never fires and the tap highlight is suppressed, so pressing 'Heute fällig' produces literally no visual acknowledgment until the quiz screen swaps in — the card feels dead for the beat between tap and navigation. The app's own press-state convention is applied to library rows (`press-row` at 3007/3107) and history rows (4241), but not to the two dashboard tap surfaces a phone user hits most.
- Fix: Use the existing `hoverLift` spread (or add `whileTap={{ scale: 0.99 }}`) on due cards, and add `press-row` to the upcoming rows — one-line changes that bring the dashboard in line with the system's own press law.
- Verified: Confirmed due card at 2292-2299 has whileHover only (a suspiciously blank line at 2297 where a spread might once have been); upcoming row at 2517-2520 has hover:bg only. Verified globals.css tap-highlight suppression with the quoted comment (~line 301), hoverLift with whileTap in motion.ts (135-139), and press-row genuinely used at 3007/3107/4241 via grep — so the inconsistency claim is accurate, not invented.

**MT-6 · P1 · effort:small — Success/error toasts ignore the home-indicator safe area — the undo bar in the same file gets it right**
- Status: ⏳ open
- Where: `src/app/components/Toast.tsx:49`
- Duplicate-of/with: LS-5
- Evidence: Card toasts: <div className="fixed bottom-5 right-5 z-[100] ..."> — a hard 20px. Thirty-five lines later the undo bar reads `fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))]` (line 84), the pattern also used by the interactive voice bar (DashboardClient.tsx:3641).
- Impact: In standalone mode with `viewportFit: "cover"`, the iPhone home indicator zone is ~34px — success and error toasts (grading saved, deletion failed) render partially inside the swipe-up gesture area, and their already-tiny close buttons (line 73, `p-0.5` ≈ 20px) sit right where a home-swipe begins. Two toast species anchored by two different rules in one file is exactly the kind of drift the design system exists to prevent.
- Fix: Change line 49 to `bottom-[max(1.25rem,env(safe-area-inset-bottom))]` to match the undo bar, and grow the toast close buttons to ≥40px hit areas (`w-10 h-10 -m-2` style negative-margin trick already used on the sidebar sign-out button).
- Verified: Read Toast.tsx in full. Line 49 `fixed bottom-5 right-5` and line 84 `bottom-[max(1.25rem,env(safe-area-inset-bottom))]` confirmed verbatim — two anchoring rules in one component. viewportFit:'cover' confirmed in layout.tsx:43. Close button at 71-77: p-0.5 + w-4 icon = ~20px hit area, math checks out. Voice bar parallel at DashboardClient 3641 confirmed.

**MT-7 · P1 · effort:small — `sm:` breakpoint used as a hover proxy — iPad loses the delete affordance entirely**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2408`
- Duplicate-of/with: IS-3
- Evidence: Due-card delete: className="btn-ghost-icon w-8 h-8 ... sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 ..." — visibility keyed to viewport width, not hover capability. The app explicitly targets iPad (ScribbleCanvas.tsx:19 'iPad heuristic — the wrist lands on the glass while writing', :173 'visibly smoother handwriting on iPad'), and globals.css consistently uses `@media (hover: hover)` guards everywhere else (11 blocks: lines 406, 432, 493…).
- Impact: An iPad is ≥sm (768px+) with a coarse pointer: the delete button is invisible on the very device the scribble feature is built for. The card's footer strip does stopPropagation (2353), so a lucky blind tap on the invisible button won't launch the quiz — but an invisible affordance is an unusable one, and any tap elsewhere on the card to 'find' it starts a review. The width-as-hover assumption contradicts the hover-media discipline the stylesheet itself follows.
- Fix: Gate on capability, not width: Tailwind 4's `pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100` (or a `[@media(hover:hover)]:` arbitrary variant) keeps the hover-reveal for mice while leaving the button visible on all touch devices, matching the hover-media discipline globals.css already follows.
- Verified: Confirmed 2408 verbatim. Verified both iPad comments in ScribbleCanvas (lines 19, 173) and counted 11 `@media (hover: hover)` blocks in globals.css — the capability-gating convention claim is real. One correction applied: the footer container's stopPropagation (2353) means a blind tap wouldn't launch the quiz, so I softened the original 'impossible without launching a review' wording; the invisible-affordance core stands.

**MT-8 · P1 · effort:small — Hands-free interactive mode never requests a screen wake lock — the phone sleeps mid-quiz**
- Status: ⏳ open
- Where: `src/app/useInteractiveQuiz.ts:118`
- Evidence: The hook's contract (docblock ~117-122): 'Drives "interactive mode": reads each question aloud (Gemini TTS...), then captures the spoken answer' — an explicitly hands-free flow (the quiz header badges it 'Freihändig / Hands-free', DashboardClient.tsx:3557-3559). `grep -rn wakeLock src/ public/` returns nothing; no navigator.wakeLock, no fallback.
- Impact: The whole point of the mode is that the phone lies on the desk while the student talks. iOS auto-locks after 30s–2min of no touch; during the long 'speaking' (TTS playback) and 'loading' phases nothing prevents it. The screen dims, the PWA suspends, audio/mic dies mid-task — the flagship delight feature reliably self-destructs unless the user pokes the screen or changes system settings. Safari has supported the Screen Wake Lock API since 16.4.
- Fix: In `start()` (line 804 — inside the user gesture, right where the silent WAV unlock already runs at 816-818) request `navigator.wakeLock.request('screen')`; re-acquire on `visibilitychange` and release in `stop()` (line 739). ~15 lines, transforms the reliability of the mode.
- Verified: Grepped src/ and public/ for wakeLock/WakeLock/wake-lock — zero hits, absence confirmed. Verified the hands-free contract in the docblock, the 'Freihändig' badge at DashboardClient 3557-3559, start() at 804 with the silentWavUri() unlock at 816-818 (the exact user-gesture site the fix needs), and stop() at 739 for release.

**MT-9 · P1 · effort:medium — The installed PWA has no offline story — sw.js handles push only, offline launch shows a browser error page**
- Status: ⏳ open
- Where: `public/sw.js:1`
- Duplicate-of/with: EM-8, PP-8
- Evidence: // Service Worker for Push Notifications — the file registers `push`, `notificationclick`, `install` (skipWaiting) and `activate` listeners only. There is no `fetch` handler, no precache, no offline fallback route anywhere; the only SW registration is layout.tsx:126 `navigator.serviceWorker.register('/sw.js')` and no next-pwa/workbox exists in the repo.
- Impact: A study app whose core promise is 'review on your phone, anywhere' dies on the subway: launching the home-screen icon without a connection renders the OS network-error page — the least crafted screen a user of this meticulously designed app will ever see. Even a minimal branded offline fallback ('You're offline — reviews sync when you're back') would keep the Paper & Ember world intact; today the illusion breaks at the front door.
- Fix: Add a fetch handler with a cache-first shell: precache the app shell + fonts + icon on install, serve a branded /offline fallback for navigations when the network fails. Full offline review answering is a bigger project; the branded fallback page alone is a small, high-dignity win.
- Verified: Read sw.js in full (47 lines): push, notificationclick, install, activate only — no fetch listener. Actively searched beyond the cited file: grepped for serviceWorker/next-pwa/workbox across src/, next.config, package.json — only the /sw.js registration in layout.tsx:126. Offline handling genuinely absent, not living elsewhere.

**MT-10 · P1 · effort:medium — No history integration — the system back gesture exits the app from inside a quiz or modal**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:1549`
- Evidence: window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : "")); — the ONLY history call in the client (deep-link cleanup). Tab switches (setActiveTab), entering a quiz (startQuiz), and all 7 modal overlays mutate React state without pushing a history entry; no popstate listener exists anywhere.
- Impact: In standalone mode there is no browser chrome. On Android, the hardware/gesture back — the most instinctive dismissal action on the platform — closes the entire app instead of closing the settings modal or leaving the quiz. On iOS, the edge-swipe does nothing at all, so the muscle-memory gesture for 'go back' is dead and users must find the small in-page '← Dashboard' text button (line 3531). Deep states (quiz view especially) feel like traps.
- Fix: Push a history entry when entering the quiz view and when opening modals, and handle `popstate` to unwind them (quiz → dashboard, modal → close). Even doing this for the quiz view + settings modal alone would cover the two states users most often try to back out of.
- Verified: Grepped all of src/app for `history.` and `popstate`: the single replaceState at 1549 is the only hit, and it strips a query param (doesn't add entries). Confirmed quiz exit is the in-page text button at 3531-3545. Corrected the modal count from 9 to 7 (grep `fixed inset-0` + overlayMotion usages: 4108, 4160, 4324, 4437, 4903, 4952, 5008).

**MT-11 · P1 · effort:medium — Tutor chat on iPhone: fixed full-height panel with no keyboard handling and no scroll containment**
- Status: ⏳ open
- Where: `src/app/components/TutorPanel.tsx:333`
- Duplicate-of/with: AX-10
- Evidence: Messages scroller: <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5"> — no `overscroll-contain`, though every modal scroller in DashboardClient has it (4128, 4209, 4330, 4443, 4927, 4989, 5045). The panel itself is `fixed inset-y-0 right-0 z-[70] w-full sm:w-[376px]` (line 299) with the composer pinned at the bottom (406), and there is no visualViewport listener anywhere in the file or the codebase.
- Impact: Two compounding touch problems: (1) reaching the end of the chat chain-scrolls the quiz page behind the full-screen panel, so the quiz silently ends up somewhere else when the panel closes; (2) when the iOS keyboard opens over a `fixed inset-y-0` panel in standalone mode, the layout viewport doesn't resize — the pinned composer can sit behind the keyboard and iOS 'helpfully' pans the page, offsetting the whole panel. The one surface built for sustained mobile typing is the one with no keyboard strategy.
- Fix: Add `overscroll-contain` to the messages scroller (one class, matches the app's own modal convention). For the keyboard: size the panel off the visualViewport (listen to `visualViewport.resize` and set a `--vvh` custom property, or use `h-[100dvh]` plus `interactive-widget=resizes-content` behavior checks) so the composer rides above the keyboard.
- Verified: Read TutorPanel 290-446: line 299 fixed inset-y-0 w-full and line 333 scroller without overscroll-contain confirmed verbatim; composer at 406. Grepped the repo for visualViewport/100dvh/interactive-widget in the panel — nothing. Verified the contrast claim: 8 overscroll-contain scrollers exist in DashboardClient modals, so this is a genuine internal inconsistency, not generic advice.

**MT-12 · P1 · effort:small — Touch-target sweep: a family of recurring controls sits well under 44px**
- Status: ⏳ open
- Where: `src/app/globals.css:594`
- Evidence: .chip { ... height: 30px; } — chips are tappable links/buttons (semester filter StatsPanel.tsx:437/448, Tutor-brief link DashboardClient.tsx:3350). Also: sidebar/mobile-menu nav items `h-[38px]` (DashboardClient.tsx:2050–2076 — these ARE the mobile menu rows), snooze pills `h-7` = 28px (2327), due-card footer links bare `text-xs` ≈ 17px tall (2363, 2374 'Materialien'/'Letztes Feedback'), snooze/delete icon buttons `w-8 h-8` = 32px (2339, 2408), TTS speaker `w-6 h-6` = 24px (TutorPanel.tsx:379), scribble Undo/Clear `px-2.5 py-1` ≈ 24px (ScribbleCanvas.tsx:238, 246).
- Impact: Apple's HIG floor is 44pt; most of the app's secondary actions are 24–38px. The ones that hurt: snooze pills (28px, appear under time pressure after arming), the scribble Undo button (24px, used mid-handwriting with a finger), the TTS speaker (24px), and footer text-links on due cards (~17px, adjacent to a card whose tap starts a quiz — a miss costs an unwanted navigation).
- Fix: Keep visual sizes; grow hit areas. Pattern already proven in this codebase (sign-out: `w-9 h-9 -m-1`, DashboardClient.tsx:2131): apply negative-margin padding to the footer links (`py-2.5 -my-2.5`), snooze pills, scribble Undo/Clear (`py-2 -my-1.5`), and the TTS speaker (`w-9 h-9 -m-1.5`). Consider `min-height: 44px` on `.chip` under `@media (pointer: coarse)`.
- Verified: Checked every cited control at source: .chip height:30px at globals 594 exactly; nav h-[38px] 2050-2076; snooze pill h-7 at 2327 (corrected from 2325); footer links text-xs at 2363/2374; w-8 icon buttons 2339/2408; TTS w-6 h-6 at TutorPanel 379; scribble px-2.5 py-1 at ScribbleCanvas 238/246. Also confirmed the negative-margin precedent (sign-out w-9 h-9 -m-1 at 2131) the fix cites.

**MT-13 · P2 · effort:small — Enter always sends in the tutor composer — a newline is impossible on phone keyboards**
- Status: ⏳ open
- Where: `src/app/components/TutorPanel.tsx:412`
- Evidence: onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} — and the hint row advertises '⇧ ↵ neue Zeile' (line 439), a chord that doesn't exist on the iOS software keyboard.
- Impact: On iPhone the return key fires Enter with no shift modifier available, so a student pasting or structuring a multi-line question (formula on its own line, numbered sub-questions) cannot — every return submits a fragment mid-thought. The footer hint promising Shift+Enter on a device with no Shift+Enter reads as desktop code shipped to mobile.
- Fix: Gate the Enter-to-send on a fine pointer (e.g. `window.matchMedia('(pointer: coarse)')` checked once): on touch, Enter inserts a newline and the send button (already present, 44px at line 426) is the submit affordance — the convention of every mobile chat app. Hide the ⇧↵ hint on coarse pointers.
- Verified: Confirmed handler at 411-416 and both kbd hints at 438-439 verbatim. The send button at 421-426 is w-11 h-11 (44px), so the recommended mobile path already exists in the UI — the fix is purely gating the keydown.

**MT-14 · P2 · effort:small — Activity heatmap opens scrolled to six months ago — today is off-screen on phones**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:493`
- Duplicate-of/with: LS-8
- Evidence: <div className="overflow-x-auto custom-scrollbar pb-1"><div className="flex gap-1 min-w-max"> — 26 week-columns (built oldest-first: the loop at 226 starts at `firstMonday`, 25 weeks back, and ends at the current week) ≈ 460px wide, with no ref and no scrollLeft initialization anywhere in the file.
- Impact: On a 390px iPhone the scroll container clips the newest ~8 weeks (card + page padding leave ~318px): the panel greets the user with their stale winter history while the streak they built THIS week — the emotionally charged cells, the reason they opened the stats tab — hides past the right edge. GitHub-style graphs always anchor to today for exactly this reason.
- Fix: After mount, set `el.scrollLeft = el.scrollWidth` on the scroll container (a ref + useEffect, ~3 lines), so the view opens on the current week and scrolls back into history.
- Verified: Verified the ordering in the computed.weeks loop (lines 222-237): w=0 is firstMonday = thisMonday − 25×7, so columns render oldest→newest. Grepped the file for scrollLeft/scrollWidth — none. Recomputed widths: 26 cols × (13px + 4px gap) + weekday gutter ≈ 460px vs ~318px visible on a 390px phone — actually ~8 newest weeks clipped, slightly worse than the finding claimed.

**MT-15 · P2 · effort:small — Mobile menu min-height hardcodes a 61px top bar — bottom items fall below the fold on notched iPhones**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2035`
- Duplicate-of/with: MO-2, MT-3
- Evidence: min-h-[calc(100dvh_-_61px)] on the sidebar/menu — but the bar it subtracts is `pt-[max(0.75rem,env(safe-area-inset-top))] pb-3` (line 2008) with an h-7 row and 1px border: ~53px on a bezel phone, ~90–100px under a notch/Dynamic Island.
- Impact: On the primary target device the menu is forced ~30–40px taller than the space under the real bar (spacer ~100px + menu ≥ 100dvh−61 → total ≥ 100dvh+39), so the `mt-auto` block (notification toggle, Tutor-Pro card, identity strip, sign-out) is pushed past the viewport bottom and the 'full-screen' menu unexpectedly scrolls — a subtle but constant wrongness on exactly the phones with safe areas, defeating the careful env() work one line above.
- Fix: Mirror the bar's real height: cleanest is making the fixed bar and the menu siblings in a flex column (menu `flex-1`) or measuring the bar once into a CSS variable. If the menu becomes an animated overlay (see menu-motion finding), size it `inset-0 pt-[var(--topbar-h)]` and both bugs disappear together.
- Verified: Confirmed min-h-[calc(100dvh_-_61px)] at 2035 and the bar's real height formula at 2008 (max(12px, inset-top) + 12px pb + 28px h-7 + 1px border). Recomputed both cases: 53px bezel / ~100px Dynamic Island — 61px matches neither, and the spacer at 2026-2028 duplicates the bar's REAL height, so on notched phones total flow height exceeds 100dvh and the mt-auto block (2072) scrolls out. Math holds.

**MT-16 · P2 · effort:small — Modal family splits on mobile: two overlays bottom-sheet, five center — one dialog grammar should win**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:4952`
- Duplicate-of/with: LS-2
- Evidence: Comprehension-feedback viewer: className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4" and the prompt viewer (5008) — `items-end` = bottom-anchored on phones. The other five overlays (archive 4108, feedback 4160, calendar 4324, settings 4437, prompts-list 4903) are `items-center` at all sizes, all sharing the same `modalPanel` rise-from-below motion.
- Impact: Two of seven dialogs dock to the bottom edge on a phone while the rest float centered — same product, same session, two spatial grammars. The bottom-sheet position is actually the better mobile pattern (thumb-reachable close, natural swipe-down expectation), which makes the five centered ones the drift; either way the inconsistency reads as accretion, not intent.
- Fix: Pick one: add `items-end sm:items-center` to all overlay containers (plus rounding only the top corners below sm) so every dialog becomes a sheet on phones — or revert the two outliers to `items-center`. If sheets win, a drag-down-to-dismiss on the panel would complete the pattern.
- Verified: Grepped all `fixed inset-0` overlay containers: exactly 7 (matching 7 overlayMotion spreads). Confirmed the split: 4952 and 5008 are `items-end sm:items-center`; 4108, 4160, 4324, 4437, 4903 are `items-center` unconditionally. Corrected the original count (said nine/seven; actual seven/five) and fixed two line refs (feedback 4160, calendar 4324).

**MT-17 · P2 · effort:medium — Zero swipe gestures anywhere — snoozing a card takes three precise taps on 28–32px targets**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2337`
- Evidence: Snooze flow: first tap arms via a 32px icon button (`onClick={(e) => { e.stopPropagation(); ... setSnoozeArmedId(review.id); }}`), then a second tap on a 28px `h-7` pill (2322–2330). A repo-wide grep for drag/swipe/onPan/onTouch finds only the upload-zone dragover handlers and the scribble canvas pointer events — no gesture support on cards, the tutor panel, the mobile menu, or any modal.
- Impact: List rows that beg for the platform gesture (swipe a due card left → snooze options, the exact pattern of every iOS mail/todo/SRS app) instead demand a two-step tap dance on sub-HIG targets. The full-screen tutor panel and mobile menu can only be dismissed by reaching the top corners. For a touch-first PWA, the entire gesture vocabulary of the platform is unused — everything is desktop clicks transplanted to glass.
- Fix: Highest-value first: framer-motion is already loaded — give due cards `drag="x"` with constraints revealing the existing +1/+3/+7 pills behind the card (snooze logic already exists), and add swipe-down/edge-swipe dismissal to the tutor panel and mobile menu via `onPanEnd` velocity checks. No new dependencies.
- Verified: Re-ran the absence grep myself: drag/swipe/onPan/onTouch across src/app hits only upload-zone dragover/drop and ScribbleCanvas pointer handlers — no gesture code exists. Confirmed the snooze two-step (arm at 2337 on w-8 h-8, pills h-7 at 2322-2330). Kept despite its breadth because it's anchored to a concrete measured flow, not generic advice.

**MT-18 · P2 · effort:small — No overscroll-behavior on the page — Android pull-to-refresh can wipe comprehension answers**
- Status: ⏳ open
- Where: `src/app/globals.css:293`
- Evidence: html { color-scheme: light; scroll-behavior: smooth; ... overflow-x: clip; } — no `overscroll-behavior-y` on html/body anywhere in the stylesheet; on mobile the app deliberately uses natural page scroll (DashboardClient.tsx:2141 comment).
- Impact: In an installed Android PWA, dragging down from the top of the quiz view triggers Chrome's pull-to-refresh reload. Normal quiz drafts survive (autosaved, line 1557), but comprehension-check answers are explicitly not saved (draft effect bails at 1562 `if (comprehensionMode) return;` and the UI says so at 4086: 'Verständnis-Check-Antworten werden nicht als Entwurf gespeichert') — one reflexive over-scroll while reviewing your answers destroys a full quiz's worth of typing.
- Fix: Set `overscroll-behavior-y: contain` on html/body (or `none` if the rubber-band at top is also unwanted on Android). iOS standalone has no PTR so nothing regresses there; the elastic bounce inside `overscroll-contain` scrollers is unaffected.
- Verified: Read the html block at globals 293-303 — no overscroll-behavior; grepped the whole app: overscroll-contain exists only on modal scrollers and the scribble canvas, never html/body. Verified the data-loss chain end-to-end: autosave effect at 1557 explicitly skips comprehensionMode at 1562, and the UI copy at 4086 confirms comprehension answers are draft-free.

**MT-19 · P2 · effort:small — Manifest ships one 192px PNG doing double duty as 'any maskable' — Android adaptive icons will crop it**
- Status: ⏳ open
- Where: `public/manifest.json:14`
- Evidence: { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" } — the same bitmap declared for both purposes; the only other icons are SVGs (icon-192.svg, icon-512.svg, no purpose field), and there is no 512px raster.
- Impact: Maskable icons must keep content inside the central 80% safe zone because Android crops them to circles/squircles; an icon designed for 'any' gets its edges (the brand-tile's rounded corners and gradient rim) sliced off on most Android launchers — combining both purposes in one icon is explicitly discouraged in the spec for this reason. The 512 SVG may cover splash on modern Chrome, but launchers and older Android fall back to the dual-purpose 192 PNG, so the install-surface icon is either cropped or upscaled.
- Fix: Export three rasters: icon-192.png + icon-512.png with `purpose: "any"`, and a dedicated maskable-512.png with the S-tile scaled to the 80% safe zone on a full-bleed paper background, `purpose: "maskable"`. Ten minutes with the existing SVG source.
- Verified: Read manifest.json in full: `"purpose": "any maskable"` on the lone 192 PNG confirmed at line 14; only other icons are SVGs at 192/512 with default purpose. Softened the original splash claim slightly — Chrome can use the 512 SVG for splash — but the core spec violation (one icon serving both purposes → launcher cropping) is accurate and stands.


### Perceived performance & stability (12)

**PP-1 · P0 · effort:medium — Date-dependent SSR output (greeting, date eyebrow, due-sorting) hydrates differently on the client — first paint flashes and re-sorts**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2162`
- Evidence: Rendered inline during SSR: `const now = new Date(); const hour = now.getHours(); const greeting = de ? (hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend") : …` plus `const dateEyebrow = now.toLocaleDateString(…)` (lines 2160–2165). Dueness is also computed at render time: `useState<ReviewCard[]>(initialItems ? formatItems(initialItems) : [])` (line 532) where formatItems does `const isDue = isDueLocal(new Date(item.nextReviewDate), now)` and sorts `if (a.isDue && !b.isDue) return -1` (lines 470–494). The page is SSR'd per request (page.tsx line 10 `force-dynamic`), and only `<html>` has suppressHydrationWarning (layout.tsx line 56).
- Impact: A UTC server and a German (UTC+1/+2) browser disagree on the hour for ~2h around each greeting boundary and on the local calendar day from local midnight until 01:00–02:00. Server HTML paints the wrong greeting and stale dueness; hydration recomputes: the 34–44px display headline swaps text, "Heute fällig" cards appear, the list re-sorts due-first in front of the user, and React logs a hydration mismatch and client-re-renders the tree. The most prominent element on the page is the one that flashes — in a codebase whose own comments say the extra server reads exist to 'kill first-paint flashes'.
- Fix: Make the time-dependent values hydration-safe: hold `now` in state initialized from a stable server-passed timestamp (or a user timezone stored in settings, since the server already reads appConfig), then correct it in a `useEffect` after mount via an intentional, transition-wrapped update — or compute greeting/dueness only client-side with the SSR frame rendering a timezone-neutral skeleton line. The formatItems sort must use the same `now` on both sides.
- Verified: Confirmed greeting/dateEyebrow computed inline in the render IIFE (2160–2165), formatItems' `new Date()` inside the useState initializer (470, 532), force-dynamic SSR (page.tsx:10), and grep shows suppressHydrationWarning only on <html> (layout.tsx:56) — nothing suppresses or defers these values. Mechanism is real; the tz-offset window math holds for any UTC server.

**PP-2 · P0 · effort:small — Tab switches never reset the desktop scroll container — startQuiz's window.scrollTo is a no-op on md+, so quizzes open scrolled to a random position**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:1526`
- Evidence: startQuiz ends with `window.scrollTo({ top: 0, behavior: "smooth" });` under the comment "Always start at the top so the quiz header is immediately visible." But on md+ the window doesn't scroll — the scroller is `<main className="… app-shell-main … md:h-[100dvh] md:overflow-y-auto">` (line 2143). Grep confirms these are the only scroll calls in the file (line 710 scrollIntoView for voice mode, line 1526); no ref on <main>, no effect resets its scrollTop on `activeTab` change.
- Impact: On desktop/iPad: scroll deep into the library or the upcoming list, click a lecture — the quiz tab mounts with the old scrollTop (quiz content is tall, so the browser never clamps it), and the quiz header, level eyebrow and first task are off-screen. Every tab pair inherits the other's scroll offset, so navigation feels dislocated, and the AnimatePresence enter animation plays off-screen. The code's own comment states the intent this breaks. On mobile it accidentally works because the page flows naturally.
- Fix: Attach a ref to `<main>` and on every `activeTab` change (and inside startQuiz) call `mainRef.current?.scrollTo({ top: 0 })` in addition to `window.scrollTo` — instant, not smooth, so the enter animation is what the user sees.
- Verified: Verified the only two scroll calls in the 5,056-line file via grep; <main> at 2143 is the md+ scroller (md:h-[100dvh] md:overflow-y-auto), un-keyed so it persists across AnimatePresence tab swaps, and globals.css only unlocks the shell below 600px height. window.scrollTo is genuinely inert on md+.

**PP-3 · P1 · effort:small — Sidebar flashes "SEMESTER 1", wrong 'Active' badge, and empty module presets on every load — the server already has this data but doesn't pass it**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:562`
- Evidence: `const [currentSemester, setCurrentSemester] = useState<number>(1);` and `const [modulePresets, setModulePresets] = useState<string[]>([]);` (562–563) are populated only by a client `fetch('/api/settings')` effect (594–610). The always-visible sidebar renders `Semester {currentSemester}` (line 2044). Meanwhile page.tsx queries appConfig on the server but selects only `{ language: true }` (line 24) — its own comment says "The extra reads kill first-paint flashes" and fixed language + pass-rate, but not semester/presets.
- Impact: For any user past semester 1, every page load paints "SEMESTER 1" under the wordmark and flips after a network round-trip — persistent chrome, visible on all tabs. The library's "Aktiv" badge (`sem === currentSemester`, lines 2947/2969) sits on the wrong semester for a beat, and the upload tab briefly shows the "Keine Module für Semester N definiert" fallback (line 2681) before presets arrive. This directly violates the codebase's own stated first-paint rule.
- Fix: Extend the existing appConfig select in page.tsx to `{ language, currentSemester, modulePresets, wrapperMode, fileTransport }` (all exist on the AppConfig model, prisma/schema.prisma 108–112; modulePresets needs a JSON.parse) and seed the useStates from props, exactly as done for initialLanguage/initialPassRate30. The mount fetch can stay as revalidation.
- Verified: Confirmed all four cited render sites (sidebar 2044, badge 2947/2969, upload fallback 2681) read the client-fetched state, page.tsx:24 selects only language, and prisma schema has currentSemester/modulePresets/wrapperMode/fileTransport — so the recommended fix is directly feasible.

**PP-4 · P1 · effort:medium — Stats tab replays its entire loading choreography on every visit — skeleton, 1.1s count-up, ~1.1s heatmap stagger, zero caching**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:112`
- Evidence: StatsPanel is conditionally mounted per tab (`{activeTab === "stats" && … <StatsPanel/>}`, DashboardClient lines 3498/3518) and fetches on every mount with `loading` starting true: `useEffect(() => { … fetch("/api/stats") … }, []);` (lines 112–135, `useState(true)` at 108). On success it plays `AnimatedNumber` from a `useState(0)` display with `duration: 1.1` (lines 72, 86) and staggers heatmap columns at `delay: 0.15 + w * 0.035` (line 511) — the last of ~26 columns starts at ~1.06s.
- Impact: Visit Stats, flip to Library, flip back ten seconds later: full skeleton again, all four headline numbers count from zero again, the heatmap fades in column-by-column again. What reads as delight once reads as slowness every time after; the tab never feels 'already there' even though the data hasn't changed.
- Fix: Cache the last StatsResponse across mounts (module-level variable or state lifted into DashboardClient) and render it immediately, revalidating in the background (stale-while-revalidate). Gate the count-up and heatmap stagger to the first reveal per session; subsequent mounts render final values instantly.
- Verified: Confirmed conditional mount (unmounts on tab leave, so all state including `data` is discarded), fetch effect with loading=true on every mount, AnimatedNumber always starting at 0 on mount, and the per-column stagger delays. No cache anywhere (grep for the response type shows only this component).

**PP-5 · P1 · effort:large — Every keystroke re-renders the whole 5,000-line component — library search and quiz answer state are colocated with the entire app**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:769`
- Evidence: `const [librarySearch, setLibrarySearch] = useState("");` (769) and `const [individualAnswers, setIndividualAnswers] = useState<Record<string, string>>({});` (618) live at the top of DashboardClient. Grep confirms zero `useDeferredValue` and zero `memo(`/`React.memo` in the file. The library auto-expands everything (effect at 993–1010), so all lecture rows — each with multiple `Tip` wrappers, a `motion.div` chevron and 7 tooltip-wrapped level dots (3137–3151, 3165) — re-render on each search keystroke. Quiz typing re-renders every inline task card (3858+), the sidebar and header, and the global keydown effect re-subscribes per keystroke since its deps include `individualAnswers, studentAnswers` (dep array at ~1942–1946).
- Impact: Typing — the highest-frequency interaction in a study app — pays the cost of the entire mounted tab tree per character. With a semester's worth of lectures (hundreds of rows × several tooltip/motion components each) or a 10-task quiz on an iPad, this shows up as input latency exactly where the app must feel like paper, and burns battery re-rendering framer-motion components that didn't change.
- Fix: Extract the library list and the quiz task list into memoized child components; colocate the search input's state (or pass `useDeferredValue(librarySearch)` to the filter memo), and give each task card its own controlled textarea reporting up through a stable callback. React.memo on the lecture row with primitive props gets most of the win.
- Verified: Confirmed both states at cited lines, the absence of any memo/useDeferredValue via grep across the file, the auto-expand-everything effect, the per-row Tip/motion cost, and the keydown effect's dep array containing individualAnswers/studentAnswers. Structural claim is accurate; magnitude claim is plausible and scales with library size.

**PP-6 · P1 · effort:medium — Frozen 30-day pass-rate card — the right-rail number never updates after grading**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:638`
- Duplicate-of/with: IA-4
- Evidence: `const passRate30 = initialPassRate30;` — a plain alias of the server prop, rendered as the headline `{Math.round((passRate30.passed / passRate30.total) * 100)}%` and its progress bar (lines 2567–2582). Grep shows no setter and no refetch anywhere: handleGrade's `done` handler only calls `fetchReviews()` (line 1784).
- Impact: Pass a review, return to the dashboard: the due list live-updates but "Bestehensquote · 30 Tage" still shows the pre-quiz numbers until a hard reload. A stat that silently lies right after the app's earned moment (the pass) undercuts the reward loop — the user just changed this number and the UI doesn't acknowledge it.
- Fix: Return the two counts from GET /api/reviews (or a tiny /api/passrate reusing fetchPassRate30 from src/lib/review-query.ts) and update the card inside fetchReviews' startTransition; alternatively bump it optimistically on a grading `done` event (passed/total both +1 or total +1).
- Verified: Grep for passRate/initialPassRate confirms the prop is aliased once (638), rendered (2567–2582), and never updated; the grading done handler (1770–1785) only calls fetchReviews(), which touches upcomingReviews/rawItems only. StatsPanel's own pass-rate is a separate component and doesn't feed this card.

**PP-7 · P1 · effort:small — Fraunces loads with default display:swap — the 44–54px serif hero visibly morphs on cold loads**
- Status: ⏳ open
- Where: `src/app/layout.tsx:6`
- Evidence: `const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });` — no `display` option. The shipped Next docs confirm the default: "with default value of 'swap'" (node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md line 174). The face is used at 34–44px for the dashboard greeting (DashboardClient line 2175) and at up to 54px for the login headline "Lerne weniger. Behalte mehr." (LoginClient line 75).
- Impact: On a cold PWA start or slow first visit, the greeting and the login hero paint in the size-adjusted serif fallback and then swap to Fraunces' high-contrast letterforms mid-view. adjustFontFallback suppresses most CLS but not the glyph morph — and it hits the largest, most branded element on every screen, at the exact moment the app should feel composed. Warm loads are unaffected (font cached), so this is a first-impression/cold-start flaw.
- Fix: Set `display: "optional"` on Fraunces (a brand face can miss one first paint; every warm load renders it instantly with zero swap) while keeping Inter on swap. If losing the serif on the very first paint is unacceptable, use `display: "block"` with its short block period instead — either beats a visible mid-headline morph.
- Verified: Confirmed no display option in the Fraunces() call, the 'swap' default in the repo's own shipped Next docs (per AGENTS.md's instruction to trust those docs), and both cited hero usages at 34–54px. Scoped the impact to cold loads since next/font preloads and caches the files.

**PP-8 · P1 · effort:medium — Service worker provides zero load-time benefit — the installed PWA has no offline shell and every cold home-screen launch is full-network**
- Status: ⏳ open
- Where: `public/sw.js:1`
- Duplicate-of/with: EM-8, MT-9
- Evidence: sw.js (47 lines) contains only `push`, `notificationclick`, `install` (skipWaiting) and `activate` (clients.claim) listeners — no `fetch` handler, no Cache API usage at all. Yet the app is explicitly built as an installed PWA: manifest.json `"display": "standalone"`, `appleWebApp` metadata in layout.tsx (lines 24–30), and subscribeToPush instructs users to add it to the Home Screen (DashboardClient ~814–819).
- Impact: Every cold launch of the home-screen app downloads HTML, JS chunks and both variable fonts over the network — a blank/system-splash wait that a study app used daily (on transit, in lecture halls) hits constantly. Offline it simply errors. The upside: there is no stale-content risk today — but also no instant-load payoff from having a SW at all.
- Fix: Add a conservative fetch handler: cache-first for content-hashed immutable assets (/_next/static/, font files, icons) and a small offline fallback page; keep HTML and /api network-first with no caching. This keeps the zero-staleness property while making warm launches near-instant.
- Verified: Read the full 47-line sw.js — push/notificationclick/install/activate only, zero fetch/caches usage; confirmed standalone manifest and appleWebApp/apple-touch-icon setup, so the app genuinely targets installed use without any asset caching.

**PP-9 · P2 · effort:small — Redundant review fetches: an immediate refetch on mount right after SSR, and a double fetch on every tab refocus**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:951`
- Evidence: The mount effect always runs `fetchReviews()` (line 951) even though page.tsx delivered fresh `initialItems` milliseconds earlier in the same response. Both `window 'focus'` and `document 'visibilitychange'` handlers call fetchReviews (lines 952–957); when the user returns to the tab both fire in quick succession, and the coalescing logic (`fetchInFlightRef`/`fetchDirtyRef`, lines 903–941) queues the second as a full re-run via setTimeout — two sequential GET /api/reviews per refocus.
- Impact: Doubled network chatter and two formatItems sorts + tree renders (transition-wrapped, but still work) on every app switch — which on a mobile PWA is many times per session. The mount refetch also races the SSR data it just received.
- Fix: Timestamp the last successful fetch and skip triggers within ~1–2s of it (covers both the SSR-then-mount case and the focus+visibilitychange double-fire); keep the dirty-flag only for refetches requested while a fetch is genuinely mid-flight.
- Verified: Confirmed the unconditional mount call, both refocus listeners, and the coalescing path that guarantees a queued second full fetch when two triggers land while one is in flight. Corrected line to 951 (the mount call; 952 is the focus handler). Low is right — updates are startTransition-wrapped so no visible blink, just wasted work.

**PP-10 · P2 · effort:small — backdrop-blur-xl on fixed/sticky bars repaints a 24px blur on every scrolled frame on mobile**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2008`
- Evidence: Mobile top bar: `className="md:hidden … bg-(--paper-0)/92 backdrop-blur-xl fixed top-0 left-0 right-0 z-50"`. Same pattern on the tutor brief page header: `sticky top-0 … bg-(--paper-0)/92 backdrop-blur-xl` (src/app/tutor/[id]/page.tsx line 40). Grep shows every other blur in the app is a static modal backdrop at `backdrop-blur-[3px]` — the design system otherwise keeps blur cheap.
- Impact: A full-width 24px backdrop blur sampling the page beneath it re-composites every frame while scrolling — a measurable per-frame cost on mid-range devices, and it sits exactly on the mobile scroll surface. At 92% paper opacity the glass effect is barely perceptible anyway, so the risked dropped frames buy almost nothing visually.
- Fix: Drop to `backdrop-blur-md` or a custom 6–8px, or raise the paper opacity to ~0.97 with the existing hairline and skip blur entirely on the top bar; at 92%+ opacity the blur is barely perceptible anyway.
- Verified: Confirmed both blur-xl sites via grep and that all seven other backdrop-blur uses are 3px modal overlays. The per-frame compositing cost of backdrop-filter under a fixed bar during scroll is real; kept at low since modern iPhones usually absorb it.

**PP-11 · P2 · effort:small — New accounts see skeleton cards that dissolve into an empty state — a loading lie on the first-ever impression**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:536`
- Evidence: `const [isLoadingReviews, setIsLoadingReviews] = useState(initialItems.length === 0);` — but initialItems comes from the server's fetchReviewList (page.tsx lines 22–23), which has no catch and throws on failure, so a rendered page with `[]` authoritatively means 'empty library', never 'unknown'. The dashboard then renders three fake cards (`{[0, 1, 2].map((i) => (<div … className="card-surface p-5 space-y-3">`, lines 2218–2224) and the greeting sub-line "Einen Moment …" (line 2180) until the redundant client refetch returns [] and swaps in the empty state.
- Impact: A brand-new user's very first frames promise content (three loading cards) and then retract it — skeleton → 'Hier ist noch nichts' is a visible bait-and-switch plus layout swap at the most impressionable moment of the product. The skeleton exists for a state that can currently never be 'loading'.
- Fix: Trust the SSR result: initialize `isLoadingReviews` to false unconditionally (the server fetch either succeeded with real data — possibly empty — or the page errored before rendering). Keep the skeleton only if a future code path can mount without server data.
- Verified: Verified src/lib/review-query.ts fetchReviewList has no error handling (throws → page error, DashboardClient never mounts), so the claim that SSR `[]` is authoritative holds; confirmed the skeleton block, the 'Einen Moment …' sub-line, and that isLoadingReviews only clears in fetchReviews' finally.

**PP-12 · P2 · effort:small — Stats skeleton doesn't match the final layout it claims to mirror — different stack gap, different grid gap, missing filter row**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:322`
- Duplicate-of/with: LS-7
- Evidence: The skeleton (comment: "mirrors the final layout, so nothing jumps", line 319) renders `<div className="flex flex-col gap-6" …>` with a stat grid `gap-4` (line 323), but the real panel renders `flex flex-col gap-4` (line 423) with a stat grid `gap-3.5` (line 457) — every card below the first row shifts on swap. When more than one semester exists, the real layout also prepends a semester-filter chip row (lines 425–454) that the skeleton omits, pushing all content down by a full chip row when data lands.
- Impact: The skeleton-to-content swap visibly reflows: cards shift several pixels from the 24px→16px stack-gap mismatch, and multi-semester users get the entire panel jumping down by the filter row's height — precisely the layout shift the skeleton was written to prevent, contradicted by its own comment.
- Fix: Align tokens exactly (gap-4 outer stack, gap-3.5 grid) and reserve the filter row's height in the skeleton whenever `items` spans more than one semester (the `items` prop is available before the fetch resolves, so the condition is computable during loading).
- Verified: Diffed the two layouts directly: skeleton gap-6/gap-4 (322–323) vs real gap-4/gap-3.5 (423, 457), filter row rendered only in the real branch behind `semesters.length > 1` (425), and `semesters` derives from the `items` prop (139–142) which exists during loading — so the reserve-height fix is feasible as stated.


### Information architecture & hierarchy (18)

**IA-1 · P0 · effort:small — Dashboard headline can state a factually wrong 'next review' date — and 'Review ahead' starts the wrong item — because the scheduled list is ordered alphabetically, not chronologically**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2166`
- Evidence: formatItems() sorts non-due items by module name FIRST: `const subjectCompare = a.subject.localeCompare(b.subject); if (subjectCompare !== 0) return subjectCompare;` (L491–494, under the comment "Sort logic: Due items first, then group by module, then by urgency"). The dashboard then derives its headline claim from position 0: `const nextUp = scheduledItems[0] ? new Date(scheduledItems[0].raw.nextReviewDate) : null;` (L2166), rendered as "Nothing due today. The next review lands ${fmtLong(nextUp)}" (L2186) and "That's everything until ${fmtLong(nextUp)}" in the All-clear card (L2256). The "Review ahead" button also fires `startQuiz(scheduledItems[0])` (L2198). The "Upcoming" list (L2514–2530) shows a right-aligned date column (L2527) in this same non-chronological order.
- Impact: scheduledItems[0] is the earliest item of the ALPHABETICALLY-FIRST module, not the soonest review overall. If 'Anatomie' has a review on Jul 20 and 'Zoologie' one on Jul 12, the greeting confidently tells the student their next review is Jul 20 — the single most load-bearing sentence on the screen is wrong. 'Review ahead' pre-studies the wrong item (the one whose interval least needs it), and the Upcoming list reads as a schedule while its dates jump around (12., 20., 11., …), which quietly erodes trust in the whole scheduling promise of an SRS app.
- Fix: Sort scheduled (non-due) items strictly by nextReviewDate ascending (keep due-first). Derive nextUp as the min date (which then falls out of the sort for free). If module grouping is wanted in 'Upcoming', group visually by day ("Tomorrow", "Fri 12 Jul") instead — a list with a date column must be in date order.
- Verified: CONFIRMED. Read formatItems (L467–498): due-first, then localeCompare on subject, then date — so scheduledItems[0] is the alphabetically-first module's earliest item, not the global minimum. Traced scheduledItems = upcomingReviews.filter(!isDue) at L2157 (order preserved), nextUp at L2166, both headline usages (L2186, L2256), the Review-ahead startQuiz(scheduledItems[0]) at L2198, and the date column at L2527. The failure scenario is mathematically real whenever the soonest review belongs to a non-first module.

**IA-2 · P0 · effort:medium — Overdue does not exist as a concept anywhere in the UI — a 3-week-old overdue review is labeled 'Due today' and buried alphabetically**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2265`
- Duplicate-of/with: TY-11
- Evidence: `isDueLocal` collapses everything into one boolean: `const isDueLocal = (due, today) => startOfLocalDay(due) <= startOfLocalDay(today)` (L465). The due section is headed `{de ? "Heute fällig" : "Due today"}` (L2265) and due cards are sorted alphabetically by module before date (L487–494), with no overdue marker on the card (L2292–2350 shows only subject/topic/Level pill/snooze). The list is uncapped (dueItems.map at L2268) while Upcoming truncates at 6 (L2158). The library meta row likewise flattens to "jetzt fällig"/"due now" (L3467–3469), and the Stats forecast deliberately erases it too: "Due forecast: overdue collapses into 'today'" (StatsPanel.tsx L275–286). The Stats card copy even admits the concept exists — sub-label "incl. overdue reviews" (StatsPanel.tsx L394–395).
- Impact: For spaced repetition, overdue-ness is THE at-risk signal — the interval math the whole app sells stops working when items slip. A student returning from a sick week sees a wall of identical cards headed 'Due today', with the most-decayed item potentially last because its module starts with 'Z'. 'What should I do right now' — the dashboard's one job — is answered with a lie of omission.
- Fix: Differentiate at three levels: (1) sort due items by nextReviewDate ascending so most-overdue is first; (2) split or sub-label the section ("3 überfällig · 2 heute") and put a quiet "seit 12. Juni" line on overdue cards — the amber-thread due signal can stay, overdue only needs text, not a new color; (3) let the greeting count them: "5 Wiederholungen — 3 davon überfällig".
- Verified: CONFIRMED. Grepped the whole component tree for 'überfällig|overdue': the only hits are a StatsPanel code comment (L275) and the 'incl. overdue reviews' sub-label (L394–395) — zero user-facing overdue treatment exists. Verified isDueLocal (L465), alphabetical-first sort among due items (L487–494), the uncapped dueItems.map (L2268) vs slice(0,6) for Upcoming (L2158), the due-card contents (no date/age anywhere, L2292–2350), and the library's flattened 'due now' (L3467–3469).

**IA-3 · P0 · effort:small — Sidebar permanently advertises 'Live Tutor Pro — Coming soon' with a lock, while the Live Tutor is already shipped inside every quiz**
- Status: ✅ fixed (design-polish 2026-07-10)
- Where: `src/app/DashboardClient.tsx:2101`
- Evidence: The sidebar card: `<h3 …>Live Tutor Pro</h3><p …>{"Sprach-Tutoring neben jedem Quiz." / "Voice tutoring beside every quiz."}</p>` with `<LockClosedIcon …/> {"Demnächst" : "Coming soon"}` (L2095–2103), sitting above the account strip in permanent chrome. Meanwhile the quiz header renders a working Tutor toggle — `<Tip label="Live tutor: knows your lecture, the quiz, and your drafts"><motion.button onClick={() => setShowTutorPanel(prev => !prev)}>` (L3582–3591) — backed by the fully functional TutorPanel.tsx (streaming chat, per-module threads, TTS read-aloud via /api/tts, TutorPanel.tsx L139–175).
- Impact: The most persistent piece of chrome in the app (visible on every screen, above the account strip) actively tells users the tutor doesn't exist yet. A user who trusts the sidebar will never click the 'Tutor' button in the quiz — the app's most delightful feature is suppressed by its own advertisement. It also spends premium sidebar real estate on a dead teaser in a single-user daily tool.
- Fix: Replace the locked promo with a live pointer: same card, SparklesIcon, "Live Tutor — öffne ein Quiz und frag ihn" (or deep-link to the first due quiz with the panel open). If a genuinely unshipped 'Pro' voice tier is planned, rename the card so it doesn't claim the feature that exists ("Sprach-Tutor (Audio) — demnächst").
- Verified: CONFIRMED. Read the sidebar card (L2095–2103) and the quiz Tutor toggle (L3582–3591); verified TutorPanel.tsx really ships streaming chat plus /api/tts read-aloud (speakMessage at L139–175, fetch('/api/tts') at L149). The card's own tagline ('beside every quiz') describes exactly where the shipped tutor lives, and the app additionally ships two-way voice via the Interactive mode (L3592–3603) — so 'Coming soon + lock' misstates reality even under the most charitable 'Pro voice tier' reading. The recommendation already handles that nuance.

**IA-4 · P1 · effort:small — The dashboard's 30-day pass-rate card is a frozen SSR snapshot — it silently disagrees with the Stats tab within the same session**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:638`
- Duplicate-of/with: PP-6
- Evidence: `const passRate30 = initialPassRate30;` (L638) — a server prop passed once from page.tsx (L45) and never refetched; fetchReviews() only resyncs review items. The rail renders `{Math.round((passRate30.passed / passRate30.total) * 100)}%` (L2571). The Stats tab computes the identically-labeled figure ("Pass rate · 30d", StatsPanel.tsx L399) live from /api/stats on every visit, with a local-midnight cutoff (StatsPanel.tsx L198, L240–248, L313) while the server uses a rolling now-minus-30-days window (review-query.ts L86–94).
- Impact: Grade five reviews in an evening session, return to the dashboard: the rail still shows the pre-session percentage while Stats shows the updated one — the same metric, two values, one screen apart. For the app's only always-visible performance indicator, going stale exactly when the user is producing data is the worst failure mode; it reads as a bug the moment anyone compares tabs.
- Fix: Refresh the figure after grading: either return the two counts from /api/grade's done event and setState, or piggyback a lightweight passRate field on GET /api/reviews so fetchReviews() (already called post-grade, L1784) keeps it live. Also align the 30-day window definition (local-day cutoff) with StatsPanel so the two never disagree by an off-by-one day.
- Verified: CONFIRMED. Grepped every passRate reference: L638 is the only assignment (no setState exists — it's a plain const from the prop), rendered at L2567–2580. handleGrade's done handler (L1762–1784) only calls fetchReviews(), which resyncs items, not the pass rate. Independently verified the window mismatch: fetchPassRate30 (review-query.ts L86–94) uses rolling `new Date()` − 30d; StatsPanel uses startOfLocalDay cutoff (L198, L240).

**IA-5 · P1 · effort:small — Raw Gemini model pickers sit at equal weight beside the two most important buttons in the app (Generate and Submit)**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3981`
- Evidence: The quiz submit row pairs a full-height select with the primary action: `<select value={gradingModel} … className="btn-secondary sm:w-[200px] h-12 …"><option value="gemini-3.5-flash">3.5 Flash (Standard)</option><option value="gemini-3.1-pro-preview">3.1 Pro (Preview)</option>…` (L3981–3989) directly beside `<motion.button … className="btn-primary flex-none sm:flex-1 h-14 sm:h-12 …">Submit for grading` (L3990–3998); the same pattern repeats in the free-text quiz variant (L4063–4080) and the upload flow's Generate row (L2777–2793). Note the upload one is styled `input-dark` (L2780) while the quiz ones are `btn-secondary` — the same control in two idioms, and `generationModel`/`gradingModel` are two separate states with identical option lists.
- Impact: At the two decision moments of the whole app — 'turn my lecture into a quiz' and 'grade my exam' — the student is confronted with model-ID jargon ("3.1 Flash-Lite") occupying ~200px of the action row. It splits the row's visual weight, adds a choice 99% of runs don't need (a Standard already exists), and leaks infrastructure vocabulary into the app's most emotionally loaded interactions.
- Fix: Demote the picker behind progressive disclosure: a quiet ghost-icon/text ("3.5 Flash" caps-label) that opens a small popover, or move model choice into Settings' AI section entirely. The action rows should contain exactly one full-width primary button each.
- Verified: CONFIRMED. Read all three action rows (L3981–3998, L4063–4080, L2777–2793): selects with raw model-ID options sit inside each action row at full control height. Verified the styling split (btn-secondary in quiz vs input-dark in upload) and the duplicated generationModel/gradingModel state. The uncommitted mobile tweaks only changed button height classes (flex-none sm:flex-1 h-14 sm:h-12) — evidence quote updated; the finding is untouched by them.

**IA-6 · P1 · effort:small — Nothing at the submit moment tells the student how many tasks they've actually answered**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3993`
- Evidence: Submit enables as soon as ANY single answer exists: `disabled={isGrading || !parsedTasks.some(task => (individualAnswers[task.id] || "").trim().length > 0 || !!answerSketches[task.id])}` (L3993). The header states a static "4 tasks · 8 points · untimed" (L3573–3577), and the microcopy under the button only covers drafts and duration (L4000–4011). There is no answered/unanswered count or per-card completion marker anywhere — the task cards (L3858–3935) render number, label, question, and answer box with no filled-state indicator.
- Impact: On a long quiz (task cards can span several screens), a student who answered tasks 1–3, scrolled, and got interrupted can submit with tasks 4–6 blank — the button looks identical either way, and the grading pipeline then records a fail that costs a real SRS interval. The question-answer-submit loop lacks its closing orientation cue; world-class test UIs always show "3 of 6 answered" at the point of no return.
- Fix: Add a live tnum counter to the submit block ("3 von 6 beantwortet") and, when incomplete, make the first click surface a quiet inline notice ("2 Aufgaben sind leer — trotzdem einreichen?") in the app's existing two-step-confirm idiom rather than a modal.
- Verified: CONFIRMED. Verified the disabled expression at L3993 (any one answer enables submit). Grepped 'beantwortet|answered' across DashboardClient and useInteractiveQuiz: zero hits — no counter exists. Read the full task-card render (L3858–3935): no completion marker per card (the only CheckIcons in the quiz flow belong to the grading-progress checklist, L3730). Grading really costs an interval: handleGrade's done event updates nextReviewDate/level (L1773–1783).

**IA-7 · P1 · effort:medium — The quiz view is placeless: full app chrome persists but no nav item is active, so the app's focused mode is neither focused nor located**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3522`
- Evidence: Quiz renders as a tab (`{activeTab === "quiz" && selectedReview && (` L3522) inside <main> next to the always-on sidebar (the <aside> at L2031–2138 is unconditioned), but every nav item checks only its own tab: `activeTab === 'dashboard' ? 'nav-item-active' : 'nav-item-idle'` (L2050–2065) — "quiz" matches none, so during a quiz all four nav items sit idle. The sidebar keeps its notifications toggle, 'Coming soon' promo card and account strip fully visible/interactive; the only mode signal is the small back button (L3531–3545).
- Impact: Mid-exam, the UI's answer to 'where am I?' is: nowhere. Meanwhile the chrome invites exactly the wrong actions — one stray click on 'Library' silently leaves the exam (drafts survive, but interactive voice mode is killed, L700–702). A quiz is the app's deepest focus state, and it's the only state the shell doesn't acknowledge at all.
- Fix: Pick a direction and commit: either (a) focus mode — collapse the sidebar to a slim brand-plus-exit rail (or dim it at reduced opacity, pointer-events on hover) while activeTab === 'quiz'; or at minimum (b) keep 'Dashboard' (or 'Library' in comprehension mode) marked active so the origin stays lit, matching the back button's promise.
- Verified: CONFIRMED. Verified all five nav buttons (L2050–2068) test only their own tab string — 'quiz' matches none, so nothing is active. The sidebar aside (L2031) has no activeTab condition, so promo card, push toggle and account strip stay interactive during an exam. Verified the interactive-mode kill on tab change at L700–702 (`if (activeTab !== "quiz") stopInteractive()`), and that the back button (L3531–3545) is indeed the only mode signal.

**IA-8 · P1 · effort:small — Upload success auto-yanks the user to the dashboard after 3 seconds, breaking the batch-upload flow the screen is built for**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:1655`
- Evidence: In handleGenerate's done handler: `setTimeout(() => { setIsGenerating(false); setTopicInput(""); setSubjectInput(modulePresets[0] ?? ""); setTextInput(""); setUploadedFiles([]); if (activeTabRef.current === "upload") setActiveTab("dashboard"); }, 3000);` (L1646–1656). The destination dashboard then shows the new lecture only as one row in 'Upcoming' (first review is tomorrow, per the flow's own copy "The first review lands tomorrow", L2606).
- Impact: The realistic student session is 'upload all of today's lectures' — three to five in a row. After each ~1-minute generation, the app navigates away mid-flow, forcing sidebar → Upload → re-pick module for every lecture (the reset also snaps subjectInput back to the first preset, L1649). Worse, the auto-navigation lands on a screen where the result is nearly invisible (a single Upcoming row), so the reward moment ('your module exists now') dissolves into a generic dashboard.
- Fix: Stay on the success screen and offer the fork explicitly: keep the completed checklist visible with two buttons — primary "Nächste Vorlesung hochladen" (resets the form in place, module preselected) and secondary "Zum Dashboard". Auto-navigation on a timer is never the right ending for a 6-step pipeline the user just watched complete.
- Verified: CONFIRMED. Read the done handler (L1639–1656): 3s timer, full form reset including subjectInput → modulePresets[0], then setActiveTab('dashboard') whenever the user is still on the upload tab — i.e. the standard case. The guard only protects users who ALREADY navigated away; the batch-upload flow break is real. Verified the success/progress checklist screen exists (L2609–2661) and that it has no 'upload another' affordance.

**IA-9 · P1 · effort:small — Library lecture rows encode the same level twice, side by side (7-dot strip AND 'L4' label), inflating an already signal-dense row**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3152`
- Evidence: Each collapsed row renders the dot strip `{item.generatedLevels.map((generated, l) => (<div className={… l < item.currentLevel ? "bg-amber-500" : l === item.currentLevel ? "bg-(--accent-border) shadow-…" : "bg-(--line-soft)"} />))}` (L3137–3151) immediately followed by `<span …>L{item.currentLevel + 1}</span>` (L3152–3154) — two encodings of currentLevel, adjacent. The row already carries: doc icon, title, comprehension % (green/red), Due badge, ×N attempt marker, chevron (L3109–3167), and the expanded detail repeats the level a third time as the full interval stepper (L3212–3257).
- Impact: Per-row signal load is the difference between a scannable library and a dashboard-per-row. Six-plus signals with a redundant pair means the eye can't establish a column rhythm; the genuinely scarce signals (Due badge, red comprehension %) lose contrast against decorative ones. The amber-filled dots also spend hardcoded amber-500 on non-due information, diluting the 'amber = due now' rule the Due badge next to them relies on.
- Fix: Keep exactly one level encoding in the collapsed row — the compact 'L4' text (the dots' extra info, generated-vs-pending, is only meaningful in the expanded stepper anyway). Reserve the dot strip for the expanded view, and consider neutral ink dots there so amber stays a due-signal.
- Verified: CONFIRMED. Read the collapsed row (L3100–3168): dot strip (hidden below sm) at L3137–3151 and the L{n} text at L3152–3154 are literally adjacent siblings, both driven by currentLevel; counted the row's other signals (icon, title, comprehension %, Due badge/dot, ×N marker, chevron). Verified the expanded stepper re-encodes it a third time (L3212–3257) and that the dots use hardcoded bg-amber-500 (not the accent token), so they stay amber even under non-amber accents — worse for the 'amber = due' contract than the finding claims.

**IA-10 · P1 · effort:small — Stats' 'Pass rate by module' is sorted by review volume and silently truncated to 8 — the chart cannot answer the question its title asks**
- Status: ⏳ open
- Where: `src/app/components/StatsPanel.tsx:273`
- Evidence: `.sort((a, b) => b.reviews - a.reviews || b.items - a.items)` (L273) orders modules by review count, and `computed.modules.slice(0, 8).map(…)` (L545) drops the rest with no 'show more' affordance. The bars themselves are risk-colored (`passRate >= 80 ? grade-pass-accent : >= 50 ? grade-mid : grade-fail-accent`, L563) under the heading "Pass rate by module" (L539).
- Impact: The one chart that should answer 'what's at risk?' buries it: a struggling module with few reviews (which is exactly what struggling looks like — avoidance) sorts to the bottom and can fall off the top-8 cliff entirely, invisible with no indication anything was cut. The red/amber/green encoding shows risk only for whichever modules happen to be most-reviewed — an inverted hierarchy for a study-health panel.
- Fix: Sort ascending by pass rate (riskiest first) or add a small 'Sorted by reviews · sort by risk' toggle; always render a '+N weitere Module' expander instead of a silent slice. A one-line callout for the worst module ("Biochemie braucht dich: 42 %") would turn the panel from reporting into guidance.
- Verified: CONFIRMED. Verified the sort at L273 (reviews desc, then items desc — pass rate plays no role), the silent slice(0,8) at L545 with no expander or '+N more' anywhere in the card (L537–574), and the risk-color ternary at L563. The 'avoidance sorts to the bottom' failure mode follows directly from the code.

**IA-11 · P1 · effort:small — Past videos (Video-Archiv) are only reachable from a due card's footer — once the item isn't due, the archive vanishes from the entire app**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3390`
- Evidence: The archive entry point exists solely inside dueItems.map: `{archiveVideos.length > 0 && (<button onClick={() => setArchiveModalData(archiveVideos)} …>{de ? \`Video-Archiv (${archiveVideos.length})\` : …}` (L2381–2390). The library's Study Materials section resolves only the newest one: `const vurl = latestVideoUrlOf(item.videoUrl); return vurl ? (<a href={vurl} …>Video</a>) : …` (L3389–3407) — latestVideoUrlOf explicitly returns just the last history entry (L443–457). Upcoming rows have no footer at all (L2514–2530).
- Impact: Content reachability depends on schedule state: the day after you pass a review, its older level videos become unreachable until the item comes due again weeks later. The library claims to be the permanent home but holds less than the transient dashboard card — an IA inversion. Students revising before an exam (the classic library use case) can't reach precisely the recap videos made for earlier levels.
- Fix: Add the same 'Video-Archiv (N)' chip to the library item's Lernmaterialien row whenever videoHistory.length > 1, reusing the existing archive modal. The dashboard footer link can stay as a convenience.
- Verified: CONFIRMED. Grepped every setArchiveModalData call site: the only opener is L2383, inside the due-card footer within dueItems.map. Verified latestVideoUrlOf (L444–457) returns only arr[arr.length-1].url, and the library chip row (L3389–3407) uses exactly that — older history entries are unreachable outside a due card. Upcoming rows (L2514–2530) carry no materials footer.

**IA-12 · P1 · effort:small — Push notifications live as a toggle in the nav list and are absent from Settings — the one place its scope line promises to cover the app's preferences**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2074`
- Duplicate-of/with: IS-12
- Evidence: The sidebar renders a stateful toggle styled as a nav item: `<button onClick={togglePush} className="flex items-center gap-3 h-[38px] px-3 cursor-pointer nav-item-idle">…<span className="w-7 h-[17px] rounded-full …">` (L2074–2093) — the only element in the nav idiom that doesn't navigate. The settings modal's own subtitle enumerates its scope: "Semester, modules, language, and voice." (L4451–4452) — notifications are missing from the modal entirely (its sections: appearance, semester, presets, language, dictation, AI connection, PDF delivery, danger zone), while far rarer knobs (proxy mode, PDF transport) get full sections.
- Impact: Set-once preferences in permanent chrome is backwards prioritization: every screen, every day, carries a control most users touch once — while its natural home (Settings) doesn't mention it, so a user hunting for 'why am I not getting reminders' opens Settings and finds proxy plumbing instead. Mixing a toggle into a list of navigation-styled buttons also breaks the nav's interaction grammar.
- Fix: Move notifications into the Settings modal as a proper section (with the iOS home-screen guidance that currently only appears as an error toast, L814–818). If an ambient status is still wanted, a quiet bell glyph next to the account strip suffices — status, not control.
- Verified: CONFIRMED. Read the toggle (L2074–2093): it uses the same h-[38px] px-3 nav-item-idle recipe as the nav buttons but flips state in place. Read the entire settings modal (L4431–4892): eight sections, none about notifications; subtitle at L4451–4452 as quoted. Verified the iOS add-to-home-screen guidance exists only as an error toast inside subscribeToPush (L814–818).

**IA-13 · P1 · effort:medium — Settings modal mixes developer infrastructure ('AI connection' proxy modes, 'Proxy: PDF delivery' base64-vs-File-API) at equal hierarchy with Language — 8 flat sections strain the modal format**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:4724`
- Evidence: Between the student-facing Language and dictation sections and the danger zone sit two ops sections: "AI connection" with segmented 'Proxy for all / Generation only / Fallback only' (L4724–4808) and "Proxy: PDF delivery" whose explainer reads like a README: "Inline embeds PDFs as base64 in the proxy request itself (reliable up to ~14 MB, independent of the proxy account). File upload pushes the file once through the upload proxy and references it…" (L4810–4815). The modal totals 8 sections (appearance, semester, presets, language, dictation, AI connection, PDF delivery, danger zone) in one max-w-[560px] scroll (L4443).
- Impact: Every visit to change the language or add a module preset scrolls past Cloud-Run plumbing vocabulary ('proxy account', 'base64'). Visual hierarchy is flat — caps-label headers give 'Language' and 'Proxy: PDF delivery' identical rank, so nothing tells a student which half of the modal is for them. At 8 sections the modal has outgrown the pattern the rest of the app uses modals for (single-purpose sheets).
- Fix: Wrap the two proxy sections (and arguably the model defaults from the action rows) in a collapsed 'Erweitert / Advanced' accordion at the bottom, defaulting closed — the app already has the accordion primitive and motion. If Settings keeps growing, promote it to a real tab with a left index instead of a modal.
- Verified: CONFIRMED. Read the full modal (L4431–4892) and counted the eight sections; all headers use the identical caps-label class (e.g. L4643 'Language' vs L4811 'Proxy: PDF delivery'), so rank is flat as claimed. The base64/File-API explainer quote at L4812–4815 is verbatim. Panel width/scroll at L4443 as cited.

**IA-14 · P2 · effort:small — Calendar sync's only entry point is conditionally rendered inside the 'Upcoming' section — with no scheduled items the feature is unreachable**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2500`
- Evidence: The sole trigger for setShowCalendarModal(true) lives inside `{!isLoadingReviews && scheduledItems.length > 0 && (<div className="mt-10">…<button onClick={() => setShowCalendarModal(true)} …>Sync to calendar</button>` (L2500–2511). No entry exists in Settings, the sidebar, or the library.
- Impact: The placement is contextually smart when the section exists, but the feature's availability is an accident of schedule state: a brand-new user (1 lecture, due today) or a caught-up user whose every item is due right now has literally no path to calendar sync — and a user who remembers 'I set that up somewhere' can't find it again to unsubscribe or re-copy the URL.
- Fix: Keep the contextual link, and add a stable secondary home — a 'Kalender' row in the Settings modal (it already owns tokens/URLs conceptually). Feature access shouldn't be gated by data state.
- Verified: CONFIRMED. Grepped all setShowCalendarModal call sites: the only `(true)` opener is L2505, inside the `scheduledItems.length > 0` guard at L2500 (all other references are closers/effects). Read the settings modal and sidebar in full — no other entry point exists. The login page even advertises 'mit Kalender-Sync' (LoginClient L91), sharpening the findability gap.

**IA-15 · P2 · effort:small — 'Upcoming' rows silently start a consequential early review on click — an informational-looking list row and a 'begin exam' action share one affordance**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:2519`
- Evidence: Each scheduled row is fully clickable: `<div onClick={() => startQuiz(review)} className="grid grid-cols-[1fr_auto_auto] … cursor-pointer hover:bg-(--paper-hover)">` (L2517–2521), with no chevron, no button, no 'start early' hint — visually it's a read-only schedule row (title, subject, Level, date). Grading an early-started item moves its real SRS schedule (handleGrade done → nextReviewDate/currentLevel from the server, L1773–1783).
- Impact: A student scanning their week can tap a row expecting detail (materials, feedback — which live only in the library) and instead find themselves inside a quiz whose completion will rewrite the interval the row just displayed. The due cards earn their whole-card click with a chevron and elevated styling; these rows promise nothing and deliver the app's heaviest action.
- Fix: Either add the same trailing chevron + a hover-revealed 'Vorarbeiten' micro-label so the action is legible, or make row-click expand a small detail (materials/feedback links) with an explicit 'Jetzt vorarbeiten' button — matching the deliberateness the header's 'Review ahead' button already has.
- Verified: CONFIRMED. Read the row markup (L2517–2528): three columns (title/subject, Level, date), no chevron or action affordance, whole row wired to startQuiz. Contrasted with due cards which carry a ChevronRightIcon (L2349) and elevated card styling. Verified grading really reschedules via the done payload (L1773–1783) and 'Zeitplan aktualisiert' copy (L1766).

**IA-16 · P2 · effort:small — The library's student-facing 'Tutor-Brief' chip opens a page titled 'Tutor Prompt' with raw-system-prompt framing and a pass-green level badge**
- Status: ⏳ open
- Where: `src/app/tutor/[id]/page.tsx:47`
- Duplicate-of/with: CC-12
- Evidence: Library chip label: "Tutor-Brief" / "Tutor brief" (DashboardClient.tsx L3345–3355). The destination page heads itself `Tutor <em …>Prompt</em>` (L46–48, with hardcoded text-amber-600 that ignores the accent token), metadata describes it as "KI-Tutor Systemprompt" (L28), the footer prints a raw DB id — `ID: {item.id}` (L94) — and the level badge borrows verdict colors: `border-(--grade-pass-border) bg-(--grade-pass-wash) … text-(--grade-pass-text)">Level {item.currentLevel + 1}` (L73–75). The page is also hardcoded German ("← Zurück" L57, "Erstellt am…" L93, de-DE locale) regardless of the app's language setting.
- Impact: The naming flips mid-journey (Brief → Prompt), reframing a study companion artifact as developer plumbing; the raw ID footer reinforces that. Sage-green is contractually reserved for pass verdicts — the settings copy itself promises "Passed stays sage, repeat stays clay" (DashboardClient.tsx L4565) — so a green pill around 'Level 3' reads as 'passed' when it's just position. English-language users get a German page from an English library.
- Fix: Rename the page to match the chip ('Tutor-Brief'), use the neutral badge-level styling for the level pill, drop or de-emphasize the raw ID, and thread the user's language through (the link already comes from a language-aware context).
- Verified: CONFIRMED. Read the whole tutor page: heading L46–48, 'KI-Tutor Systemprompt' metadata L28, grade-pass-tokened Level badge L73–75, raw `ID: {item.id}` footer L94, and German-only strings with de-DE date formatting (L57, L92–95) — no language prop reaches the page. Verified the chip label mismatch (DashboardClient L3353) and the 'Passed stays sage, repeat stays clay' contract in settings copy (L4565).

**IA-17 · P2 · effort:small — A debugging tool ('Prompts' viewer) is presented as a peer chip among student study materials**
- Status: ⏳ open
- Where: `src/app/DashboardClient.tsx:3422`
- Evidence: Inside the library's 'Lernmaterialien' chip row, alongside Original-PDF / Tutor-Brief / Audio / Video: `<button onClick={() => setPromptsModal({…})} className="chip cursor-pointer">…Prompts</button>` (L3408–3424). The modal it opens admits its own audience: `{language === "german" ? "Zum Debuggen — öffnet den Prompt-Viewer." : "For debugging — opens the prompt viewer."}` (L4939–4941), and the code comment calls it "a lecture's debug prompts" (L4897).
- Impact: Study Materials is the library's curated shelf; a chip that the app itself labels 'for debugging' sits at identical visual rank to the lecture PDF. Every scan of the shelf pays a small comprehension tax ('what's a Prompt? do I need it before the exam?'), and it's the only chip whose content is about the app rather than the subject.
- Fix: Demote it out of the chip row — e.g. a tiny ghost-icon (CodeBracket) at the far right of the expanded item's meta row, or gate it behind the same allowlist mechanism as scribbleEnabled. Debug affordances should be findable by the owner, invisible to the student mindset.
- Verified: CONFIRMED. Verified the Prompts button renders with the same `chip` class as the PDF/Audio/Video materials chips in the same flex row (L3408–3424), and that the destination modal self-describes as a debugging tool at L4939–4941 ('Zum Debuggen — öffnet den Prompt-Viewer' / 'For debugging — opens the prompt viewer'), plus the 'debug prompts' code comment at L4897.

**IA-18 · P2 · effort:small — The login page ignores the app's bilingual IA — hardcoded German copy with a stray English tagline in the footer**
- Status: ⏳ open
- Where: `src/app/login/LoginClient.tsx:160`
- Evidence: All auth copy is German-only: ERROR_MESSAGES (L14–21), "Lerne weniger. Behalte mehr." (L75–78), "Willkommen zurück" (L108), "Mit Google anmelden" (L136) — no language prop or navigator.language branch exists in the component. Then the footer switches languages: `© {new Date().getFullYear()} SRS Master · Built for serious students` (L160).
- Impact: The first-time-user path starts at the only screen that ignores the language system the rest of the app is scrupulous about (every other string in the codebase is de/en paired). An English-preference user is onboarded in German; and for everyone, the German page ends on an English marketing line — a small tonal seam on the app's front door, exactly where craft impressions form.
- Fix: Since the user's stored preference isn't known pre-auth, key off navigator.language (de* → German, else English) for the login copy set, and make the footer tagline follow it ('Für ernsthafte Studierende gebaut'). It's one string table away from the standard the rest of the app already holds.
- Verified: CONFIRMED. Read LoginClient.tsx end to end (165 lines): every user-facing string is German with no language switching mechanism (no prop, no navigator.language, no locale detection), while the footer at L160 is English. Contrasted with DashboardClient/StatsPanel/TutorPanel where every string is de/en paired — the login page is genuinely the one exception.
