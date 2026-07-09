# Design Deep Dive — "Paper & Ember" perfection campaign

**Started:** 2026-07-09 ~19:30 CEST · **Owner:** Claude (multi-session campaign)
**Goal:** Jony-Ive-level design perfection across the entire SRS Master app — shadows, motion, typography, spacing, states, feel.

## Campaign status

| Phase | Status |
|---|---|
| Live browser inspection (both themes, desktop + mobile, all tabs) | ✅ done — findings below |
| Agent review: typography, color-contrast, elevation-shadows, motion, interaction-states, layout-spacing, a11y | ✅ done — 119 findings below (UNVERIFIED) |
| Agent review: empty-loading-error, microcopy-i18n, mobile-touch, perceived-performance, hierarchy-ia | ⏳ pending — killed by session limit (resets 01:00), scheduled 01:15 |
| Adversarial verify pass over all findings | ⏳ pending — scheduled 01:15 |
| Implementation | ⏳ scheduled 02:15 |

## Session setup notes (for continuation sessions)

- Dev server: `.claude/launch.json` config **srs-dev** runs `env NEXTAUTH_SECRET= npm run dev` on port 3000 — blanking NEXTAUTH_SECRET makes the middleware fail open in dev.
- **TEMP auth bypass** in `src/app/page.tsx` (marked `TEMP design-review bypass`): skips the `getServerSession` redirect when NEXTAUTH_SECRET is empty in dev. Inert in production. **Revert before shipping.**
- DATABASE_URL points at the real remote Turso DB — keep interactions read-only (no quiz submits, no deletes, no snoozes).
- The app is bilingual (currently German); appearance API: `window.__srsAppearance.set({mode:'ink'|'paper', accent:'amber'|'slate'|'eucalyptus'|'heather'|'graphite'})`.
- `main` received a small (mostly backend) merge — `git pull` + re-check cited line numbers before editing.

## Live-inspection findings (observed in the running app, 2026-07-09)

**LIVE-1 · HIGH — Tab switches preserve the previous tab's scroll position.**
All tabs share one scroll container (`.app-shell-main`). Clicking "Dashboard" while Stats is scrolled to 561px lands the dashboard mid-list — greeting and primary CTA hidden. Reproduced. Fix: scroll the container to top on `activeTab` change (respecting reduced motion; instant jump is fine).

**LIVE-2 · HIGH — German compound words break mid-word without hyphens in headings.**
With the Tutor drawer open, the quiz title renders "Ventrikelsyste / m & Liquor". `overflow-wrap: break-word` on headings (globals.css §base) breaks arbitrary points. Fix: `hyphens: auto` + correct `lang` attribute (de) so compounds hyphenate ("Ventrikel-system"), or `text-wrap: balance` + narrower title constraints before break-word ever fires.

**LIVE-3 · MEDIUM — Keyboard hints render on touch devices.**
The primary CTA shows a `↵` kbd chip and the tutor footer shows "↵ senden · ⇧↵ neue Zeile" on a 375px phone viewport — hardware-keyboard hints where no keyboard exists. Fix: hide `.kbd` hints under `@media (pointer: coarse)` / `(hover: none)`.

**LIVE-4 · MEDIUM — Eucalyptus accent collides with the sage "pass" semantic.**
Accent eucalyptus (`--a-g2` #619f88) and grade-pass sage (#5e7d58) are near-identical greens. Settings copy promises "Noten behalten ihre Farben in jedem Theme" — but with eucalyptus selected, "accent = attention" and "green = passed" become indistinguishable (CTA, level dots, threads vs pass bars). Fix: either re-tune eucalyptus toward teal/mint distance from sage, or shift grade-pass hue when eucalyptus is active.

**LIVE-5 · MEDIUM — Mobile nav is a full-screen hamburger for only 5 destinations.**
Top-right hamburger (worst thumb reach), full takeover with ~50% dead space, "Live Tutor Pro · Demnächst" teaser occupying the prime bottom thumb zone. A persistent bottom tab bar (Dashboard/Upload/Bibliothek/Statistik/Einstellungen) would remove a full tap+screen-swap from every navigation and match PWA expectations.

**LIVE-6 · MEDIUM — Due-card titles truncate on mobile.**
"Neuroanatomische Bildgeb…" — single-line ellipsis on the one piece of text the student must read. Two-line clamp (`line-clamp-2`) would fit the card comfortably.

**LIVE-7 · MEDIUM — Disabled primary buttons read as half-enabled.**
`.btn-primary:disabled` keeps the full amber gradient at 0.55 opacity ("Erstelle mein Quiz-Set", "Zur Bewertung einreichen" when empty). At a glance it reads pressable-but-broken rather than waiting-for-input. Consider a neutral paper-2 fill + ink-400 text for disabled, reserving amber strictly for "ready".

**LIVE-8 · LOW — Accent leak: "Verwalten" link in the upload form.**
The module-preset "Verwalten" affordance renders in accent color next to the MODUL label — a tertiary management action wearing the primary color, against the stated accent discipline (brand · primary action · due-now · pass).

**LIVE-9 · LOW — Settings modal mixes poetry with proxy plumbing.**
"Sanft um 23 Uhr" sits three sections above "Inline schickt PDFs als Base64 direkt in der Proxy-Anfrage mit (~14 MB…)". KI-Verbindung / PDF-Übertragung / Diktat-Engine belong behind an "Erweitert" disclosure; the top level should stay theme/accent/semester/language.

**LIVE-10 · LOW — Zero-streak is presented as a failure stat.**
Stats leads with "Tage-Streak: 0 — Tage in Folge gelernt" as the first card. A zero-state deserves a designed moment ("Heute zählt: 6 Wiederholungen warten") rather than a demotivating zero.

**LIVE-11 · LOW — Login footer tagline is English on a German page.**
"© 2026 SRS Master · Built for serious students" under a fully German login. If intentional brand voice, fine — otherwise localize ("Für ernsthafte Studierende gebaut").

**LIVE-12 · NOTE — Verified good:** login composition at 1280–1440px is properly centered (earlier corner-render was a preview-emulation artifact, not app CSS); ink theme hierarchy holds; settings theme-preview cards and accent copy are a delight; quiz microcopy ("Die Bewertung dauert etwa eine Minute. Dein Entwurf ist auf diesem Gerät gespeichert.") is excellent.

---

## Agent findings — 7 of 12 dimensions complete (119 findings, UNVERIFIED)

> Status: first-pass reviewer output. The adversarial verify pass did not run (session limit). Treat each finding as a strong lead, not confirmed fact — re-check the cited code before implementing.


### Typography & vertical rhythm (15)

**TY-1 · HIGH · effort:small — Passed-level stepper labels use non-existent token `text-ink-500` — renders full-strength ink-900 and inverts the hierarchy**
- Where: `src/app/DashboardClient.tsx:3241`
- Evidence: `<span className={\`w-7 text-center text-[9px] leading-none ${current ? "text-(--accent-text-strong) font-semibold" : passed ? "text-ink-500 font-medium" : "text-ink-300 font-medium"}\`}>` — but the @theme block in globals.css (lines 31–34) defines ONLY `--color-ink-900/600/400/300`. There is no `--color-ink-500`, so Tailwind v4 generates no CSS for `text-ink-500`; the class is emitted but dead.
- Impact: In the library's interval stepper (T1…T365), the labels for PASSED levels inherit body color (`--foreground` = ink-900) — the darkest text on the card — while the CURRENT level's label is a mid-strength accent and locked levels are faint ink-300. The visual hierarchy is inverted: history shouts, the active step whispers. In the ink theme, passed labels glow brightest cream. This both looks wrong and violates the app's own token discipline.
- Fix: Replace `text-ink-500` with an existing ramp token — `text-ink-600` reads correctly (quieter than current, stronger than locked ink-300). If a true mid-step is wanted, add `--color-ink-500: var(--ink-500)` plus paper/ink values to globals.css.

**TY-2 · HIGH · effort:medium — Type scale has fragmented into ~30 distinct sizes, including half-pixel steps and singletons that duplicate existing tokens**
- Where: `src/app/DashboardClient.tsx:3644`
- Evidence: Repo-wide tally of arbitrary sizes: text-[13px]×21, [11px]×19, [15px]×15, [10px]×14, [9px]×9, [12.5px]×8, [13.5px]×5, [11.5px]×4, [14.5px]×3, [10.5px]×2, [9.5px]×1, [12px]×1, [17px]×1, [21px]×1, [26px]×1, [27px]×3, [31px]×1 … alongside text-xs(48×)/text-sm(51×)/text-base/lg/xl/2xl/4xl. Line 3644: `<span className="text-[12px] font-bold …">` — a literal duplicate of `text-xs`. Neighbouring drift: `text-[13px]` (18×) vs `text-[13.5px]` (2×) vs `text-sm`, `text-[14.5px]` vs `text-sm`, quiz h1 at the oddball 27/31px vs the 22/26/34/40/44 display steps.
- Impact: Roughly 30 distinct font sizes across one app — no world-class type system has more than ~12. The half-pixel steps (12.5/13.5/14.5/11.5/10.5/9.5) rasterize inconsistently on 1× displays and make near-identical text sit at subtly different sizes side by side (e.g. footer links at 13px next to 12.5px controls in the library toolbar). The rhythm reads slightly 'off' everywhere without an obvious cause — the classic symptom of scale drift.
- Fix: Consolidate to a declared scale (e.g. 9, 10, 11, 12(xs), 13, 14(sm), 15, 16(base), 22, 27, 34, 40/44, 54) as @theme font-size tokens; delete the half-pixel sizes (12.5→13 or 12, 13.5→13 or 14, 14.5→14, 11.5→11, 10.5→10 or 11, 9.5→9or10) and replace `text-[12px]`→`text-xs`. One mechanical sweep, big perceived-quality payoff.

**TY-3 · MEDIUM · effort:small — Modal titles drift across the five peer modals: 20px/weight-500 vs 24px/weight-480 vs 16px display vs 15px sans-semibold**
- Where: `src/app/DashboardClient.tsx:4118`
- Evidence: Archive modal: `font-display text-xl font-medium` (L4118); Feedback modal: `font-display text-xl font-medium` (L4172); Calendar modal: `font-display text-2xl … style={{ fontWeight: 480 }}` (L4334); Settings modal: `font-display text-2xl … fontWeight: 480` (L4448); Prompt viewer: `font-display text-base font-medium` (L5021); Prompts list & comprehension viewer: `text-[15px] font-semibold` in Inter (L4916, L4965).
- Impact: Structurally identical surfaces (card-glass modals at the same z-level) carry four different title treatments. `font-medium` (500) on Fraunces is also visibly heavier than the system's tuned 470–480 display weights, so the Archive/Feedback titles look bolder AND smaller than Settings/Calendar — the app feels stitched together when moving between modals.
- Fix: Pick one modal-title spec — e.g. `font-display text-xl tracking-[-0.015em]` at weight 480 — and apply it to all six headers. Keep the caps-label sub-headers as the second level. If the small utility modals (prompts list) intentionally stay sans, document that as a second, deliberate tier.

**TY-4 · MEDIUM · effort:small — Percent formatting is inconsistent: "82 %" (space) and "82%" (no space) coexist, and neither respects the active language's convention**
- Where: `src/app/DashboardClient.tsx:3121`
- Evidence: Space before %: L3041 `Ø {avg} %`, L3121/L3306/L4972 `{Math.round(item.comprehensionScore)} %`, L3447 `≈ {summary.mastery} %`, L3773 `${Math.round(…)} %` (result headline). No space: L2571 dashboard right-rail `{Math.round((passRate30.passed/…)*100)}%`, StatsPanel L551 `\`${mod.passRate}%\`` and the stat-card suffix `%` (L474). Both variants render in BOTH languages.
- Impact: The same class of number (a pass/comprehension percentage) is typeset two different ways depending on which screen you're on — dashboard says "82%", library says "82 %". German convention (DIN 5008) wants a (narrow) space before %, English wants none; the app currently applies each style to both languages at random.
- Fix: Centralize in a `fmtPercent(value, language)` helper: German → `82 %` (narrow no-break space), English → `82%`. Replace all eight call sites.

**TY-5 · MEDIUM · effort:medium — `<html lang="en">` is hardcoded while the default UI is German, and long German compounds break without hyphens**
- Where: `src/app/layout.tsx:54`
- Evidence: layout.tsx L53–54: `<html lang="en" …>` — never updated even though `initialLanguage` defaults to "german" and the entire login page is German-only. globals.css L322–325 handles overflow with `p, span, a, h1…div { overflow-wrap: break-word; }` but no `hyphens: auto` anywhere.
- Impact: On narrow screens, compounds like "Entwicklungspsychologie" or "Modul-Voreinstellungen" snap mid-word with no hyphen (break-word breaks at arbitrary characters) — visibly cheap for a bilingual app that otherwise sweats `text-wrap: balance/pretty`. Wrong `lang` also blocks correct hyphenation dictionaries and screen-reader pronunciation, and `text-wrap` heuristics.
- Fix: Set `lang` from the server-read language (the server component already reads it for `initialLanguage`; pass it into RootLayout or set it in DashboardClient via `document.documentElement.lang`). Then add `hyphens: auto` to running-copy contexts (p, the feedback brief, card descriptions) so German compounds break with a hyphen instead of a hard snap.

**TY-6 · MEDIUM · effort:small — Body text color drifts between the ink ramp and ad-hoc alpha inks (ink-900/80, /85) — two nearly-identical secondary grays coexist**
- Where: `src/app/DashboardClient.tsx:405`
- Evidence: FeedbackBody: `text-[14.5px] leading-[1.7] text-ink-900/80` (L405); free-quiz text: `text-ink-900/80` (L4016); prompt viewer pre: `text-ink-900/80` (L5046); TutorPanel model text: `text-ink-900/85` (L392); tutor page: `text-ink-900/85` (page.tsx L80); library lecture row: `text-ink-900/80` (L3111). Meanwhile the design system defines a four-step ink ramp (`--ink-900/600/400/300`, globals.css L74–77) precisely for this.
- Impact: ink-900@80% over paper-1 produces a gray that is close to — but not — any ramp step, and its hue shifts with whatever surface sits beneath (paper-0 vs paper-1 vs paper-hover). Reading surfaces (feedback brief, quiz text, tutor chat) each get a subtly different 'secondary ink', which a trained eye registers as muddiness, and /80 vs /85 is pure drift between sibling components.
- Fix: Add one token for long-form reading ink (e.g. `--ink-700` tuned per theme) and use it for FeedbackBody, quiz body, tutor chat, and the tutor page; reserve ink-600 for captions. Kill the /80 and /85 alphas.

**TY-7 · MEDIUM · effort:small — Tabular-numeral coverage is incomplete and split across two mechanisms (.tnum vs Tailwind tabular-nums)**
- Where: `src/app/DashboardClient.tsx:4250`
- Evidence: DashboardClient uses the custom `.tnum` class 15×; StatsPanel uses Tailwind's `tabular-nums` 5× (e.g. L468, L550, L585) — two spellings of the same intent. Coverage gaps in genuinely columnar numbers: review-history rows `{new Date(entry.completedAt).toLocaleDateString(…)} … toLocaleTimeString(…)` (L4250–4253, a stacked column of dates+times, no tnum); library module meta `{lectures.length} Vorlesungen` (L3046) and semester header counts (L2976), both right-aligned columns across rows; comprehension dates (L3309, L4976); the `L{item.currentLevel + 1}` column (`w-8 text-right`, L3152).
- Impact: In the feedback-history list, dates and HH:MM timestamps wobble in width row-to-row (proportional 1s vs 8s), so the column edge shimmers; the library's right-edge counts do the same. Meanwhile the design system explicitly promises "Tabular numerals wherever dates/stats align in columns" (globals.css L388).
- Fix: Add `tnum` to the history date/time spans, library counts, comprehension dates, and the L-number column. Standardize on the `.tnum` utility (it also sets font-feature-settings) and replace StatsPanel's `tabular-nums` for one grep-able convention.

**TY-8 · MEDIUM · effort:small — Micro caps badges drift across three sizes and two trackings: 9px vs 9.5px vs 10px, 0.12em vs 0.08em**
- Where: `src/app/DashboardClient.tsx:2970`
- Evidence: Library 'Aktiv' badge: `text-[9.5px] uppercase tracking-[0.12em] … style={{ fontWeight: 700 }}` (L2970); due badges: `text-[9px] font-bold uppercase tracking-[0.12em]` (L3023, L3131); PASS/REPEAT pills: `text-[9px] font-bold uppercase tracking-[0.12em]` (L3302, L3442, L4243, L4967); Mastery badge: `text-[10px] font-bold uppercase tracking-[0.08em]` (L3199); history Level pill: `text-[10px] font-semibold` non-caps (L4246).
- Impact: These pills frequently sit in the SAME row (library module header can show 'Aktiv' 9.5px next to a due badge 9px; the expanded item shows Mastery 10px/0.08em above PASS 9px/0.12em). At these sizes a half-pixel and 0.04em of tracking are visible — the badges look like cousins rather than one component.
- Fix: Define one `.badge-caps` primitive (suggest 9.5px, weight 700, tracking 0.12em, px-2 py-0.5 rounded-full) and derive all status pills from it; only colors vary. Delete the inline fontWeight 700 in favour of `font-bold`.

**TY-9 · MEDIUM · effort:small — 8px chart labels in the stats heatmap sit below any legible floor of the scale**
- Where: `src/app/components/StatsPanel.tsx:496`
- Evidence: Weekday gutter: `<div className="flex flex-col gap-1 pr-1.5 text-[8px] text-ink-300">` (L496) and month labels `text-[8px] text-ink-400` (L514). The library stepper's repeat markers also use `text-[8px]` (DashboardClient L3246). The app's own smallest declared treatment is the 11px caps-label; nothing else goes below 9px.
- Impact: 8px ink-300 on paper-0 is under the practical legibility floor (GitHub's equivalent heatmap gutter is ~10px); on a 13px cell grid there is room for 9–10px. Users squint at 'Mo/Do/So' and month names — the one place in the app where type is genuinely hard to read.
- Fix: Raise the heatmap gutter and month labels to 9.5–10px (`text-[10px]`) and bump the axis color to ink-400. The 13px cells and 4px gaps absorb this without layout change. Raise the ×N repeat markers to 9px to match the stepper's T-labels.

**TY-10 · LOW · effort:small — `.eyebrow` and `.caps-label` are duplicate tokens, and the caps treatment's tracking drifts per call site (0.10–0.14em)**
- Where: `src/app/globals.css:462`
- Evidence: globals.css L462–478 defines `.eyebrow` and `.caps-label` with byte-identical rules (11px / 650 / uppercase / 0.11em / ink-400). `.eyebrow` is used exactly once (DashboardClient L5020); everything else uses `.caps-label` — then overrides it: `tracking-[0.14em]` on page eyebrows (L2174, L2602, L2817, L3508), `tracking-[0.1em]` in stat cards (StatsPanel L465), `tracking-[0.13em]` on login (L108), `!text-[10.5px] !tracking-[0.12em]` in TutorPanel (L373), `!text-ink-600` in four brief headers.
- Impact: Five different letter-spacings for one nominal treatment, plus a dead duplicate class — the definition of design-token erosion. The 0.14em page eyebrows vs 0.11em card labels may be intentional hierarchy, but nothing encodes that intent, so drift keeps compounding.
- Fix: Delete `.eyebrow` (retarget its one use). If page-level eyebrows should be wider-tracked, add a `caps-label-page { letter-spacing: 0.14em }` variant to globals.css and remove the ad-hoc tracking overrides; normalize the rest back to the 0.11em token.

**TY-11 · LOW · effort:small — Section-header semantics and sizes disagree across tabs and modals (h2 16px vs h4 14px for the same role; modal titles h2 vs h3)**
- Where: `src/app/DashboardClient.tsx:2265`
- Evidence: Dashboard section headers are `<h2 className="text-base …" style={{ fontWeight: 650 }}>` (L2265, L2503); the visually identical StatsPanel section headers are `<h4 className="text-sm …" fontWeight 650>` (StatsPanel L488, L538, L578, L624). Calendar modal's title is an `<h2>` (L4334) while Settings' is `<h3>` (L4448); the feedback modal has two sibling `<h3>`s — title (L4172) and the caps label (L4188).
- Impact: The same hierarchical role renders at 16px on the dashboard but 14px on stats — a level of drift you feel when tab-switching. The heading-level soup (h1→h3 skips, h2/h3 for peer modals) also degrades the screen-reader outline for no benefit.
- Fix: Standardize card/section headers to one spec (suggest text-[15px] or text-base, weight 650) and one element per role: h2 for in-page sections, h3 for card headers, h2 for all modal titles. Convert the feedback modal's caps label to a `<p>` like everywhere else.

**TY-12 · LOW · effort:small — Orphan font-weight 570 on the 'Upcoming' row title — a one-off between the system's 550 and 600**
- Where: `src/app/DashboardClient.tsx:2523`
- Evidence: `<div className="text-sm tracking-[-0.008em] text-ink-900 truncate" style={{ fontWeight: 570 }}>{review.topic}</div>` — repo-wide inline-weight tally: 550×14, 650×9, 470×9, 480×6, 560×3, 520×2, 700×1, 570×1, 460×1. 570 appears exactly once; every comparable list-row title uses 550 (scheduled meta, links) or font-semibold 600 (due-card titles, library lecture titles at L3013).
- Impact: The upcoming-list topic renders at a weight that exists nowhere else — 20 units off its siblings. Individually invisible, but it's exactly the kind of unmanaged micro-drift the inline-style weights invite (there is no utility for the intermediate weights, so each call site re-guesses).
- Fix: Decide the demotion intent: 550 (matches the row's date cell) or 600 (matches other item titles) — then add `@theme` font-weight utilities (e.g. `font-book: 550`, `font-heavy: 650`) so intermediate weights are named tokens instead of inline styles.

**TY-13 · LOW · effort:small — Raw three-dot "..." in upload placeholder while the rest of the app uses the true ellipsis character**
- Where: `src/app/DashboardClient.tsx:2771`
- Evidence: `placeholder={language === "german" ? "...oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein..." : "...or paste your lecture notes, transcript, or raw text here..."}` — every other string uses the typographic '…' ("Starte KI-Pipeline…", "Einen Moment …", "Frag deinen Tutor…", "Modul oder Vorlesung suchen…").
- Impact: Three full stops track wider and sit lower than '…'; on the upload page — the app's front door for new content — the placeholder is the only string in the product with typewriter ellipses. Also note the leading ellipsis + lowercase start is unusual; the drop-zone caption above already says 'or paste text below'.
- Fix: Replace with '…oder füge …hier ein …' → better: 'Oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein …' using U+2026, matching the space-before-ellipsis style used in "Einen Moment …".

**TY-14 · LOW · effort:small — Dashboard h1 is 44px while every other tab's h1 is 40px at the same breakpoint**
- Where: `src/app/DashboardClient.tsx:2175`
- Evidence: Dashboard greeting: `font-display text-[34px] sm:text-[44px] tracking-[-0.02em] leading-[1.05]` (L2175). Upload (L2603), Library (L2818), Stats (L3509) and the result headline (L3768) all use `text-[34px] sm:text-[40px]`. Login uses yet another pair: `text-4xl sm:text-[54px]` with weight 460 and leading-[1.06] (LoginClient L75).
- Impact: Tab-switching between Dashboard and Library visibly shrinks the page title by 4px with identical layout position — it reads as a glitch rather than intent, since nothing else about the header changes. (If the greeting is meant as the one 'hero', nothing else signals that.)
- Fix: Either normalize all four tab h1s to sm:text-[40px], or commit to the hero: give the greeting a distinct treatment (e.g. 44px plus the italic accent already used elsewhere) so the size difference reads as deliberate, and document 34/40/44/54 as the display scale.

**TY-15 · LOW · effort:small — Print export abandons the brand typography and tokens entirely (Inter bold + raw zinc palette)**
- Where: `src/app/DashboardClient.tsx:1957`
- Evidence: Print wrapper: `<h1 className="text-2xl font-bold font-sans text-zinc-900 mb-2">` (L1957), `border-zinc-200`, `bg-zinc-900 text-zinc-100` level chip, `text-zinc-500` meta (L1956–1993) — the only place in the codebase using Tailwind's raw zinc palette; globals.css' @media print block (L939–964) meanwhile carefully remaps the paper tokens for printing.
- Impact: The printed quiz sheet — a physical artifact of the product — carries none of the Paper & Ember voice: no Fraunces title, generic gray-blue zincs instead of the warm ink ramp the print block already provides. It looks like a different (cheaper) product on paper.
- Fix: Use the existing tokens in the print wrapper (`text-ink-900`, `border-(--line)`, `bg-paper-2`) — the @media print overrides already resolve them to print-safe values — and set the sheet title in `font-display` weight 470 to match the app's headline voice.


### Color, contrast & theming (12)

**CO-1 · HIGH · effort:small — Undo-toast action button is illegible in the ink theme (1.7:1) and with the graphite accent in paper (1.8:1)**
- Where: `src/app/components/Toast.tsx:98`
- Evidence: className="text-(--a-g2) font-semibold px-2 py-1 rounded-full ..." — the action sits on the inverted pill `bg-ink-900 text-(--paper-0)` (line 92). The pill flips per theme but --a-g2 flips the same way, so they collide. Computed: paper+amber #ef9f1f on #211b12 = 7.84:1 (fine); ink+amber #f2a62e on pill #f1ebdf = 1.72:1; ink+slate = 2.03:1; ink+eucalyptus = 1.94:1; ink+heather = 2.34:1; ink+graphite = 1.23:1; paper+graphite #4e4638 on #211b12 = 1.83:1. WCAG needs 4.5:1.
- Impact: The 'Undo' label — the app's single forgiveness affordance (CRAFT.md §8, replaces confirm dialogs) — is a near-invisible amber smear on the cream pill for every ink-theme user, and dark-on-dark for paper+graphite users. Users who just deleted something can't see the one control that saves them.
- Fix: The pill inverts, so the accent on it must come from the OPPOSITE theme's tuning. Add a token, e.g. `--accent-on-surface-inverse`: in :root (paper) set it to the ink tuning of the accent (amber #f0ac42 → 8.69:1 on the dark pill), in [data-theme="ink"] set it to the paper tuning's --accent-text-strong (amber #a15e03 → 4.30:1 on the cream pill); per-accent overrides mirror the existing accent blocks (graphite: #ded5c3 / #4e4638 → 11.7:1 / 7.8:1). Then use `text-(--accent-on-surface-inverse)` in Toast.tsx.

**CO-2 · HIGH · effort:medium — The entire tertiary text tier (--ink-400) fails contrast on every paper surface: 2.41–2.65:1 for eyebrows, captions, and placeholders**
- Where: `src/app/globals.css:468`
- Evidence: .eyebrow / .caps-label are 11px 650-weight with `color: var(--ink-400)` (lines 462–478). --ink-400: #a89d8b (line 76) computes to 2.41:1 on paper-0 #f6f3ec, 2.65:1 on paper-1 #fffefb, 2.27:1 on paper-2 — below even the 3:1 large-text floor, far below the 4.5:1 required at 11px. There are 83 `text-ink-400` call sites, including full sentences: TutorPanel.tsx:342 empty-state copy at 12px, StatsPanel.tsx:571/614 chart captions at 11.5px, DashboardClient.tsx:3752 'You can leave this page…' reassurance, and ::placeholder (globals.css:379). Ink theme --ink-400 #7c7160 = 3.38–3.72:1, also sub-4.5.
- Impact: Every date eyebrow, stat-card label, chart caption, placeholder, and helper sentence in the app is washed out — dozens of screens fail WCAG AA, and on a sunlit laptop screen the meta layer effectively disappears. Notably the dark theme is MORE legible than the flagship paper theme.
- Fix: Split the tier's jobs: (1) darken paper --ink-400 to #7d7365 (4.20:1 on paper-0, 4.61:1 on paper-1 — still clearly lighter than ink-600 #6e6455) and ink --ink-400 to ~#948873 (5.1:1); (2) move sentence-length copy (TutorPanel empty state, StatsPanel captions, grading reassurance) up to text-ink-600, keeping ink-400 for glanceable labels only.

**CO-3 · HIGH · effort:medium — Raw gradient stops used as text color: ~20 `text-amber-500/600` call sites at 1.96–2.79:1 instead of the purpose-built --accent-text-strong**
- Where: `src/app/DashboardClient.tsx:4732`
- Evidence: `<div className="mb-4 text-xs font-semibold text-amber-600 ...">` — text-amber-600 maps to --a-g3 #de850b (globals.css:45), a GRADIENT STOP, not a text token: 2.79:1 on paper-1, 2.54:1 on paper-0 (needs 4.5:1 at 12px). Same misuse: DashboardClient 4818, 2683 ('Add Presets' link), 5030 ('Manage' button), 3819/3847 (icons); text-amber-500 = --a-g2 #ef9f1f at 1.96–2.16:1: StatsPanel.tsx:379 streak flame icon, TutorPanel.tsx:337 Sparkles, DashboardClient 3876 active quiz numeral (`text-amber-500` on font-display text-xl — large text still needs 3:1, has 2.16). The system already ships --accent-text-strong #a15e03 = 4.60–5.06:1 for exactly this.
- Impact: Settings section headers, the Add-Presets link, the streak flame, and the active question numeral all render as pale orange ghosts on paper — they look faded/disabled rather than accented, and they fail AA. Under the graphite accent the same classes suddenly turn near-black (#37312a, 12.7:1), so the visual weight of these elements swings wildly across accents — a token-discipline break, not just a contrast bug.
- Fix: Global sweep: every `text-amber-500`/`text-amber-600` that colors text or a meaning-bearing glyph becomes `text-(--accent-text-strong)` (or --accent-text for large display numerals); reserve --a-g1/2/3 for fills, gradients, dots, and bars. ~20 call sites across DashboardClient, StatsPanel, TutorPanel, tutor/[id]/page.tsx.

**CO-4 · HIGH · effort:small — Amber is the ONLY accent whose --accent-text fails AA (3.09–3.40:1) — the default accent has the worst link legibility of all five**
- Where: `src/app/globals.css:105`
- Evidence: --accent-text: #c97706 ('quiet links, wordmark italic') = 3.09:1 on paper-0, 3.40:1 on paper-1. Used for 12–12.5px links: DashboardClient 2668 `text-(--accent-text)` 'Verwalten/Manage', 2874 show-more control. Computed for the other accents' --accent-text on paper-0: slate #47698f = 5.14, eucalyptus #3c7a63 = 4.56, heather #75589a = 5.24, graphite #4e4638 = 8.40 — all pass; every ink-theme tuning is 8.2–12.2. Only amber, the default, is below 4.5:1.
- Impact: Out of the box (amber accent, paper theme), every quiet accent link fails AA while a user who happens to pick slate or heather gets compliant links — the default configuration is the app's worst. The brand wordmark 'Master' italic is borderline too (large-ish 15px bold, 3.4:1 barely clears the 3:1 large-text bar).
- Fix: Darken paper-theme amber --accent-text to #a15e03 (already shipped as --accent-text-strong, 4.60/5.06:1) — matching the pattern of the four other accents, which already set accent-text == accent-text-strong. If a lighter wordmark tint is wanted for the brand only, keep #c97706 as a dedicated --brand-italic token so links stop inheriting it.

**CO-5 · HIGH · effort:medium — Accent discipline is broken: amber leaks into settings headers, decorative card icons, the fail-flow CTA, a teaser card, and a competing selected-state language**
- Where: `src/app/DashboardClient.tsx:4141`
- Evidence: globals.css:9-10 states: 'Accent appears ONLY on: brand mark · the primary action · due-now signals · the earned pass moment.' Violations: decorative modal-header icons `<VideoCameraIcon className="w-4 h-4 text-amber-600" />` (4141), DocumentTextIcon (4187), CalendarDaysIcon (4357); settings section eyebrows `text-xs font-semibold text-amber-600` (4732, 4818); the FAIL-flow remediation button carries an amber icon `<SpeakerWaveIcon className="w-4 h-4 text-amber-600" />` inside 'Play pre-lecture audio' shown only when !isPass (3845–3848); marketing teaser `<SparklesIcon className="... text-amber-500 ..." />` in the 'Live Tutor Pro — Coming soon' card (2096); and selection states: stats semester filter uses `chip-amber` when selected (StatsPanel.tsx:437) and the tutor toggle uses `bg-(--accent-wash-soft) text-(--accent-text-strong)` when active (3586) — while the system's own nav and segmented control express selection as paper+ink (globals.css:655-660, 673-679).
- Impact: The one-scarce-accent premise is the design system's core move; each leak devalues the moments that are supposed to own the color (due-now, the pass thread). Amber inside the FAILURE flow actively contradicts 'earned pass moment'. Two coexisting selected-state grammars (paper-card selection in nav/segmented vs amber-wash selection in stats/tutor toggle) reads as two different apps.
- Fix: Demote decorative icons and settings headers to ink-600/ink-400 (post-fix); make the fail-flow audio icon ink-600 or clay; give the teaser sparkle ink-400; unify selection on the paper+ink pattern (chips: bg-paper-1 + border-hairline + ink-900, as segmented-item already does), reserving chip-amber strictly for due-count badges.

**CO-6 · MEDIUM · effort:small — --ink-300 (1.73–1.90:1 on paper) is used for real words and for idle icon buttons, not just decoration**
- Where: `src/app/components/StatsPanel.tsx:542`
- Evidence: `<p className="text-ink-300 text-sm">{de ? "Noch keine Daten." : "No data yet."}</p>` — #c4baa9 on paper-1 = 1.90:1, on paper-0 = 1.73:1. Also words at 8–10px: weekday gutter `text-[8px] text-ink-300` (StatsPanel 496), 'kein Brief / no brief' (DashboardClient 4260), timeline captions text-[10px] (3260, 3315, 4288). And .btn-ghost-icon idle color is var(--ink-300) (globals.css:528) — interactive glyphs need 3:1 (WCAG 1.4.11), have 1.73–1.90 (ink theme: 2.14–2.36).
- Impact: An entire empty-state message and several status captions are borderline invisible on paper; close/trash/expand ghost buttons don't read as present until hovered — users miss that a control exists at all, especially on the quiz cards where the ghost trash is also opacity-gated.
- Fix: Reserve ink-300 for genuinely decorative marks (dividers, dashes, idle numerals). Move all words to ink-400-after-darkening or ink-600 ('No data yet' should match the other empty states, which correctly use text-ink-600 — see StatsPanel 355, 370). Raise .btn-ghost-icon idle to ink-400 so icons clear ~3:1 after the ink-400 fix.

**CO-7 · MEDIUM · effort:small — The 50–79% pass-rate band bar (--grade-mid #e0a43a) is nearly invisible: 1.75:1 against its track**
- Where: `src/app/components/StatsPanel.tsx:563`
- Evidence: `mod.passRate >= 50 ? "bg-(--grade-mid)" : ...` fills a 7px bar inside `bg-paper-2` track (line 555). Computed: #e0a43a vs track #ebe5d8 = 1.75:1, vs paper-1 card = 2.18:1 — under the 3:1 required for meaningful graphics (WCAG 1.4.11). The neighbors pass: sage #5e7d58 = 3.68:1, clay #b06a4e = 3.33:1 vs track. Ink theme is fine (#e3ac4c vs #231e17 = 8.09:1).
- Impact: The warning band — exactly the modules a student should worry about — is the one bar you can barely see on paper theme. A module at 65% reads at a glance like an empty track next to crisp sage and clay bars; the three-tier encoding silently degrades to two tiers.
- Fix: Darken paper --grade-mid to ~#b87f1e (2.75:1 vs track, 3.42:1 vs the card — clears 3:1 against the surface; or add a 1px `color-mix(in srgb, var(--grade-mid) 55%, transparent)` border like the grade washes use). Keep the ink-theme value as is.

**CO-8 · MEDIUM · effort:small — text-ink-500 references a token that doesn't exist — the 'passed' level-timeline labels silently render unstyled**
- Where: `src/app/DashboardClient.tsx:3241`
- Evidence: `${current ? "text-(--accent-text-strong) font-semibold" : passed ? "text-ink-500 font-medium" : "text-ink-300 font-medium"}` — the @theme block defines only --color-ink-900/-600/-400/-300 (globals.css:31-34), so Tailwind 4 never generates `text-ink-500`; the class is a no-op and the span inherits the surrounding color.
- Impact: The timeline's three-state hierarchy (current = accent, passed = mid, future = faint) collapses: passed labels inherit the parent's darker ink and end up visually HEAVIER than the current level's label, inverting the intended emphasis on the earned position.
- Fix: Use `text-ink-600` (the closest existing step) — or, if a true mid-step is wanted between 600 and 400, add `--color-ink-500` to @theme in both theme blocks. Grep confirms line 3241 is the only ink-500 reference.

**CO-9 · MEDIUM · effort:small — Heatmap level 1 is indistinguishable from an empty day: 1.00:1 luminance against --chart-zero on paper**
- Where: `src/app/components/StatsPanel.tsx:307`
- Evidence: heatColor: `if (count === 1) return "bg-(--accent-heat-1)"` where --accent-heat-1 = 28% of --a-g2 (globals.css:119). Composited over paper-1: #fbe3bd vs empty cell --chart-zero #ece6da = 1.00:1 — identical luminance, hue-only difference. Graphite accent: #cdcac4 vs #ece6da = 1.32:1 (gray vs gray-beige, nearly no hue delta either). Ink theme heat-1 = 1.73:1 vs #2a241c. The legend swatches (526-530) sit adjacent and are equally close.
- Impact: 'Studied once' vs 'didn't study' — the single most motivating distinction in a streak heatmap — is invisible to anyone with reduced color vision and genuinely squint-inducing for everyone on paper theme; under graphite it effectively disappears. Fails WCAG 1.4.11 for meaningful graphics (3:1).
- Fix: Steepen the ramp's first step: heat-1 → ~40% mix, and give non-zero cells a hairline `border: 1px solid color-mix(in srgb, var(--a-g3) 35%, transparent)` so activity is encoded by more than hue. Alternatively make --chart-zero slightly cooler/darker (#e6e0d2) to open luminance distance.

**CO-10 · LOW · effort:small — body's Tailwind selection classes silently override the design-system ::selection token (20% vs the specified 30%)**
- Where: `src/app/layout.tsx:118`
- Evidence: `<body className="... selection:bg-amber-500/20 selection:text-ink-900">` — Tailwind emits `.selection\:bg-amber-500\/20 *::selection` (specificity 0,1,1), which beats the token rule in globals.css:365-368 `::selection { background: color-mix(in srgb, var(--a-g2) 30%, transparent); ... }` (0,0,1, and base layer loses to utilities anyway). The globals rule — annotated 'CRAFT.md §1' — never applies inside body.
- Impact: Text selection renders a third lighter than the system specifies, and there are now two competing sources of truth: anyone tuning the CSS token will see no change in the app and burn time hunting the ghost override.
- Fix: Delete `selection:bg-amber-500/20 selection:text-ink-900` from the body className; the globals.css ::selection rule (already theme/accent aware and legibility-verified: ink-900 on the 30% wash = 12.6:1 paper, 7.9:1 ink, 9.3:1 graphite) takes over.

**CO-11 · LOW · effort:small — ScribbleCanvas draws in Tailwind stone-900 (#1c1917), not the app's ink, and paints a max-glare #ffffff pad in the dark theme**
- Where: `src/app/components/ScribbleCanvas.tsx:27`
- Evidence: `const INK = "#1c1917"; // warm near-black, matches the app's ink tones` — but --ink-900 is #211b12; #1c1917 is Tailwind's cool stone-900, so the comment is false. Line 70 `ctx.fillStyle = "#ffffff"` plus line 223 `bg-white` put a pure-white rectangle inside the espresso ink theme (#1b1713 page), the only #fff surface in the app (the design's whitest paper is #fffefb).
- Impact: During a late-night ink-theme quiz — exactly the 'Kind at 11pm' scenario the theme advertises — opening the scribble pad fires a full-brightness white flash; and the stroke color is subtly cooler than every other black in the UI, a felt-but-not-named wrongness on the paper theme.
- Fix: Set INK = "#211b12" and fill/`bg-` with #fffefb (paper-1). The export constraint in the header comment ('dark-mode UIs must not leak into the export') is preserved — the pad stays a light fixed-color surface for the grader, just the app's own warm white. Optionally soften the ink-theme presentation with a stronger border (--line) around the pad.

**CO-12 · LOW · effort:small — Tutor brief page drifts from the system: brand italic in text-amber-600 and a default gray Tailwind shadow-sm on the copy button**
- Where: `src/app/tutor/[id]/page.tsx:47`
- Evidence: `Tutor <em className="font-display italic text-amber-600">Prompt</em>` — every other brand italic uses text-(--accent-text) (DashboardClient 2013/2042, LoginClient 72); #de850b here is also 2.79:1. And copy-button.tsx line 29 uses `shadow-sm` — Tailwind's neutral gray shadow — while globals.css:83 declares 'Warm-tinted elevation (never gray)' and every other control uses shadow-(--shadow-e1).
- Impact: The shareable/server-rendered page — the one surface teammates or externals may see — is the least on-brand: a paler, non-compliant brand accent and the app's only cold gray shadow. Small, but it's precisely the kind of edge-of-product drift a craft-obsessed team catches.
- Fix: page.tsx:47 → `text-(--accent-text)` (after the accent-text darkening in the earlier finding); copy-button.tsx:29 → replace `shadow-sm` with `shadow-(--shadow-e1)`.


### Elevation, shadows & surfaces (18)

**EL-1 · HIGH · effort:small — The signature hover-shadow cross-fade is silently clipped to invisibility on the app's primary card (due cards) and both grading-result cards**
- Where: `src/app/DashboardClient.tsx:2299`
- Evidence: Due card: `className="card-surface-elevated group cursor-pointer relative overflow-hidden pl-[26px]…"` (2299); also `card-surface-elevated p-7 md:p-8 relative overflow-hidden` (3760) and `card-surface-elevated overflow-hidden` (3817). The hover shadow lives on a pseudo-element: globals.css 422–431 `.card-surface-elevated::after { position:absolute; inset:-1px; box-shadow: var(--shadow-e2-hover); opacity:0; …}`. `overflow:hidden` (added so the absolutely-positioned `.amber-thread` clips at the rounded corner) clips the ::after child — its outward box-shadow renders entirely outside the card bounds, so nothing of it survives the clip.
- Impact: On the single most important interactive surface in the app — the 'Due today' card you tap to start a quiz — hovering produces the framer −1px lift (line 2295 `whileHover={{ y: -1 }}`) and a border darken, but the promised e2→e2-hover shadow deepen never appears. The card lifts without its shadow responding, which reads as a rendering glitch rather than physicality; meanwhile non-clipped elevated cards (upload form, tutor brief) deepen correctly, so the flagship hover pattern behaves differently card to card.
- Fix: Remove `overflow-hidden` from these three cards and clip the amber thread itself instead (it already has `border-radius:999px`; just inset it: `left-0 top-3.5 bottom-3.5` already avoids the corners — verify, then drop the clip). If clipping is truly needed, wrap the card's content in an inner `overflow-hidden rounded-[inherit]` div so the ::after shadow layer stays unclipped.

**EL-2 · HIGH · effort:small — Login's Google button animates box-shadow directly on hover (transition-all + hover:shadow-lift), breaking the system's own no-interpolation rule**
- Where: `src/app/login/LoginClient.tsx:126`
- Evidence: `className="… transition-all cursor-pointer border border-(--line) shadow-(--shadow-e1) hover:-translate-y-px hover:shadow-(--shadow-lift) active:translate-y-0 …"`. motion.ts 9–10 states: 'Only `transform` and `opacity` ever animate. No blur transitions, no box-shadow interpolation (hover shadows cross-fade a pre-rendered layer).' globals.css 346–351 deliberately whitelists only `color, background-color, border-color, opacity, transform` — `transition-all` overrides that whitelist wholesale.
- Impact: The very first interactive element a user ever touches — the sole CTA on the branded login page — is the one place the motion system's cardinal rule is broken. The shadow tweens e1→lift on the compositor-unfriendly path, and `transition-all` also picks up padding/width if anything ever changes them. It's also the only consumer of the `--shadow-lift` token, so the 'lift' tier of the elevation ladder exists solely to power a rule violation.
- Fix: Rebuild the hover exactly like `.card-surface-elevated`: keep `shadow-(--shadow-e1)` static, add a `::after` (or absolutely-positioned span) carrying `var(--shadow-lift)` that cross-fades opacity 0→1 on hover, and replace `transition-all` with the default whitelisted transition. Keep the −1px translate.

**EL-3 · MEDIUM · effort:small — Stats stat-cards hand-roll an e2 surface instead of using card-surface-elevated — and the loading skeleton renders the same grid at e1 with different gap, so the page visibly shifts on load**
- Where: `src/app/components/StatsPanel.tsx:461`
- Evidence: Loaded: `className="bg-paper-1 border border-hairline-card rounded-[18px] p-5 shadow-(--shadow-e2)"` inside a `gap-3.5` grid (457). Skeleton for the same four cards: `className="card-surface p-5"` (325) inside `grid … gap-4` (323) — card-surface is e1, and the comment at 319 claims the skeleton 'mirrors the final layout, so nothing jumps'. The skeleton also carries `style={{ animationDelay: `${i * 120}ms` }}` with no animation defined anywhere — a dead remnant of a staggered pulse that never runs.
- Impact: Every visit to Stats: cards materialize at a different elevation (e1→e2) and the grid gutter shrinks 16px→14px, a small but perceptible reflow that contradicts the skeleton's stated purpose. Once loaded, these are the only e2 surfaces in the app without the elevated-card behavior (no hover border response, no ::after cross-fade layer), so the elevation ladder's one bespoke clone drifts from the system.
- Fix: Use `card-surface-elevated p-5` for the loaded stat cards, make the skeleton use the identical class and `gap-3.5`, and either delete the dead `animationDelay` or restore the intended staggered pulse (e.g. a `animate-pulse`-style opacity keyframe on the placeholder bars).

**EL-4 · MEDIUM · effort:medium — Modal backdrop blur pops in after the fade instead of being 'static': backdrop-filter can't composite while its animated ancestor has opacity < 1**
- Where: `src/app/DashboardClient.tsx:4111`
- Evidence: Every modal scrim is a child of the fading container: `<motion.div {...overlayMotion} …><div className="fixed -inset-6 -z-10 bg-(--overlay) backdrop-blur-[3px]" …/>` (4111, 4163, 4327, 4440, 4906, 4955, 5011). overlayMotion (motion.ts 88–93) animates the parent's opacity 0→1 over 180ms. Per the CSS Filter Effects backdrop-root rules (implemented in Chromium/WebKit), an ancestor with opacity < 1 forms a new backdrop root, so the child's `backdrop-blur-[3px]` cannot sample the page behind it during the fade — the blur snaps on only when the parent reaches opacity 1, and cuts off instantly at the start of exit.
- Impact: The design's own note says 'Backdrop blur is a STATIC style, never animated' (motion.ts 86), but the effective result is worse than animating it: the tint fades smoothly, then the 3px blur appears as a discrete pop ~180ms later on all seven modals. It's the kind of two-stage settle a perfectionist eye reads as jank on every single dialog open.
- Fix: Move `bg-(--overlay) backdrop-blur-[3px]` onto the opacity-animated element itself (backdrop-filter keeps compositing while the element's own opacity animates — the standard overlay pattern), and give the modal panel its own sibling motion wrapper rather than nesting it inside the fading scrim container.

**EL-5 · MEDIUM · effort:medium — z-index inversion: the tutor chat panel (z-70) and the floating quiz control bar (z-60, body portal) both render above the settings modal and its scrim (z-60)**
- Where: `src/app/DashboardClient.tsx:4437`
- Evidence: Settings modal: `className="fixed inset-0 flex items-center justify-center p-4 z-[60]"` (4437). TutorPanel: `fixed inset-y-0 right-0 z-[70] …` portaled to body (TutorPanel.tsx 299). Interactive control bar: `fixed bottom-… z-[60]` also portaled to `document.body` (3636–3642), so at equal z it paints after (above) the inline modal. The sidebar's settings button (2050–2069) is reachable on desktop while the quiz tab, tutor panel, and interactive mode are all active.
- Impact: Open the tutor chat during a quiz, then click Settings in the sidebar: the modal's full-viewport scrim dims everything except the chat panel, which stays fully bright, interactive, and — on a 1280px laptop (modal right edge ≈ 920px, panel starts at 904px) — physically overlaps the dialog. Likewise the play/pause pill floats undimmed above the scrim during interactive mode. A blocking modal that fails to subordinate other chrome breaks the elevation story at its most literal level.
- Fix: Give modals a tier above all non-modal chrome (e.g. panels/floating bars at 60–70, all modal scrims at 80+, keeping toasts at 100 and tooltips at 200), or close/suppress the tutor panel and control bar while a modal is open. Document the ladder as tokens (--z-panel, --z-modal, --z-toast, --z-tip) so tiers can't drift.

**EL-6 · MEDIUM · effort:small — Active quiz-task card tweens box-shadow and ring via transition-all duration-300 as voice focus moves between cards**
- Where: `src/app/DashboardClient.tsx:3867`
- Evidence: `className={`card-surface-elevated p-[22px] md:px-[26px] transition-all duration-300 ${ … ? "!border-(--accent-border-strong) ring-[3px] ring-(--accent-wash) shadow-[0_20px_48px_-20px_color-mix(in_srgb,var(--a-g3)_28%,transparent)]" : …}`}` — in Tailwind 4 both `ring-*` and `shadow-[…]` compile to `box-shadow`, and `transition-all` makes that box-shadow interpolate over 300ms every time `interactive.currentIndex` changes.
- Impact: During interactive voice mode the accent glow and 3px ring morph paint-side from card to card — precisely the box-shadow interpolation the motion system bans, on a large 20px-blur shadow (the most expensive kind), repeatedly through a session. The `0_20px_48px_-20px` accent shadow is also an ad-hoc value outside the e1/e2/e3/accent-glow ladder.
- Fix: Constrain the transition to `transition-[opacity,border-color] duration-300` and put the ring+glow on a pre-rendered ::after/inner layer that cross-fades opacity (same pattern as card-surface-elevated). Consider promoting the accent focus shadow to a token (e.g. --shadow-focus-accent) since it is a legitimate 'due-now/active' accent signal.

**EL-7 · MEDIUM · effort:small — Tutor page copy button ships the only cool-gray shadow in the product: Tailwind default shadow-sm instead of the warm e1 token**
- Where: `src/app/tutor/[id]/copy-button.tsx:29`
- Evidence: `className="group inline-flex items-center gap-2 rounded-xl border border-(--line) bg-paper-1 px-5 py-2.5 … shadow-sm transition hover:border-(--accent-border) …"`. Tailwind 4's `--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` — pure black at 10%, versus the system's paper e1 `rgba(50, 38, 20, 0.04)` (globals.css 84) under the explicit comment 'Warm-tinted elevation (never gray)'. The bare `transition` utility also re-adds box-shadow to the transition list the base layer deliberately excludes.
- Impact: On the warm paper ground the black shadow reads colder and roughly 2.5× heavier than every other resting element; in ink theme it stays a light-mode gray instead of switching to the theme-tuned dark shadows like all e-tokens do. Because this page is server-rendered and shared, it's a public-facing surface where the palette discipline visibly slips. This is effectively a hand-rolled .btn-secondary that drifted.
- Fix: Replace with `btn-secondary` (which already provides paper-1 bg, --line border, e1 shadow, correct press state), or at minimum swap `shadow-sm transition` for `shadow-(--shadow-e1)` and the default transition whitelist.

**EL-8 · MEDIUM · effort:medium — Hover affordance is baked into all card surfaces, so static cards (All-clear, grading progress, tutor brief, quiz answer cards) respond like buttons**
- Where: `src/app/globals.css:406`
- Evidence: `.card-surface:hover { border-color: var(--line); }` (406–410) and `.card-surface-elevated:hover { border-color: var(--line) } / :hover::after { opacity: 1 }` (432–439) apply unconditionally. Non-interactive consumers: the 'All clear' card (DashboardClient 2249), grading-progress hero (3697), upload form card (2663), results card (3760), quiz answer cards (3867), tutor brief page (tutor/[id]/page.tsx 64), and every Stats chart card (StatsPanel 486, 537, 577, 623) all darken their border and/or deepen their shadow on hover.
- Impact: The one card where hover genuinely means 'you can tap me' — the due card — shares its hover language with a dozen inert surfaces, so the affordance carries no information. Mousing across the dashboard makes empty-state and chart panels twitch their borders, which feels busy against the system's own 'invisible until touched' philosophy (motion.ts 6) where 'touched' should mean actionable.
- Fix: Split the hover response out: keep `.card-surface`/`.card-surface-elevated` inert, and add `.card-interactive` (or gate on `[data-interactive]`/`:is(a,button)` wrappers) that owns border-darken + ::after cross-fade + lift. Apply it only to due cards, library rows, archive rows, and theme cards.

**EL-9 · MEDIUM · effort:small — ember-pulse — the app's one sanctioned ambient loop — animates box-shadow spread in a keyframe, violating the transform/opacity-only rule inside the token file itself**
- Where: `src/app/globals.css:866`
- Evidence: `@keyframes ember-pulse { 0%,100% { opacity:1; box-shadow: 0 0 0 0 color-mix(in srgb, var(--a-g2) 35%, transparent); } 50% { opacity:0.75; box-shadow: 0 0 0 5px transparent; } }` (866–875) — an infinite 2s box-shadow interpolation, used on upload/grading step indicators (DashboardClient 2652, 3733) and the tutor 'thinking' dot (TutorPanel 395), sometimes running for a minute-plus while grading.
- Impact: Every frame of the pulse repaints a shadow rather than compositing a transform — precisely the cost the motion rules exist to avoid, and it runs during the two longest waits in the product (upload pipeline, grading) when the main thread is already busy streaming progress. Rule-breaking in globals.css also licenses call sites to do the same (see the other box-shadow findings).
- Fix: Rebuild the pulse as a `::after` ring: static `box-shadow: 0 0 0 1.5px` or a bordered pseudo-element that animates `transform: scale(1→2)` + `opacity: .35→0` — visually identical sonar effect, compositor-only. `.ember-dot` keeps its opacity beat.

**EL-10 · MEDIUM · effort:small — Radius drift on the recurring icon-tile pattern (12/16/16/18px for the same squircle) and chart bar tops (5/6/8px within one Stats page)**
- Where: `src/app/DashboardClient.tsx:2229`
- Evidence: Empty-state/progress icon tiles: `w-[52px] h-[52px] rounded-2xl` (16px — 2229, 2899, 2922, StatsPanel 364) vs `w-16 h-16 rounded-[18px]` (2611, 3698) vs `w-12 h-12 rounded-xl` (12px — dropzone, 2716) vs `w-12 h-12 rounded-2xl` (16px — TutorPanel 336, StatsPanel 352). rounded-2xl (16px) and rounded-md (6px, StatsPanel 326) sit outside the app's stated 5/8/10/11/12/13/14/18/22 scale. Same Stats page, bar-chart tops: `rounded-t-[5px]` (StatsPanel 596), `rounded-t-lg` (8px, 651), skeleton `rounded-t-md` (6px, 337). One-off `rounded-[9px]` on the sign-out button (2131) beside 10px neighbors.
- Impact: These tiles and bars are the same element repeated across screens; four different corner treatments make the pattern feel assembled rather than designed. The two adjacent bar charts on Stats visibly disagree about their cap radius. Off-scale values (16, 6, 9, 3) also mean the documented radius ladder no longer describes the product.
- Fix: Pick one tile mapping (e.g. 48px tile → 14px, 52px → 14px, 64px → 18px) and apply it everywhere; unify chart bar caps at one value (5px suits the 13px heat cells' 3px); change rounded-[9px] → rounded-[10px]. Consider registering the scale as Tailwind theme radii so arbitrary values stand out in review.

**EL-11 · MEDIUM · effort:small — Modal close buttons are four different components: radii, fills, and hover treatments drift per modal — two even have a no-op hover**
- Where: `src/app/DashboardClient.tsx:4122`
- Evidence: Archive/feedback: `w-8 h-8 rounded-full bg-paper-2 hover:bg-paper-2 …` (4122, 4178 — hover fill identical to resting fill, so the background gives zero hover feedback); prompts modals: `w-8 h-8 … rounded-[10px] … hover:bg-(--hairline)` (4921, 4983); prompt viewer: `w-8 h-8 … rounded-lg bg-paper-2 hover:bg-paper-2 … transition-all` (5037); settings/calendar: bare `p-2` text button, no fill or radius (4338). Modal header dividers likewise alternate `border-(--hairline-card)` (4117, 4170, 5018) and `border-(--hairline)` (4913, 4962).
- Impact: The most repeated control in the overlay layer renders differently in every dialog — circle vs 10px vs 8px square vs naked icon — and in two modals hovering it changes only the icon color because `hover:bg-paper-2` equals the resting `bg-paper-2`. Users see this control constantly; the inconsistency and dead hover cheapen the modal layer as a whole.
- Fix: Extract one `ModalClose` (suggest: `w-8 h-8 rounded-[10px] btn-ghost-icon`, which already defines hover fill+color and press scale) and use it in all seven modals; standardize modal header dividers on `--hairline-card`.

**EL-12 · MEDIUM · effort:small — Due card lacks the press state the system promises — whileHover without whileTap on the app's primary tap target; hoverLift preset exists but is never used**
- Where: `src/app/DashboardClient.tsx:2295`
- Evidence: Due card: `whileHover={{ y: -1 }} transition={springSoft}` with `onClick={() => startQuiz(review)}` (2292–2299) — no `whileTap`. motion.ts 129–140 defines both `pressable` and `hoverLift = { whileHover: { y: -1 }, whileTap: { scale: 0.985 }, … }` ('presses 120ms scale 0.985' per the CRAFT rules), and `hoverLift` has zero call sites in the codebase.
- Impact: Tapping a due card — the single action the whole product funnels toward — gives no physical acknowledgment before the tab switches, while every button, chip, and even list rows (`.press-row`) compress on press. On touch devices (no hover) the card gives no feedback at all. The unused `hoverLift` export shows this card was meant to use the full preset and drifted to a hand-rolled half.
- Fix: Replace the inline props with `{...hoverLift}` on the due-card motion.div (and the theme-preview buttons at 4483 which repeat the same partial pattern with `whileTap: 0.98`).

**EL-13 · LOW · effort:small — Undo toast duplicates the tooltip's hardcoded shadow literal; neither is tokenized nor theme-tuned like every other shadow**
- Where: `src/app/components/Toast.tsx:92`
- Evidence: Undo pill: `shadow-[0_6px_16px_-6px_rgba(33,27,18,0.4)]` — byte-identical to `.tip-bubble { box-shadow: 0 6px 16px -6px rgba(33, 27, 18, 0.4); }` (globals.css 827). Every other shadow lives in a themed variable (e1/e2/e3/lift/accent-glow all switch to black-based values under `[data-theme="ink"]`, globals.css 184–199); these two stay frozen at the paper-tinted literal in both themes.
- Impact: The two 'ink chip' surfaces (tooltip, undo bar) share a design intentionally but share it by copy-paste; retuning one will silently orphan the other. In ink theme they're also the only shadows that don't participate in the dark shadow ramp, sitting noticeably lighter than the e3 toasts they appear next to.
- Fix: Add `--shadow-ink-chip: 0 6px 16px -6px rgba(33,27,18,0.4)` in :root with an ink-theme tuning (e.g. `0 6px 16px -6px rgba(0,0,0,0.5)`), and reference it from both .tip-bubble and the undo pill.

**EL-14 · LOW · effort:small — Accent swatches animate their selection ring as raw box-shadow (250ms inline transition)**
- Where: `src/app/DashboardClient.tsx:4546`
- Evidence: `boxShadow: `${selected ? `0 0 0 3px var(--paper-1), 0 0 0 5.5px ${g2}` : "0 0 0 3px transparent, 0 0 0 5.5px transparent"}, inset 0 1px 0 …`` with `transition: "box-shadow 250ms cubic-bezier(0.16,1,0.3,1)"` (4544–4547).
- Impact: Selecting an accent tweens a two-layer spread shadow paint-side — a literal breach of the no-box-shadow-interpolation rule inside the very settings panel that showcases the design system. Visually it works (it's a color fade, not a blur morph), but it repaints a 40px circle + rings for 250ms and sets a precedent the codebase already follows elsewhere.
- Fix: Render the ring as an absolutely-positioned inset ::before/span (border: 2.5px solid g2, offset by the 3px paper gap) that cross-fades opacity + scales 0.9→1 on selection — same look, compositor-only, and it can share the springy check-pop already used for the CheckIcon (4553).

**EL-15 · LOW · effort:small — Library level-progress dots tween their glow/ring shadows through transition-all**
- Where: `src/app/DashboardClient.tsx:3141`
- Evidence: 7-dot row: `w-[7px] h-[7px] rounded-full transition-all` with the current dot at `bg-(--accent-border) shadow-[0_0_0_1.5px_color-mix(in_srgb,var(--a-g2)_40%,transparent)]` (3141–3145); interval stepper node: `w-5 h-5 rounded-full … transition-all` with current at `… border-2 border-amber-500 shadow-[0_0_8px_color-mix(in_srgb,var(--a-g2)_35%,transparent)]` (3230–3234).
- Impact: When a lecture levels up, the ring and 8px glow interpolate as box-shadow (via transition-all) instead of cross-fading — the same rule breach as the bigger cases, here in miniature. transition-all on these dots also transitions width/height/padding if any responsive class ever touches them.
- Fix: Change `transition-all` to `transition-colors` on both; the glow/ring can simply swap without a tween at this size, or move to an opacity-faded pseudo-element if the tween is wanted.

**EL-16 · LOW · effort:small — Theme preview cards: 1.5px border on an e1 surface, hover-lift with no shadow response, and inner preview radius breaks the nesting rule**
- Where: `src/app/DashboardClient.tsx:4486`
- Evidence: `className="flex-1 … bg-paper-1 rounded-2xl p-[7px] pb-[11px] cursor-pointer shadow-(--shadow-e1)"` + `style={{ border: `1.5px solid ${selected ? "var(--a-g2)" : "var(--hairline-card)"}` …}}` (4486–4487), with `whileHover={{ y: -1 }}` (4483). Inner preview: `rounded-[11px]` (4491/4500/4509) inside outer 16px − 7px padding = 9px ideal.
- Impact: Three system deviations on one control: the only 1.5px hairline in the app (everything else is 1px, so the unselected state looks slightly thick/soft), a hover lift with a frozen e1 shadow (the shadow visibly detaches from the card since nothing deepens beneath it), and inner corners (11px) rounder than the geometry allows (9px), leaving a faintly pinched corner margin. rounded-2xl is also off the radius scale.
- Fix: Use `rounded-[14px]` outer with `rounded-[8px]` inner previews (nesting-correct on the app's scale), keep the border 1px and express selection with the border color + the existing check, and either drop the hover lift or pair it with the ::after shadow cross-fade.

**EL-17 · LOW · effort:small — Floating interactive control bar composes its overlay surface ad hoc: inline e3 style, 18px radius plus hairline — matching neither card-glass nor the toast recipe**
- Where: `src/app/DashboardClient.tsx:3641`
- Evidence: `className="fixed … z-[60] … rounded-[18px] bg-paper-1 border border-(--hairline-card)"` with `style={{ boxShadow: "var(--shadow-e3)" }}` (3641–3642). Sibling overlay surfaces: `.card-glass` = paper-1 + 22px + e3, no border (globals.css 442–446); toasts = paper-1 + 18px + `shadow-(--shadow-e3)` class + semantic border (Toast.tsx 59).
- Impact: Three floating e3 surfaces, three recipes. The bar is closest to a toast but reaches e3 through an inline style object (invisible to a class grep of the elevation system) — exactly the drift that makes shadow audits like this one necessary. Functionally identical, but it forfeits the single-source-of-truth the tokens exist to provide.
- Fix: Swap the inline style for `shadow-(--shadow-e3)` and consider a small `.floating-bar` utility (paper-1, 18px, hairline-card, e3) shared with toasts so the overlay tier has one written recipe.

**EL-18 · LOW · effort:small — Login is the only card-glass paired with --hairline-card; all in-app modals use --line-soft**
- Where: `src/app/login/LoginClient.tsx:107`
- Evidence: `<div className="card-glass px-[34px] py-9 border border-(--hairline-card)">` vs the seven dashboard modals, all `card-glass … border border-(--line-soft)` (DashboardClient 4115, 4167, 4330, 4443, 4911, 4960, 5015). Paper values: hairline-card = rgba(33,27,18,0.08) vs line-soft = rgba(33,27,18,0.10).
- Impact: The brand's front door draws the e3 glass surface with a fainter edge than every other instance of the same class — a 2%-alpha drift no one decided on. Because card-glass deliberately owns no border, each call site re-chooses one, and login chose differently. On the lamp-lit login backdrop the softer edge slightly under-defines the card.
- Fix: Standardize on `border-(--line-soft)` for all card-glass surfaces — or better, bake `border: 1px solid var(--line-soft)` into `.card-glass` itself so the pairing can't drift again.


### Motion & animation (17)

**MO-1 · HIGH · effort:small — Quiz column animates `padding` when the Tutor panel opens — layout-property animation the motion system explicitly forbids**
- Where: `src/app/DashboardClient.tsx:3529`
- Evidence: className={`max-w-4xl mx-auto transition-[padding] ${showTutorPanel ? "xl:pr-[392px]" : ""}`} — motion.ts rules: "Only `transform` and `opacity` ever animate." globals.css even scopes default transitions to "Only compositor/paint-friendly props — never layout" (line 347-350).
- Impact: On xl screens, toggling the Tutor slide-over transitions padding-right by 392px, forcing full reflow + text re-wrap of the entire quiz column (task cards, AutoGrowTextareas, whitespace-pre-wrap question bodies) on every frame for ~200ms. This is the exact jank the system's first rule exists to prevent, on a screen where the user is mid-answer.
- Fix: Remove `transition-[padding]` (snap the gutter instantly, letting the panel's own 240ms slide carry the motion), or let the panel overlay content on xl like it already does below xl. If content must shift, animate a fixed-width sibling column via transform, never padding.

**MO-2 · HIGH · effort:medium — Mobile menu opens and closes with a raw display flip — the only fully unanimated surface in the app**
- Where: `src/app/DashboardClient.tsx:2035`
- Evidence: Sidebar: className={`${showMobileMenu ? 'flex' : 'hidden'} app-shell-sidebar md:flex ...`} and main (line 2143): `${showMobileMenu ? "hidden" : "block"}`. The aside's only animation, initial={{ x: -24, opacity: 0 }} (lines 2031-2034), plays once at page mount — on mobile it plays while the aside is display:hidden, so it is never seen.
- Impact: Tapping the hamburger swaps the entire viewport content instantly, twice (menu in, content out) — the harshest state change in the app, on the platform where the app-shell entrance was already wasted. Every accordion, chevron and toast is choreographed; the primary mobile navigation pops.
- Fix: Drive the mobile menu with AnimatePresence: enter with the system's 240ms EASE_OUT rise/fade (pageVariants-style, or a y:-8 drop from the top bar), exit 200ms EASE_IN_OUT; cross-fade the Bars3/XMark icon swap on springTactile. Keep the desktop mount slide as-is.

**MO-3 · HIGH · effort:small — Login CTA interpolates box-shadow on hover via `transition-all` — direct violation of the no-shadow-interpolation rule on the first thing a user ever touches**
- Where: `src/app/login/LoginClient.tsx:126`
- Evidence: className="... transition-all ... shadow-(--shadow-e1) hover:-translate-y-px hover:shadow-(--shadow-lift) ..." — motion.ts: "No blur transitions, no box-shadow interpolation (hover shadows cross-fade a pre-rendered layer)". globals.css builds .card-surface-elevated::after (lines 422-439) precisely to avoid this.
- Impact: The Google sign-in button — the brand's first interaction — repaints a two-layer shadow every frame of every hover, while the rest of the system meticulously cross-fades pre-rendered layers. `transition-all` also transitions width/height/padding if anything ever changes them.
- Fix: Reuse the elevated-card pattern: static shadow-e1, plus an ::after with `box-shadow: var(--shadow-lift); opacity: 0` cross-faded to 1 on hover at 200ms var(--ease-cinematic); replace `transition-all` with the explicit compositor-safe property list.

**MO-4 · HIGH · effort:medium — Interactive-mode card highlight cross-fades ring + 48px shadow through `transition-all duration-300`**
- Where: `src/app/DashboardClient.tsx:3867`
- Evidence: className={`card-surface-elevated ... transition-all duration-300 ${interactive.active && interactive.currentIndex === idx ? "!border-(--accent-border-strong) ring-[3px] ring-(--accent-wash) shadow-[0_20px_48px_-20px_...]" : interactive.active ? "opacity-50" : ""}`} — Tailwind rings are box-shadows, so every advance interpolates two large multi-layer shadows; 300ms is also not a DUR token (120/240/320).
- Impact: Each "nächste Aufgabe" in voice mode repaints giant blurred shadows on two full-width cards simultaneously with the smooth scrollIntoView — the moment most likely to stutter on an iPad, in the app's hands-free flagship feature.
- Fix: Give the card a pre-rendered ::after (ring + deep shadow) toggled via opacity, and transition only opacity/border-color at 240ms EASE_OUT. Keep the opacity-50 dimming as-is.

**MO-5 · MEDIUM · effort:small — The earned pass moment pops in raw — the result screen swaps in with zero entrance choreography**
- Where: `src/app/DashboardClient.tsx:3758`
- Evidence: ) : gradingResult ? (<div className="space-y-5"> — a bare conditional swap from the isGrading card. Only the thread animates: motion.div initial={{ scaleX: 0 }} ... delay: 0.2 (lines 3806-3809). motion.ts's own charter: "motion explains state changes and rewards completion", and globals.css reserves the accent for "the earned pass moment".
- Impact: After a minute of watching examiners deliberate, the verdict — the single most earned screen in the app — appears more abruptly than a tab switch. The pill, the display-serif "Level N, unlocked.", the brief card and buttons all pop; the thread draws under content that just materialized.
- Fix: Stagger the reveal: wrap the result in staggerContainer with riseChild on verdict pill → headline → date line → brief card (30ms stagger, 240ms EASE_OUT), pill scaling in on springTactile, and keep the 1s thread draw as the finale (delay ≈ 0.35s). Failure path gets the same rise minus the thread.

**MO-6 · MEDIUM · effort:small — Stats heatmap staggers 26 columns at 35ms with 500ms fades — ignores the system's 30ms/cap-~8 stagger rule**
- Where: `src/app/components/StatsPanel.tsx:511`
- Evidence: transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 + w * 0.035 }} for 26 week columns → last column starts at 1.03s, finishes ~1.5s. motion.ts: "Enter 240ms EASE_OUT rise 8px, stagger 30ms (cap ~8 items)." The module bars (line 561) and forecast bars (line 594) correctly cap with Math.min(i, 8) but also use off-token duration 0.5; the heatmap's y:6 offset is a third rise value alongside the system's 8 and 10.
- Impact: The activity chart is still trickling in a second and a half after the rest of the stats page has settled — the longest uninterruptible entrance in the app, replayed on every visit to the tab and on every semester-filter change of mounted state.
- Fix: Cap the wave: delay: 0.15 + Math.min(w, 8) * 0.03 (or reveal in 4-column groups), duration DUR.gentle (0.32), rise y:8. Align the bar charts' 0.5s durations to DUR.gentle while there.

**MO-7 · MEDIUM · effort:small — Floating voice-mode control bar has no exit animation — springs in, blinks out**
- Where: `src/app/DashboardClient.tsx:3636`
- Evidence: {interactive.active && createPortal(<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} ... />, document.body)} — conditional render outside any AnimatePresence, so exit props would be ignored anyway.
- Impact: Pressing Stop (or finishing the last task) makes the fixed bottom bar vanish in one frame after it arrived on a soft spring — an asymmetry you feel every single voice session, on the element closest to the user's thumb.
- Fix: Wrap the portal content in <AnimatePresence>{interactive.active && ...}</AnimatePresence> and add exit={{ opacity: 0, y: 16, transition: { duration: 0.16, ease: EASE_IN } }}.

**MO-8 · MEDIUM · effort:small — Scribble pad appears/disappears with no motion inside a card where every other disclosure uses the accordion**
- Where: `src/app/DashboardClient.tsx:3942`
- Evidence: {scribbleEnabled && openScribbles[task.id] && (<div className="mt-3 -mx-[12px] md:-mx-[16px]"><ScribbleCanvas ... /></div>)} (same for the free-answer pad, lines 4048-4060, heightPx={420}) — a raw conditional, while the materials disclosure three components up animates with `variants={accordion}` (line 2422).
- Impact: Toggling "Scribble" slams a 340-420px canvas into the card, shoving the submit button and following tasks down instantly — the largest unanimated layout shift in the app, right next to the system's most polished accordions.
- Fix: Wrap the pad in AnimatePresence initial={false} with the shared `accordion` variants (height/opacity, overflow hidden), exactly like the materials chips row.

**MO-9 · MEDIUM · effort:small — Snooze pills and delete-confirm buttons animate in on springTactile but pop out on disarm**
- Where: `src/app/DashboardClient.tsx:2315`
- Evidence: motion.div initial={{ opacity: 0, scale: 0.9, y: -4 }} animate ... transition={springTactile} (snooze, 2315-2318) and motion.button initial={{ opacity: 0, scale: 0.92 }} (delete confirm, 2393-2396) — both plain conditionals with no AnimatePresence, and both auto-disarm via timers: setTimeout(() => setSnoozeArmedId(null), 5000) / setConfirmingDeleteId(null), 4000 (lines 1193-1207) and on Escape (1182-1184).
- Impact: The +1/+3/+7 pills and "Really delete?" chip vanish in one frame when the timer fires, Escape is pressed, or an option is chosen — and the clock/trash icon they replace snaps back with no counterpart to its entrance. Enter/exit asymmetry on interactions used daily.
- Fix: Wrap each swap in <AnimatePresence mode="popLayout" initial={false}> and give the armed state exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12, ease: EASE_IN } }}; the idle icon re-enters with its existing spring.

**MO-10 · MEDIUM · effort:small — Tutor slide-over closes with the entrance curve — EASE_OUT on exit instead of the system's close easing**
- Where: `src/app/components/TutorPanel.tsx:295`
- Evidence: initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} transition={{ duration: 0.24, ease: EASE_OUT }} — one shared transition, so the exit decelerates. motion.ts: "Move/close 200ms EASE_IN_OUT" and "easeInExpo — exits accelerate cleanly away."
- Impact: The panel leaves the way it arrived — fast start, long lazy settle at the edge — which reads as hesitation instead of a clean dismissal. Felt on every quiz (the panel is force-closed on each startQuiz).
- Fix: exit={{ x: 24, opacity: 0, transition: { duration: 0.2, ease: EASE_IN_OUT } }} (or EASE_IN), keeping the 240ms EASE_OUT entrance.

**MO-11 · MEDIUM · effort:small — Due cards — the app's primary tap target — hover-lift but have no press state**
- Where: `src/app/DashboardClient.tsx:2295`
- Evidence: motion.div variants={riseChild} whileHover={{ y: -1 }} transition={springSoft} onClick={() => startQuiz(review)} — no whileTap, no .press-row. motion.ts's own hoverLift pairs them: `whileHover: { y: -1 }, whileTap: { scale: 0.985 }`, and globals.css §"Press states (CRAFT.md §5)" gives every other pressed surface feedback.
- Impact: Clicking the "Heute fällig" card — the action the whole app funnels toward — gives zero acknowledgment between press and the 360ms tab transition; on touch (where hover doesn't exist) the card is completely inert until the screen changes.
- Fix: Spread the existing hoverLift preset ({...hoverLift}) instead of the bare whileHover, or add whileTap={{ scale: 0.985 }}. Consider the same for the "Demnächst" rows (line 2517), which have hover:bg but no .press-row.

**MO-12 · LOW · effort:small — Quiz task cards enter with a 20px rise stacked on the page's 8px rise — the largest and least systematic offset in the app**
- Where: `src/app/DashboardClient.tsx:3864`
- Evidence: initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 8) * 0.03, ... }} inside the quiz tab's motion.div using pageVariants (initial y:8). The children animate independently of the parent, so both rises compound (~28px composite). System offsets are 8 (riseChild) and 10 (fadeRise).
- Impact: Opening a quiz feels noticeably 'travellier' than every other screen — cards float up nearly 3x the system distance while the page itself is also rising, a subtle double-motion the other tabs don't have.
- Fix: Make the cards variant children of the page container (variants={riseChild}, inheriting the 30ms stagger) or at least reduce to fadeRise's y:10. The stagger cap Math.min(idx, 8) is already correct — keep it.

**MO-13 · LOW · effort:small — Pipeline step indicators: only the 'done' check animates — idle→active pops, and mode="wait" is inert on non-motion children**
- Where: `src/app/DashboardClient.tsx:2646`
- Evidence: <AnimatePresence mode="wait">{progressStep > step ? (<motion.span key="done" initial={{ scale: 0.5, opacity: 0 }} ... transition={springTactile}>) : progressStep === step ? (<span key="active" className="ember-dot ...">) : (<div key="idle" ... />)}</AnimatePresence> — 'active' and 'idle' are plain span/div, so they get no enter/exit and the wait mode has nothing to wait for. Duplicated at the grading steps (lines 3727-3737).
- Impact: As the upload/grading pipeline advances, the amber 'now running' ring — the state the user is actually watching for — snaps in with no transition while the completed check pops satisfyingly, making the sequence feel half-finished.
- Fix: Promote all three states to motion.span with a shared { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.6, opacity: 0 } } on springTactile; then mode="wait" earns its keep.

**MO-14 · LOW · effort:medium — 'Collapse all' animates every nested accordion's height simultaneously — the one case the height-animation exemption excludes**
- Where: `src/app/DashboardClient.tsx:1307`
- Evidence: toggleAllLibrary clears both sets at once: setExpandedLibrarySemesters(new Set()); setExpandedLibraryModules(new Set()); — every semester body (line 2983) and every module body inside it (line 3084) then runs `variants={accordion}` height animations concurrently. motion.ts's own caveat: "framer `height:\"auto\"` is fine for these small panels" — a whole library tree is not a small panel.
- Impact: On a real library (several semesters × modules), one click triggers dozens of nested height interpolations, each forcing layout per frame inside an already-animating parent — visible stutter exactly when the user asks for a tidy sweep.
- Fix: When toggling all, collapse only the top level with animation and let inner accordions unmount instantly (pass a `disableAnimation` that swaps variants for {duration:0} / renders without motion), or stagger semesters by 30ms so at most one tree animates at a time.

**MO-15 · LOW · effort:small — Uploaded-file chips appear and disappear with no motion in an otherwise fully-transitioned upload flow**
- Where: `src/app/DashboardClient.tsx:2747`
- Evidence: {uploadedFiles.length > 0 && (<div className="flex flex-wrap gap-2 mb-4">{uploadedFiles.map((file, idx) => (<div key={file.name} ...>)}</div>)} — plain conditional list; removal via setUploadedFiles(prev => prev.filter(...)) (line 2756) reflows neighbors instantly. The drop-zone highlight beside it transitions (line 2701), the progress card animates every step.
- Impact: Dropping files or removing one makes chips blink in/out and the row snap-reflow — a small but repeated cheap moment at the very start of the app's core 'lecture → quiz' journey.
- Fix: AnimatePresence mode="popLayout" + layout on each chip: enter { opacity: 0, scale: 0.92 } → springTactile, exit { opacity: 0, scale: 0.92, duration: 0.12 }; surviving chips glide into place via the layout animation.

**MO-16 · LOW · effort:small — JS smooth scrolling ignores prefers-reduced-motion — voice mode auto-scrolls animatedly for reduce-motion users**
- Where: `src/app/DashboardClient.tsx:710`
- Evidence: document.getElementById(`iq-${interactive.currentIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); and window.scrollTo({ top: 0, behavior: "smooth" }) (line 1526). The globals.css guard `scroll-behavior: auto !important` (line 935) only overrides CSS scroll-behavior — an explicit JS `behavior: "smooth"` option still animates. Framer is covered (MotionConfig reducedMotion="user", line 1949); this is the one gap.
- Impact: Users who asked the OS for no motion still get repeated animated centering on every dictated task advance — precisely the vestibular-trigger category (large full-viewport scroll) reduced-motion exists for.
- Fix: const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches; …scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" }) — same for the startQuiz scrollTo.

**MO-17 · LOW · effort:small — Stats skeleton carries an animationDelay with no animation — vestigial shimmer that never fires**
- Where: `src/app/components/StatsPanel.tsx:325`
- Evidence: <div key={i} className="card-surface p-5" style={{ animationDelay: `${i * 120}ms` }}> — no animation/animate-* class anywhere on the element; the dashboard skeleton (DashboardClient.tsx line 2217) is deliberately "static paper blocks, no shimmer" and carries no such style.
- Impact: Dead motion code: either a pulse was designed and lost (the skeleton reads flatter than intended) or the delay is noise — a perfectionist's system file shouldn't leave the question open. Also note the 120ms step wouldn't match the 30ms stagger rule if the animation ever returned.
- Fix: Delete the style prop to match the intentional static-skeleton stance — or, if a breathing skeleton is wanted, add a shared opacity pulse (0.6→1, 1.2s ease-in-out, reduced-motion-guarded) and keep delays at i * 30ms.


### Interaction states & affordances (18)

**IN-1 · HIGH · effort:small — Primary tap targets (due cards, upcoming rows, sidebar nav) have no press/active state despite the system mandating one and suppressing native tap highlight**
- Where: `src/app/DashboardClient.tsx:2295`
- Evidence: Due card: `whileHover={{ y: -1 }} transition={springSoft}` — no whileTap, even though motion.ts's own hoverLift (src/lib/motion.ts:136-140) pairs `whileHover: { y: -1 }` with `whileTap: { scale: 0.985 }`. Upcoming rows (L2517-2520): `onClick={() => startQuiz(review)} className="…cursor-pointer hover:bg-(--paper-hover)…"` — no `.press-row`, while the visually identical library lecture rows DO use it (L3107 `…transition-colors press-row`). Sidebar nav (L2050) uses `nav-item-idle` which defines only a hover (globals.css:686-691) and no `:active`. Meanwhile globals.css:300-301 sets `-webkit-tap-highlight-color: transparent; /* Cleaner touch feedback (we style our own :active states). */` and CRAFT §5 (globals.css:774-787) mandates scale 0.97/0.985 or `.press-row` darken.
- Impact: On phones/tablets (Tailwind v4 gates all `hover:` utilities behind hover-capable pointers) tapping the app's single most important element — a due review card — or any nav item produces zero visual acknowledgment before navigation. The app feels unresponsive at exactly its hero moment, and directly contradicts its own comment 'we style our own :active states'.
- Fix: Add `whileTap={{ scale: 0.985 }}` (or spread `hoverLift`) to the due-card motion.div; add `press-row` to the Upcoming rows (matching library rows); add a `.nav-item-idle:active / .nav-item-active:active { background: … }` or `transform: scale(0.985)` rule to globals.css.

**IN-2 · HIGH · effort:medium — Review-starting cards and rows are click-only <div>s — no button semantics, no keyboard access**
- Where: `src/app/DashboardClient.tsx:2298`
- Evidence: Due card is `<motion.div … onClick={() => startQuiz(review)} className="card-surface-elevated group cursor-pointer…">` (L2292-2299) and each Upcoming row is `<div onClick={() => startQuiz(review)} className="grid…cursor-pointer…">` (L2517-2520). Neither has role="button", tabIndex, or onKeyDown. The only keyboard path into a quiz is the global Enter shortcut, which starts `upcomingReviews.find(r => r.isDue)` — the FIRST due item only (L1925-1931).
- Impact: Keyboard users cannot start the 2nd due review or any scheduled review at all; focus-visible styling the system carefully built (globals.css:354-357) never applies because the elements can't receive focus. Screen readers announce the card as plain text.
- Fix: Make the card header/row a real <button> (the footer already stopPropagations, so nesting is avoidable by putting the button on the title region), or add role="button", tabIndex={0}, and Enter/Space key handling to both.

**IN-3 · HIGH · effort:small — Delete-lecture button is invisible but still tappable on touch devices ≥640px (iPad)**
- Where: `src/app/DashboardClient.tsx:2408`
- Evidence: `className="btn-ghost-icon w-8 h-8 … sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 … cursor-pointer transition-opacity"`. Tailwind v4 compiles `group-hover:` inside `@media (hover: hover)`, so on an iPad (viewport ≥ sm, no hover pointer) the button is permanently `opacity-0` — yet it keeps its 32px hit area and arms the destructive 'Wirklich löschen?' confirm when tapped.
- Impact: Touch users on tablets either can never find the delete affordance, or worse, tap an invisible area next to the chevron and get a red 'Really delete?' pill appearing from nowhere. Hover-only reveal of a destructive control with no touch fallback.
- Fix: Show the button by default on non-hover devices: replace `sm:opacity-0 sm:group-hover:opacity-100` with a hover-capability-scoped hide, e.g. custom variant `[@media(hover:hover)]:sm:opacity-0 [@media(hover:hover)]:sm:group-hover:opacity-100`, keeping `focus-visible:opacity-100`.

**IN-4 · HIGH · effort:small — Grading-model <select> has no visible keyboard focus state (globally suppressed, never restored)**
- Where: `src/app/DashboardClient.tsx:3984`
- Evidence: The quiz model picker uses `className="btn-secondary sm:w-[200px] h-12 … appearance-none …"` (also L4066). globals.css:358-362 kills the outline for all selects: `input:focus-visible, textarea:focus-visible, select:focus-visible { outline: none; }` with the comment 'Inputs keep their ring' — but the ring only exists on `.input-dark:focus` (globals.css:556-559). `.btn-secondary` (globals.css:507-524) defines no :focus style, so this select has NO focus indicator at all. Bonus drift: the identical control on the upload tab is styled `input-dark h-[52px]` (L2780) — same picker, two different visual identities and heights.
- Impact: Tabbing to the model select before submitting a quiz shows nothing — a broken state in the matrix, violating the system's own CRAFT §2 'keyboard-only focus: accent outline' rule. The upload/quiz inconsistency also reads as visual drift for the same control.
- Fix: Give both model pickers one shared style (input-dark), or add `.btn-secondary:focus-visible { border-color: var(--accent-border-strong); box-shadow: 0 0 0 3px var(--accent-ring); }`.

**IN-5 · MEDIUM · effort:small — Module dropdown removes the native arrow and provides no replacement — a <select> disguised as a text field**
- Where: `src/app/DashboardClient.tsx:2674`
- Evidence: `<select value={subjectInput} … className="input-dark w-full h-12 px-4 appearance-none cursor-pointer">` — `appearance-none` with no chevron. The model select 80 lines below explicitly paints one: `appearance-none bg-[url('data:image/svg+xml…M5 8l5 5 5-5…')] bg-no-repeat bg-[position:right_1rem_center]` (L2780).
- Impact: The first field of the upload flow gives zero affordance that it opens a menu — it looks exactly like the read-only 'No modules defined' div that renders in its place when empty (L2681). Users with one preset may never discover they can switch modules.
- Fix: Add the same data-URI chevron background used by the model selects (extract it to a shared `select-chevron` utility class since it's now needed in three places).

**IN-6 · MEDIUM · effort:small — File picker is unreachable by keyboard: display:none input + label styled as a button**
- Where: `src/app/DashboardClient.tsx:2742`
- Evidence: `<input type="file" … className="hidden" id="file-upload" …/>` (L2725-2741) followed by `<label htmlFor="file-upload" className="btn-secondary px-4 py-2 text-sm cursor-pointer">Browse Files</label>`. `hidden` = display:none, which removes the input from the tab order; a <label> is not focusable and receives no focus-visible outline.
- Impact: Keyboard-only users cannot upload files at all (the drop zone is drag-only). The 'Browse Files' control also never shows the system's accent focus ring.
- Fix: Replace `className="hidden"` with `className="sr-only"` so the input stays focusable, and style label focus via `input:focus-visible + label`/`peer-focus-visible` — or use a real <button> that calls `inputRef.current.click()`.

**IN-7 · MEDIUM · effort:small — Server-backed segmented controls (language, AI connection, PDF delivery) show no feedback until the round-trip completes**
- Where: `src/app/DashboardClient.tsx:4646`
- Evidence: Language switch: `onClick={() => { fetch('/api/settings', …).then(res => res.json()).then(data => { … if (data.language) setLanguage(data.language); }) }}` — `data-active` only flips after the POST resolves (same pattern for wrapperMode L4740-4806 and fileTransport via updateFileTransport L665-680). Contrast: the dictation segment right above updates instantly (`updateDictationMode` sets state synchronously, L659-662).
- Impact: On a slow connection tapping 'English' does nothing for a second or more — no pressed state, no spinner, no optimistic highlight. Users click again; the control feels broken. Inconsistent feel between adjacent, identical-looking segments in the same modal.
- Fix: Optimistically set the local state on click and revert on error (a toast already exists for the failure path), or at minimum render the clicked item in a pending style (e.g. reduced-opacity active) until the response lands.

**IN-8 · MEDIUM · effort:small — Comprehension-check chip morphs into a spinner + live streaming text — the button resizes continuously while loading**
- Where: `src/app/DashboardClient.tsx:3283`
- Evidence: `{compGen?.itemId === item.id ? (<><ArrowPathIcon className="w-3.5 h-3.5 animate-spin"/><span className="max-w-[260px] truncate">{compGen.message}</span></>) : (<><SparklesIcon …/>{…"Start check"}</>)}` — compGen.message is replaced by each NDJSON progress event (L1848-1851), so the chip jumps from ~110px to up to ~300px and re-wraps the surrounding flex row on every progress tick.
- Impact: The library detail panel visibly reflows repeatedly during the ~30s generation; the neighboring result badge and date shift around. Violates the 'loading buttons preserve width' craft rule.
- Fix: Freeze the chip at its idle width (spinner replaces the icon, label stays 'Starting…'), and render the streaming progress message as a separate quiet line below the chip row.

**IN-9 · MEDIUM · effort:medium — Edit-mode module delete is a role="button" span nested inside the module-header <button> — invalid and keyboard-dead**
- Where: `src/app/DashboardClient.tsx:3068`
- Evidence: The module header is `<button onClick={…toggle…} className="w-full …">` (L3001-3007) and inside it edit mode renders `<span role="button" aria-label="Modul entfernen" onClick={(e) => handleDeleteLibraryModule(…)} className="…cursor-pointer…active:scale-90">` (L3057-3075). No tabIndex, no key handler; nested interactive content inside a <button> is invalid HTML. The armed confirm state (L3057-3065) also drops the `active:scale-90` press its idle sibling has.
- Impact: Keyboard users can never delete a module (Enter on the row just toggles the accordion); screen readers get a button-inside-button announcement. The confirm pill loses press feedback exactly at the destructive step.
- Fix: Restructure the header row so the toggle and the delete control are sibling buttons inside a div (the row is already `w-full flex`), making the delete a real <button> with the same classes.

**IN-10 · MEDIUM · effort:small — One Escape press closes two layers when the Tutor panel is open behind a modal**
- Where: `src/app/components/TutorPanel.tsx:127`
- Evidence: TutorPanel registers its own listener: `const onKey = (e) => { if (e.key === "Escape") onClose(); }` (L125-132) with no awareness of overlays, while DashboardClient's global Escape handler (L1172-1188) closes the topmost modal and returns. Both listeners fire on the same keydown: with the settings modal (or feedback/prompt modal) open above an open tutor panel, Esc closes the modal AND the tutor panel simultaneously.
- Impact: The layered-dismissal model the app carefully ordered by z-index ('closes whichever overlay is on top') breaks: users lose their tutor chat pane (and its slide-out position) when they only meant to dismiss the settings sheet.
- Fix: In TutorPanel's handler, ignore Escape if a higher overlay exists (e.g. check `e.defaultPrevented` and have the global handler call `preventDefault()`, or lift tutor-close into the global ordered chain).

**IN-11 · MEDIUM · effort:small — Multiple touch targets far below 44px: toast dismiss ~20px, tutor TTS 24px, file-chip remove 28px, snooze pills 28px**
- Where: `src/app/components/Toast.tsx:73`
- Evidence: Toast close: `className="shrink-0 … cursor-pointer p-0.5"` around a `w-4 h-4` icon = 2+16+2 = 20px square. TutorPanel speak button `w-6 h-6` = 24px (TutorPanel.tsx:379). Upload file-chip remove `w-7 h-7` = 28px (DashboardClient.tsx:2758). Snooze pills `h-7 px-2.5` = 28px tall and auto-dismiss after 5s (DashboardClient.tsx:2327). Sign-out `w-9 h-9` = 36px (L2131).
- Impact: On phones, dismissing an error toast or hitting a time-limited snooze pill is a precision task; missing the 20px toast X taps whatever is underneath. All are below both Apple's 44pt and the prompt's own 44px bar.
- Fix: Grow hit areas without visual change using padding + negative margin (e.g. toast close `p-2.5 -m-2`, TTS button `w-6 h-6` visual inside a `p-2 -m-2` wrapper), and make snooze pills `h-9`.

**IN-12 · MEDIUM · effort:small — Push-notification toggle: switch visual without switch semantics, and no busy state through a multi-second async flow**
- Where: `src/app/DashboardClient.tsx:2074`
- Evidence: `<button onClick={togglePush} className="flex items-center gap-3 h-[38px] px-3 cursor-pointer nav-item-idle">…<span className="w-7 h-[17px] rounded-full…">` — a painted track/knob but no `role="switch"`/`aria-checked`, no disabled/pending state. `subscribeToPush` (L803-858) awaits permission prompt + `navigator.serviceWorker.ready` + a network POST; during that whole time the knob sits still and the button stays clickable (re-entrant taps start parallel subscribe flows).
- Impact: Tapping the toggle appears to do nothing for seconds (especially on iOS PWA), inviting double-taps; assistive tech announces a plain button with no on/off state despite the visible switch.
- Fix: Add role="switch" aria-checked={pushSubscribed}, a `pushBusy` state that disables the button and shows the knob in an intermediate position (or a small spinner), set on entry to togglePush.

**IN-13 · MEDIUM · effort:small — Toggle/segmented buttons lack aria-pressed — inconsistently, since StatsPanel's own filter chips set it**
- Where: `src/app/DashboardClient.tsx:4663`
- Evidence: Every `.segmented-item` conveys selection only via `data-active={language === 'german'}` (also dictation L4703-4717, wrapper L4757-4803, fileTransport L4828-4836); the Tutor toggle (L3583-3590), scribble toggles (L3909-3924), theme cards and accent swatches (L4481-4525, L4539-4555) likewise expose no pressed/selected state. Meanwhile StatsPanel does it right: `aria-pressed={semesterFilter === "all"}` (StatsPanel.tsx:436, 446).
- Impact: Screen-reader users can't tell which theme, accent, language, or dictation mode is selected, or whether the Tutor panel is open — while the one control in StatsPanel behaves properly, making it an internal consistency break, not just an a11y gap.
- Fix: Add `aria-pressed` (toggles) or `role="radiogroup"`+`role="radio"`/`aria-checked` (segmented, theme, accent) mirroring the existing data-active conditions.

**IN-14 · MEDIUM · effort:small — Modal close buttons: four different treatments, two with dead hover (`bg-paper-2 hover:bg-paper-2`)**
- Where: `src/app/DashboardClient.tsx:4122`
- Evidence: Archive modal close: `rounded-full bg-paper-2 hover:bg-paper-2` (L4122) — hover background is a literal no-op; same in the feedback modal (L4178) and prompt viewer (`rounded-lg bg-paper-2 hover:bg-paper-2`, L5037). Prompts-list and comp-feedback use `rounded-[10px] text-ink-400 hover:bg-(--hairline)` (L4921, L4983); settings uses `p-2 hover:bg-paper-2 rounded-full` from transparent (L4458); calendar close is bare `p-2` with color change only (L4338). The tutor page's back link repeats the pattern: `bg-paper-2 … hover:bg-paper-2` (src/app/tutor/[id]/page.tsx:55).
- Impact: The same element — 'close this sheet' — has four shapes/behaviors across sibling modals, and in three places the hover state literally does nothing (only the icon color shifts), which reads as a bug on a system that prides itself on state discipline.
- Fix: Extract one `.modal-close` recipe (e.g. the prompts-list variant: transparent → hover:bg-(--hairline), rounded-[10px], w-8 h-8) and use it in all six modals + the tutor page link (fix its hover to `hover:bg-(--paper-hover)` or similar).

**IN-15 · LOW · effort:small — Accordion/disclosure toggles never set aria-expanded (only the mobile menu button does)**
- Where: `src/app/DashboardClient.tsx:2355`
- Evidence: Materials disclosure (L2355-2370), library semester header (L2952-2958), module header (L3001-3007), lecture row (L3101-3107), and history entries (L4234-4241) are all <button>s that animate a chevron but carry no `aria-expanded`. The only instance in the app is the mobile menu: `aria-expanded={showMobileMenu}` (L2017).
- Impact: Assistive tech hears 'button' with no open/closed state on five different accordion levels; the one correct usage shows the team knows the pattern — this is drift.
- Fix: Add `aria-expanded={materialsOpen}` / `{semOpen}` / `{modOpen}` / `{itemOpen}` / `{isOpen}` to each toggle (the boolean is already in scope at every call site).

**IN-16 · LOW · effort:medium — Heatmap cells and chart bars expose their data only via hover tooltips on non-focusable divs**
- Where: `src/app/components/StatsPanel.tsx:517`
- Evidence: `<Tip …><div className={"heat-cell w-[13px] h-[13px]…"} /></Tip>` — Tip shows on mouseenter/focus (Tooltip.tsx:65-69), but the cell is a div with no tabIndex, so keyboard focus never happens and touch has no path at all. Same for forecast bars (L583) and level-distribution bars (L629). The `.heat-cell:hover` ink outline (globals.css:789-792) is likewise hover-only.
- Impact: On phones — a primary context for a study app — per-day review counts, forecast numbers are partially visible (bars have labels) but heatmap day values are completely unreachable; keyboard users get nothing anywhere.
- Fix: Cheapest: add a visually-hidden text summary per cell or make cells focusable (tabIndex={0}) so Tip's onFocus path fires; alternatively show the hovered/tapped day's value in a fixed caption line under the heatmap (tap = set state).

**IN-17 · LOW · effort:small — Two competing auto-reset timers (4s and 5s) for the semester danger-zone confirms — the 5s one is dead code**
- Where: `src/app/DashboardClient.tsx:1431`
- Evidence: L1213-1220 resets `confirmingNewSemester/confirmingResetSemester` after 4000ms; L1431-1438 registers a second effect doing the identical reset after 5000ms. Both watch the same deps, so the 4s timer always fires first and the 5s effect never has an observable effect. Armed windows also differ across the app: delete confirms 4000ms (L1193), snooze pills 5000ms (L1207).
- Impact: Maintenance trap plus an inconsistent 'grace period' rhythm: identical two-step confirms give users 4s in one place and 5s in another for no reason.
- Fix: Delete the duplicate effect at L1431-1438 and standardize a single ARM_TIMEOUT_MS (e.g. 5000) constant used by all four confirm timers.

**IN-18 · LOW · effort:small — Disabled-cursor language is inconsistent: cursor-default (Scribble) vs cursor-not-allowed (system) vs cursor-wait (busy)**
- Where: `src/app/components/ScribbleCanvas.tsx:238`
- Evidence: Scribble Undo/Clear: `disabled:opacity-40 disabled:cursor-default` (L238, L246). The design system's own baseline is `.btn-primary:disabled { cursor: not-allowed; }` (globals.css:502-505), and busy buttons elsewhere deliberately use `disabled:cursor-wait` (e.g. snooze L2339, comprehension chip L3281). The Scribble pair is the only interactive control that dims without signalling 'not allowed'.
- Impact: A perfectionist detail: hovering a disabled Undo reads as an inert label rather than a temporarily unavailable action, breaking the cursor vocabulary the rest of the app maintains (not-allowed = can't, wait = busy).
- Fix: Change both buttons to `disabled:cursor-not-allowed` to match the system baseline.


### Layout, spacing & alignment (20)

**LA-1 · HIGH · effort:small — Tutor slide-over animates the quiz column via transition-[padding] — a layout animation that violates the app's own motion law**
- Where: `src/app/DashboardClient.tsx:3529`
- Evidence: className={`max-w-4xl mx-auto transition-[padding] ${showTutorPanel ? "xl:pr-[392px]" : ""}`} — while src/lib/motion.ts (lines 9–10) states the system rule: "Only `transform` and `opacity` ever animate. No blur transitions, no box-shadow interpolation." Even the global base transitions (globals.css 346–351) deliberately whitelist "Only compositor/paint-friendly props — never layout".
- Impact: Toggling the tutor on xl screens reflows and re-wraps the entire quiz column (multi-paragraph question text, textareas) on every frame for 200ms — visible text re-ragging and main-thread jank at the exact moment the user asks for help. It is the single place in the app that animates layout, and it contradicts the documented motion contract.
- Fix: Don't animate padding. Either (a) let the panel overlay without pushing (it already does below xl), or (b) wrap the quiz column in a transformed container and animate translateX(-196px) with springSoft while reserving the space statically, or (c) use framer-motion layout on the container so it FLIPs via transform. Remove transition-[padding].

**LA-2 · HIGH · effort:medium — The seven modals have no shared spatial contract: three height caps, three body paddings, two header paddings, and two of them dock to the bottom on phones while five stay centered**
- Where: `src/app/DashboardClient.tsx:4952`
- Evidence: Height caps: max-h-[85dvh] (archive 4115, feedback 4167), max-h-[90dvh] (calendar 4330, settings 4443), max-h-[80dvh] (prompts 4911, comp-feedback 4960, prompt viewer 5015). Mobile anchoring: comp-feedback (4952) and prompt viewer (5008) use "items-end sm:items-center" while archive (4108), feedback (4160), calendar (4324), settings (4437) use "items-center". Headers: "p-6" (4117, 4170) vs "px-6 py-5" (4913, 4962, 5018). Bodies: p-6 (4128), p-6 md:p-8 (4209), p-4 (4927), p-6 md:p-7 (4989), p-6 (5045).
- Impact: Opening different modals feels like visiting different apps: on a phone two dialogs slide up as near-bottom-sheets (still floating 16px above the edge with full 22px radii, so they read as misplaced cards, not sheets) while the rest center; header heights and inner air visibly differ between the feedback brief and the prompt viewer even though they are sibling document viewers.
- Fix: Define one modal recipe: items-center everywhere (or a real bottom-sheet variant with squared bottom corners and w-full below sm), a single max-h-[85dvh], header px-6 py-5, body p-6 md:p-8. Encode it as a shared ModalShell component or .modal-* utilities in globals.css so drift can't recur.

**LA-3 · HIGH · effort:medium — No card inner-padding scale — nine card types use eight different padding recipes, several hand-tuned to off-grid values**
- Where: `src/app/DashboardClient.tsx:3867`
- Evidence: Quiz task card: "card-surface-elevated p-[22px] md:px-[26px]" (3867 — 22px vertical, 26px horizontal on md). Due card: "pl-[26px] pr-5 pt-[18px] pb-4" (2299 — 26/20/18/16). Upload form: "p-5 md:p-8" (2663). Free-quiz card: "p-5 md:p-7" (4015). Result card: "p-7 md:p-8" (3760). Right-rail cards: "p-5" (2549). Sidebar promo: "p-4" (2095). Stats cards: "p-5 md:px-6 md:py-[22px]" (StatsPanel.tsx 486).
- Impact: Cards that sit on the same screen breathe differently for no hierarchical reason — e.g. the free-quiz card gets p-7 on md while the structured task cards get 22/26px, and the result card gets p-8; the eye registers the rhythm change even if the user can't name it. This is the largest source of 'almost right' feel across every tab.
- Fix: Adopt a three-step card padding scale and map every card onto it: compact p-4 (16), standard p-5 (20), roomy p-6 md:p-8 (24/32). Kill the one-off 18/22/26px values (the due card's 26px left already includes the 3px thread — make it pl-6 with the thread inside the 24px gutter).

**LA-4 · MEDIUM · effort:small — Mobile top bar, its flow spacer, and the hardcoded 61px sidebar offset are three disagreeing heights**
- Where: `src/app/DashboardClient.tsx:2026`
- Evidence: The fixed bar (2008) row height is set by the menu button "p-2 -mr-2" + "w-6 h-6" icon = 40px, so the bar is 40+12(pt)+12(pb)+1(border) ≈ 65px. The spacer (2026–2028) replicates the paddings but its content is "<div className=\"h-7\"></div>" = 28px, totalling ≈52px — 13px short. The sidebar (2035) assumes yet another number: "min-h-[calc(100dvh_-_61px)]".
- Impact: On every phone view the page content starts ~13px higher than designed (the intended 32px of top air under the bar collapses to ~19px, and content scrolls under the translucent bar sooner than it should), and the open mobile menu is ~4px taller than the viewport, giving a dead rubber-band scroll.
- Fix: Give the bar a deterministic height: put h-10 on the bar's flex row and the spacer's inner div (or extract one BAR_H constant used by bar, spacer, and the sidebar calc), and derive the sidebar min-h from the same value including the border.

**LA-5 · MEDIUM · effort:small — Success/error toasts ignore the safe area while the undo stack ten lines away handles it — toasts sit behind the iPhone home indicator**
- Where: `src/app/components/Toast.tsx:49`
- Evidence: Card toasts: "fixed bottom-5 right-5 z-[100] …" (line 49). Undo toasts in the same component: "fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 …" (line 84). The app explicitly targets standalone iOS PWA (layout.tsx sets viewportFit: "cover" and black-translucent status bar; push setup even instructs Add to Home Screen).
- Impact: In the installed PWA — the app's flagship mobile mode — every success/error toast renders 20px from the physical bottom edge, overlapping the 34px home-indicator zone; the dismiss X becomes hard to tap and the card looks cropped by the gesture bar. The inconsistency inside one 116-line file shows the safe-area fix was applied to one stack and forgotten on the other.
- Fix: Change line 49 to bottom-[max(1.25rem,env(safe-area-inset-bottom))] and right-[max(1.25rem,env(safe-area-inset-right))] to also cover landscape notches.

**LA-6 · MEDIUM · effort:small — text-ink-500 doesn't exist in the token set — passed interval labels fall back to near-black, inverting the stepper's visual hierarchy**
- Where: `src/app/DashboardClient.tsx:3241`
- Evidence: className={`… ${current ? "text-(--accent-text-strong) font-semibold" : passed ? "text-ink-500 font-medium" : "text-ink-300 font-medium"}`} — but globals.css @theme (lines 31–34) defines only --color-ink-900/600/400/300. Tailwind 4 emits nothing for the unknown utility, so passed labels inherit body color (--foreground = ink-900).
- Impact: In the library's level timeline, the T1/T3/T7 labels of already-passed levels render darkest of all (full ink-900 at 9px), visually louder than the accent-colored 'current' label they should defer to. The intended passed > pending, current > passed ramp reads backwards.
- Fix: Use the existing mid step: text-ink-600 (or add a real --color-ink-500 to @theme if a step between 600 and 400 is wanted). One-token fix, both themes inherit it.

**LA-7 · MEDIUM · effort:small — Five tabs, four content max-widths (980 / 768 / 1024 / 896 / 1024) — the identical header block jumps horizontally on every tab switch**
- Where: `src/app/DashboardClient.tsx:2152`
- Evidence: dashboard: "max-w-[980px] mx-auto" (2152), upload: "max-w-3xl mx-auto" (2599), library: "max-w-5xl mx-auto" (2813), stats: "max-w-5xl mx-auto" (3505), quiz: "max-w-4xl mx-auto" (3529). All five open with the same eyebrow + font-display text-[34px] header pattern.
- Impact: Because content is centered, every tab change moves the shared header pattern to a new left edge (dashboard→library shifts 22px, dashboard→upload shifts 106px). With AnimatePresence mode="wait" the shift happens between fade-out and fade-in, so the page appears to re-anchor itself on each navigation — the shell feels less solid than it is. 980px is also the only off-scale value.
- Fix: Pick two widths with intent: a reading width (max-w-3xl) for upload/quiz forms and one app width (max-w-5xl) for dashboard/library/stats — replacing the arbitrary 980px and 4xl. The header left edge then only moves when the content genre actually changes.

**LA-8 · MEDIUM · effort:small — Stats skeleton claims to 'mirror the final layout, so nothing jumps' but uses different gaps than the loaded state — the page visibly shifts on load**
- Where: `src/app/components/StatsPanel.tsx:322`
- Evidence: Skeleton (comment line 319: "Loading skeleton (mirrors the final layout, so nothing jumps)"): root "flex flex-col gap-6" (322), grid "grid-cols-2 lg:grid-cols-4 gap-4" (323). Loaded: root "flex flex-col gap-4" (423), grid "gap-3.5" (457). Skeleton also renders only 3 sections vs 5 loaded.
- Impact: When /api/stats resolves, section spacing snaps from 24px to 16px and card gutters from 16px to 14px — every card below the first row shifts up by 8–20px at the exact handoff moment the skeleton exists to smooth over. The code's own comment documents the intent being broken.
- Fix: Copy the loaded wrapper classes verbatim into the skeleton (gap-4 root, gap-3.5 grid) and add placeholder blocks for the two missing sections so total height is stable too.

**LA-9 · MEDIUM · effort:small — Activity heatmap scroller opens at the oldest week — on phones 'today' is off-screen with no auto-scroll and no edge fade**
- Where: `src/app/components/StatsPanel.tsx:493`
- Evidence: <div className="overflow-x-auto custom-scrollbar pb-1"> wrapping "flex gap-1 min-w-max" of 26 week columns (13px cells + 4px gaps ≈ 460px total). Weeks render oldest→newest and no code sets scrollLeft anywhere in src/ (verified by grep), nor is there a gradient fade hinting at overflow.
- Impact: On a 375px viewport the visible window shows roughly January–March of the half-year range; the streak-relevant recent weeks — the emotional payoff of the chart — are hidden to the right, and nothing signals that scrolling is possible. Users see an apparently stale, mostly-empty heatmap.
- Fix: After mount, set el.scrollLeft = el.scrollWidth (a ref + layout effect), and add a mask-image linear-gradient edge fade on the container so truncation reads as 'more here'. GitHub-style anchoring to the newest week is what every user expects.

**LA-10 · MEDIUM · effort:small — Arming snooze swaps a 32px icon for a ~150px pill group inside the card's title row — the lecture title and level pill lurch on every arm/disarm**
- Where: `src/app/DashboardClient.tsx:2314`
- Evidence: Armed branch (2314–2333) renders three "+1/+3/+7" pills (each "h-7 px-2.5 rounded-full … whitespace-nowrap") in place of the idle "btn-ghost-icon w-8 h-8" (2336–2347); they share a row with the flex-1 min-w-0 title (2305) and the Level pill, so the extra ~120px is taken from the title's truncation width instantly, while only the pills themselves animate (springTactile).
- Impact: Clicking the quiet clock icon makes the card's headline text visibly re-truncate and the Level chip jump left — a large, un-choreographed layout pop for what should feel like a small local disclosure. It also auto-reverts after 5s (line 1207), causing the same jolt in reverse while the user may be reading.
- Fix: Reserve the space: render the pills in an absolutely-positioned layer over the icon's slot (right-aligned, bg-paper-1 with shadow-lift), or animate the swap width with a fixed-width container so the title never reflows.

**LA-11 · LOW · effort:small — Screen-header rhythm drifts across the five tabs: eyebrow→title gap is 10px or 12px, and the header's bottom margin is 32, 36 or 40px**
- Where: `src/app/DashboardClient.tsx:3508`
- Evidence: Dashboard: eyebrow then h1 "mt-2.5" (2175, 10px). Upload: eyebrow "mb-3" (2602, 12px), header "mb-10" (2601). Library: "mb-3" (2817), header "mb-8 md:mb-10" (2816). Stats: eyebrow "mb-2.5" (3508, 10px), header "mb-8 md:mb-10" (3507). Quiz: header "mb-9" (3547, 36px), eyebrow row "mb-3.5" (3548, 14px).
- Impact: The eyebrow/title/lede lockup is the app's signature moment on every screen, and its internal spacing changes by 2px and its clearance by up to 8px depending on the tab — exactly the kind of micro-inconsistency that makes a template feel hand-assembled rather than systematic.
- Fix: Fix one lockup and reuse it: eyebrow mb-3, h1, lede mt-3, header mb-8 md:mb-10 — then apply the same classes on all five tabs (quiz included).

**LA-12 · LOW · effort:small — The same model <select> is 52px tall on Upload and 48px in the Quiz; the upload form mixes 48px inputs with a 52px control row**
- Where: `src/app/DashboardClient.tsx:2780`
- Evidence: Upload: module select "h-12" (2674) and topic input "h-12" (2694), but the model select is "input-dark sm:w-[200px] h-[52px]" (2780) beside the h-[52px] submit (2789). Quiz: the identical model select is "btn-secondary sm:w-[200px] h-12" (3984) beside an h-12 submit (3994) — and it also switches skin from input-dark to btn-secondary.
- Impact: Control heights within one form differ by 4px with no hierarchy reason, and the exact same component wears two heights and two skins on two screens — the kind of drift users perceive as 'slightly off' when moving from upload to quiz.
- Fix: Standardize form controls at h-12 (making the upload CTA row h-12 as well), and give the model picker one consistent treatment (input-dark) in both places; if the primary CTA should be larger, scale it deliberately to h-14, not 52px.

**LA-13 · LOW · effort:small — Empty/error state cards use five different paddings (p-9, p-10, p-12 md:p-16, p-14) and two icon-tile sizes for the same pattern**
- Where: `src/app/DashboardClient.tsx:2228`
- Evidence: Dashboard empty: "card-surface-elevated p-9" (2228). Library no-results: "card-surface p-10" (2888). Library error/empty: "card-surface p-12 md:p-16" (2898, 2921). Stats error: "card-surface p-14" with icon "w-12 h-12" (StatsPanel.tsx 351–352), while the others use "w-[52px] h-[52px]" tiles (2229, 2922, StatsPanel 364).
- Impact: The rest-state screens — the moments the design intentionally slows down and speaks — each breathe differently: 36 vs 40 vs 48/64 vs 56px of air, plus a 48px icon tile where siblings use 52px. Side by side (library empty vs stats empty on adjacent tabs) the mismatch is visible.
- Fix: One EmptyState recipe: card-surface p-12 md:p-16, w-[52px] icon tile, display-serif title, max-w-sm lede — reuse it in all six locations (also fixes the left-aligned dashboard empty state vs centered everywhere else).

**LA-14 · LOW · effort:small — Settings 'Appearance' section puts its body copy above the caps-label heading — inverted against every sibling section in the same modal**
- Where: `src/app/DashboardClient.tsx:4468`
- Evidence: Lines 4468–4471: <p className="text-xs text-ink-600 mb-4">…Wie dein Lernraum beleuchtet ist…</p> followed by <h4 className="caps-label mb-2.5">Theme</h4>. Every other section leads with the h4 caps-label, description after (e.g. dictation: h4 at 4693 then p at 4694; AI connection: 4725 then 4726).
- Impact: Scanning the settings modal, the eye uses the caps-labels as section anchors; the first section breaks the scan pattern with an orphaned paragraph floating under the modal intro, reading like a stray subtitle rather than part of 'Theme'.
- Fix: Move the sentence below the Theme heading (or drop it — the modal's own subtitle already covers it) so all sections follow the h4 → description → control order.

**LA-15 · LOW · effort:small — Dashboard 'Upcoming' rows use 22px gutters / 13px vertical padding while library rows use 20px / 14–16px — same list-row DNA, different metrics**
- Where: `src/app/DashboardClient.tsx:2520`
- Evidence: Upcoming rows: "py-[13px] px-[22px]" with divider "mx-[22px]" (2516, 2520). Library module headers: "px-5 py-4" (3007); lecture rows: "px-5 py-3.5" (3107). All are hover-highlight rows inside card-surface containers.
- Impact: Two screens away from each other, visually identical row lists sit on different gutters (22 vs 20px) and off-grid vertical rhythm (13px), so cards that should feel like one component family are optically misaligned relative to their card padding (px-5 content elsewhere in the same cards).
- Fix: Settle list rows on px-5 (matching card content gutters) with py-3.5, and dividers on mx-5; delete the 22/13px one-offs.

**LA-16 · LOW · effort:small — The settings modal (z-60) renders underneath the tutor slide-over (z-70) — opening Settings during a quiz leaves a bright tutor column above the scrim**
- Where: `src/app/DashboardClient.tsx:4437`
- Evidence: Settings overlay: "fixed inset-0 … z-[60]" (4437); TutorPanel: "fixed inset-y-0 right-0 z-[70] w-full sm:w-[376px]" (TutorPanel.tsx 299), portaled to document.body. Both can be open at once (tutor open in quiz tab → Settings via sidebar). Both also close on the same un-stopped Escape keydown (TutorPanel.tsx 127–131 and the global handler at 1172).
- Impact: The modal's dim backdrop covers the app except a full-height glowing panel on the right that can overlap the settings card itself at ≤1300px widths — the elevation story (modal = topmost) breaks. A single Esc then dismisses both layers at once instead of peeling the top one.
- Fix: Raise modal overlays above the panel (settings to z-[80]) or close the tutor panel when a modal opens; make Escape peel one layer (check modal-open state in the panel's handler, or stopPropagation on the topmost).

**LA-17 · LOW · effort:small — Heatmap grid fills only ~460px of a ~900px desktop card, with the legend right-aligned past the grid's edge**
- Where: `src/app/components/StatsPanel.tsx:494`
- Evidence: Cells are fixed "w-[13px] h-[13px]" in "flex gap-1 min-w-max" (494, 517): 26 weeks ≈ 460px, inside a card that spans the max-w-5xl stats column (~900px inner). The legend row is "flex items-center justify-end" (524), pinning Less/More to the card's far right, ~440px away from where the grid ends. Legend swatches are also w-3 (12px) vs 13px cells.
- Impact: On desktop the marquee chart floats in the card's left half with a large dead zone, and its legend is visually attached to nothing. The composition reads unfinished compared to the tightly-fitted forecast and level charts below it.
- Fix: Let cells flex to fill (grid with 26 equal columns, aspect-square cells) or center the fixed grid and left-align the legend to the grid's right edge; match legend swatch size to cell size (13px).

**LA-18 · LOW · effort:small — Duplicate .eyebrow/.caps-label utilities (identical CSS) with a single stray .eyebrow usage in the prompt viewer**
- Where: `src/app/globals.css:462`
- Evidence: .eyebrow (462–469) and .caps-label (471–478) declare byte-identical rules (11px/650/uppercase/0.11em/ink-400). Grep shows exactly one .eyebrow call site — the prompt viewer header (DashboardClient.tsx 5020) — vs ~30 .caps-label usages.
- Impact: Two names for one concept invites divergence (a future tweak to caps-label will silently miss the prompt viewer), and the token sheet reads as if two type styles exist when only one does.
- Fix: Delete .eyebrow from globals.css and change line 5020 to caps-label.

**LA-19 · LOW · effort:small — 3-up segmented controls in Settings wrap German labels to two lines on small phones, breaking the control's height and centering**
- Where: `src/app/DashboardClient.tsx:4705`
- Evidence: Dictation segmented (4699–4721) puts "Hybrid · empfohlen" / "Gemini" / "Browser" in flex-1 .segmented-item cells (globals.css 643: padding 8px 10px, font-size 13px). In the max-w-[560px] modal at a 375px viewport, each cell nets ~75px of text width — "Hybrid · empfohlen" (~120px) and the AI-connection labels "Proxy für alles" / "Nur Generierung" (4759, 4782) wrap.
- Impact: The active-pill control renders with one two-line segment next to single-line neighbors: uneven cell heights, ragged vertical centering, and a visually broken pill on precisely the settings screen that showcases the design system.
- Fix: Shorten the labels on mobile ("Hybrid" with the ' · empfohlen' hint moved to the description, "Proxy", "Generierung", "Fallback") or add whitespace-nowrap + text-ellipsis with a min 12px font and let the description carry the nuance.

**LA-20 · LOW · effort:small — Unmotivated 1–2px near-misses in the hand-tuned metric set (px-[34px] vs py-9, pt-[18px] vs pb-4, pt-[46px])**
- Where: `src/app/login/LoginClient.tsx:107`
- Evidence: Login auth card: "card-glass px-[34px] py-9" (34px vs 36px axes). Due card: "pt-[18px] pb-4" (18 vs 16px, DashboardClient.tsx 2299). Main content: "pt-8 md:pt-[46px]" (2143 — 46px, neither 44 nor 48). Also h-[50px] mt-[26px] gap-[11px] on the login button (126).
- Impact: The app clearly embraces optical hand-tuning (h-[38px] nav, 264px sidebar), but these pairs differ by 2px within the same box with no optical rationale — they read as typed-in approximations, and they make the spacing system unauditable because intentional and accidental off-grid values are indistinguishable.
- Fix: Where no optical reason exists, snap to the neighbor: login card p-9 both axes, due card pt-4 pb-4 (thread already provides the top accent), main md:pt-12 or md:pt-11. Document the few deliberately off-grid constants (38px nav height, 264px rail) in a comment so future edits keep the distinction.


### Accessibility (19)

**A1-1 · HIGH · effort:medium — All seven modals lack dialog semantics and any focus management (no role, no initial focus, no trap, no restore)**
- Where: `src/app/DashboardClient.tsx:4433`
- Evidence: Every overlay is a bare motion.div: `{showSettingsModal && (<motion.div key="settings-overlay" {...overlayMotion} className="fixed inset-0 flex items-center justify-center p-4 z-[60]" onClick={closeSettingsModal}>` — same pattern for archive (L4105), feedback (L4157), calendar (L4322), prompts list (L4900), comprehension feedback (L4949), prompt viewer (L5006). Grep across src confirms zero occurrences of role="dialog", aria-modal, autoFocus, or .focus() into a panel; the only .focus() call is the ⌘K search (L1900). Escape works (global handler L1172) but nothing else does.
- Impact: When a modal opens, a screen reader announces nothing and focus stays on the trigger behind the dim overlay. Tab then walks through the entire invisible background page (sidebar, cards, footer) while the modal visually blocks it — a keyboard user must blindly traverse dozens of hidden controls to reach the settings panel, and on close focus is stranded wherever it drifted. This affects Settings, the feedback brief, calendar sync, video archive, prompts and comprehension viewers — i.e. every overlay in the app.
- Fix: Add `role="dialog" aria-modal="true" aria-labelledby={titleId}` to each modalPanel, move focus to the panel (or its close button) on open, trap Tab inside (a ~20-line focus-trap hook shared by all seven, or `inert` on the app shell while open), and restore focus to the trigger on close. The shared modalPanel pattern makes this one wrapper component.

**A1-2 · HIGH · effort:small — Due cards and all 'Upcoming' rows are click-only divs — the app's core action is keyboard-inaccessible beyond the first item**
- Where: `src/app/DashboardClient.tsx:2298`
- Evidence: Due card: `<motion.div key={review.id} variants={riseChild} whileHover={{ y: -1 }} ... onClick={() => startQuiz(review)} className="card-surface-elevated group cursor-pointer ...">` — no role, no tabIndex, no onKeyDown (grep confirms zero tabIndex in the file). Upcoming row (L2517–2520): `<div onClick={() => startQuiz(review)} className="grid grid-cols-[1fr_auto_auto] ... cursor-pointer ...">`. Only escape hatches: the single 'Start reviewing' button (first due item) and the Enter shortcut (also only `upcomingReviews.find(r => r.isDue)`, L1927).
- Impact: A keyboard or switch user can start the FIRST due review, but cannot open due review #2..N or any scheduled review at all — the primary interaction of a study app is mouse/touch-only. Screen readers announce the cards as plain text with no hint they are actionable, while the nested snooze/delete buttons ARE focusable, which makes the card read as inert content with orphaned controls.
- Fix: Make the card title the real control: wrap the topic line in a `<button onClick={() => startQuiz(review)}>` (topic + 'Level X of 7' as its accessible name) and keep the div onClick as a bonus hit area, or add `role="button" tabIndex={0}` + Enter/Space onKeyDown to the div. Same for the Upcoming rows.

**A1-3 · HIGH · effort:small — html lang="en" while the app's default UI language (and the entire login page) is German**
- Where: `src/app/layout.tsx:54`
- Evidence: `<html lang="en" className={...}>` is hardcoded, but DashboardClient defaults `initialLanguage = "german"` (L505) and LoginClient is 100% hardcoded German ('Lerne weniger. Behalte mehr.', 'Melde dich mit Google an…', all ERROR_MESSAGES). The language toggle in Settings never updates the lang attribute — no `document.documentElement.lang` write exists anywhere.
- Impact: Screen readers pick the speech engine from `lang` — German text like 'Guten Morgen', 'Jetzt wiederholen', 'Verständnis-Check' gets pronounced with English phonetics, which is close to unintelligible. WCAG 3.1.1 (Language of Page) fails for the app's default audience.
- Fix: Set `lang="de"` as the server default (mirroring initialLanguage), and in the settings language handler also run `document.documentElement.lang = next === 'german' ? 'de' : 'en'`. For mixed content (English quiz text inside a German UI) add `lang` on the quiz body container.

**A1-4 · HIGH · effort:small — Library edit-mode 'Remove module' controls are role="button" spans with no tabIndex or key handler — module deletion is impossible by keyboard, and they're nested inside another button**
- Where: `src/app/DashboardClient.tsx:3069`
- Evidence: Inside the module-header `<button>` (L3001): `<span role="button" aria-label={... "Modul entfernen" ...} onClick={(e) => handleDeleteLibraryModule(e, modKey, lectures)} className="w-[30px] h-[30px] rounded-full ...">` and the armed confirm `<span role="button" onClick=... >Delete N lectures?</span>` (L3057–3065). Neither has tabIndex={0} nor onKeyDown, and both sit inside the expand/collapse `<button className="w-full flex ...">`.
- Impact: Keyboard users can enter Edit mode ('Bearbeiten' is a real button) but then cannot arm or confirm a module delete — the feature dead-ends. Screen readers encounter a button nested inside a button (invalid ARIA structure); pressing Enter on the header toggles the accordion instead. The two-step confirm is unreachable non-visually.
- Fix: Restructure the module header row as a div containing two sibling real `<button>`s (header-toggle + delete) laid out with flex, instead of nesting. If the row must stay one button, render the delete control as an absolutely-positioned sibling. role="button" spans always need tabIndex={0} and Enter/Space handling — but a real <button> here is simpler and fixes the nesting too.

**A1-5 · HIGH · effort:small — No live region anywhere: the grading verdict — the app's earned moment — is never announced to screen readers**
- Where: `src/app/DashboardClient.tsx:3758`
- Evidence: Grep across src finds zero `aria-live` (the only announcements are Toast's role="status"/"alert"). Submitting answers swaps the quiz for the grading screen (`{isGrading ? ... : gradingResult ? ...}` L3696/3758) whose progress text (`setGradingMsg`, examiner steps) and final verdict header ('Level N, unlocked.' / 'Let's see this one again.') render silently. The upload pipeline progress (L2609–2660) is equally silent, and grading success fires no toast.
- Impact: A screen-reader user submits, waits ~60 seconds, and hears nothing — not the examiner progress steps, not the pass/repeat verdict, not the next review date. They must manually re-explore the page to discover whether they passed. The most emotionally-designed moment in the product ('the earned pass moment') is inaudible.
- Fix: Add one visually-hidden `aria-live="polite"` region near the quiz root that mirrors key transitions: 'Grading started', the current gradingMsg on step changes, and on completion 'Passed — Level 4 unlocked, next review Friday 12 July' / 'Repeat — comes back tomorrow'. Same region can serve the upload pipeline ('Module created, first review tomorrow').

**A1-6 · MEDIUM · effort:small — Selected state is visual-only across nav tabs, all segmented controls, and the theme/accent pickers**
- Where: `src/app/DashboardClient.tsx:4662`
- Evidence: Language segments: `<button ... className="segmented-item" data-active={language === 'german'}>Deutsch</button>` — data-active drives CSS only (globals.css L655). Same for dictation (L4699–4721), AI connection (L4737–4807), PDF delivery (L4823–4840). Sidebar nav (L2050–2069) marks the active tab purely via `nav-item-active` class — no aria-current. Theme cards (L4481) and accent swatches (L4539) convey selection via border color and a CheckIcon that heroicons renders aria-hidden. Meanwhile StatsPanel's semester chips DO set `aria-pressed` (StatsPanel L436/446) — the correct pattern exists in the codebase but only there.
- Impact: A screen-reader user opening Settings hears 'Deutsch, button. English, button.' with no way to know which is active; same for every preference, the current tab, and the chosen theme/accent. They must toggle blindly and infer from side effects.
- Fix: Add `aria-pressed={active}` to every segmented-item, theme card and accent swatch (or make each group role="radiogroup" with role="radio"/aria-checked and arrow-key movement), and `aria-current="page"` on the active sidebar nav button. This mirrors the pattern already shipped in StatsPanel.

**A1-7 · MEDIUM · effort:small — Keyboard focus is invisible on the grading-model selects: global CSS strips select outlines but .btn-secondary defines no replacement**
- Where: `src/app/globals.css:358`
- Evidence: globals.css: `input:focus-visible, textarea:focus-visible, select:focus-visible { outline: none; }` — the replacement ring only exists on `.input-dark:focus` / `.input-inset:focus` (L556–575). But the quiz tab's model pickers are `<select value={gradingModel} ... className="btn-secondary sm:w-[200px] h-12 ...">` (DashboardClient L3981–3984 and L4063–4066), and `.btn-secondary` has no :focus rule at all. The upload tab's select correctly uses input-dark (L2674) — proving the drift.
- Impact: Tabbing to the model select on the quiz screen produces zero visible focus indication — a keyboard user loses their place right next to the primary submit button. WCAG 2.4.7 failure on a control that sits in the main task flow.
- Fix: Either give the quiz selects the input-dark focus treatment, or scope the outline-stripping rule to `.input-dark, .input-inset` instead of all inputs/selects: `select:focus-visible { outline: 2px solid color-mix(in srgb, var(--a-g2) 60%, transparent); }` for any select without its own ring.

**A1-8 · MEDIUM · effort:medium — ink-400 (2.6:1) and ink-300 (1.9:1) are used for meaningful text throughout — far below AA contrast**
- Where: `src/app/globals.css:77`
- Evidence: `--ink-400: #a89d8b;` on paper-1 #fffefb ≈ 2.65:1; `--ink-300: #c4baa9;` ≈ 1.9:1 (AA requires 4.5:1 at these sizes). These aren't decoration: caps-label section headers are ink-400 at 11px (globals L471–478), library footnotes are `text-[10px] text-ink-300` ('No repeats yet.', DashboardClient L3260), review-history 'no brief' is text-ink-300 at 9px (L4260), dates/meta rows, heatmap weekday labels (StatsPanel L496, 8px ink-300), and the quiz footnote '⌘↵ to submit'. Ink theme is similar: ink-400 #7c7160 on #252019 ≈ 3.4:1.
- Impact: Users with moderate low vision (and anyone on a dim screen in daylight) cannot read the layer of the UI that carries schedule dates, section labels, keyboard hints, and status footnotes. The quiet-paper aesthetic is achievable at compliant ratios — right now the whole 'whisper' tier is illegible for a real slice of users.
- Fix: Retune the two tokens toward compliance where they carry words: shift --ink-400 to ~#857a67 (≈4.5:1 on paper-1) and reserve current ink-300 for purely decorative strokes; where 10px ink-300 text exists, promote it to ink-400/ink-600. Verify the ink theme equivalents (target ≥4.5:1 against paper-1 #252019).

**A1-9 · MEDIUM · effort:medium — Stats heatmap and chart data live only in hover tooltips on non-focusable divs (and Tip puts aria-label on generic divs, which ARIA ignores)**
- Where: `src/app/components/StatsPanel.tsx:517`
- Evidence: `<Tip key={cell.key} label={`${cell.date.toLocaleDateString(locale)} — ${cell.count} reviews`}><div className="heat-cell w-[13px] h-[13px] ..." /></Tip>` — Tip shows on focus (Tooltip.tsx onFocus) but the div has no tabIndex so focus never lands there; Tip also mirrors the label into `aria-label` on the div (Tooltip.tsx L54–57), which is prohibited/ignored on a generic role. Same pattern for the 14-day forecast bars (L583) and the 7-dot level indicators in the library (DashboardClient L3139–3149). Cell intensity is conveyed by color alone.
- Impact: Keyboard and screen-reader users get no access to six months of per-day activity or per-day forecast details; low-vision users can't distinguish the 5 amber intensity steps. The forecast/level charts survive because counts are printed as text — the heatmap has no text alternative at all.
- Fix: Give the heatmap a text fallback: either make each cell a focusable element with role="img" and the existing label (`tabIndex={0}` on ~180 cells is heavy — a per-week roving tabindex or a single visually-hidden monthly summary sentence is lighter), and add a visually-hidden summary like 'Reviewed on 34 of the last 180 days; busiest day 12 June with 8 reviews.' In Tooltip.tsx, only mirror aria-label when the child is interactive.

**A1-10 · MEDIUM · effort:medium — TutorPanel slide-over: focus never enters it, streamed replies are silent, and the composer has placeholder-only labeling**
- Where: `src/app/components/TutorPanel.tsx:333`
- Evidence: The panel opens as `<motion.aside ... aria-label="Live tutor chat">` portaled to document.body — no focus move on open (no autoFocus/.focus()), no focus return on close, and since it's portaled to the end of body, Tab from the 'Tutor' toggle walks the whole quiz first. The message list `<div ref={scrollRef} className="flex-1 overflow-y-auto ...">` has no aria-live, so the streamed tutor answer (and the 'thinking…' state) is never announced. The composer AutoGrowTextarea (L408–419) has only `placeholder={"Frag deinen Tutor…"}`.
- Impact: A screen-reader user presses 'Tutor', hears nothing happen, and must hunt to the end of the page to find the panel; after sending a question the reply streams in complete silence. The main input has no accessible name once text is typed (placeholder disappears).
- Fix: On open, focus the composer textarea; on close, return focus to the Tutor toggle. Wrap the messages container in `aria-live="polite"` (announce completed messages, not every streamed token — e.g. a hidden live node updated in the stream's finally block). Add `aria-label={de ? "Frag deinen Tutor" : "Ask your tutor"}` to the textarea.

**A1-11 · MEDIUM · effort:small — Upload and quiz form fields have visual labels that aren't programmatically associated**
- Where: `src/app/DashboardClient.tsx:2667`
- Evidence: `<label className="caps-label leading-tight">{`Module (Semester ${currentSemester})`}</label>` has no htmlFor and the `<select>` below no id (L2671); same for 'Topic' (L2688 label / L2689 input) and 'Lecture material' (L2699 label / L2768 textarea, placeholder-only). Quiz answer boxes are labeled by a `<span className="caps-label">Your answer</span>` (L3907) with no id/aria-labelledby on the AutoGrowTextarea; the library search (L2832) is placeholder-only. Only the file input's label is correctly wired (`htmlFor="file-upload"`, L2742).
- Impact: Screen readers announce 'edit text, blank' for the topic field and 'combo box' for the module picker with no names; in the quiz, ten identical unnamed textareas are indistinguishable. Clicking the visual labels also doesn't focus the fields — a small motor-accessibility loss.
- Fix: Add id/htmlFor pairs on the upload form, `aria-label={"Search module or lecture"}` on the library search, and per-task names on quiz textareas: `aria-label={`${task.label} — your answer`}` (task.id is already unique).

**A1-12 · MEDIUM · effort:small — Toast close buttons are hardcoded aria-label="Close" in a bilingual app, and toasts auto-dismiss on a fixed 5s timer with no pause**
- Where: `src/app/components/Toast.tsx:74`
- Evidence: `<button onClick={() => onDismiss(toast.id)} className="shrink-0 text-ink-600 ... p-0.5" aria-label="Close">` (and L106) — English-only while every other label in the app is language-switched; the component never receives `language`. Dismissal: `window.setTimeout(() => dismissToast(id), variant === "undo" ? 6000 : 5000)` (L37) — no pause on hover/focus, and the undo action ('Rückgängig') vanishes after 6s regardless.
- Impact: German screen-reader users hear an English 'Close' mid-German UI; slower readers (or anyone mid-mouse-travel) lose error messages and — worse — the undo affordance for snooze before they can act on it (WCAG 2.2.1). The close hit area is also ~20px (p-0.5 on a 16px icon), below any touch guideline.
- Fix: Pass the UI language into useToasts/ToastStack (or accept a closeLabel prop). Pause the dismiss timer on mouseenter/focusin of the stack and resume on leave — standard toast behavior. Bump close-button padding to p-2 (≥36px). Consider 10s for undo toasts.

**A1-13 · MEDIUM · effort:medium — Two-step confirms (snooze, delete) destroy keyboard focus when they arm, then time out after 4–5s**
- Where: `src/app/DashboardClient.tsx:2337`
- Evidence: Arming snooze replaces the focused clock button with the pill row: `{snoozeArmedId === review.id ... ? (<motion.div ...>{[1,3,7].map(...)}</motion.div>) : (<button onClick={... setSnoozeArmedId(review.id)}>` — the focused element unmounts, dropping focus to <body>. The armed state then self-resets: `window.setTimeout(() => setSnoozeArmedId(null), 5000)` (L1207); delete confirms reset at 4000ms (L1193). Same swap for the delete button → 'Really delete?' (L2392–2416).
- Impact: A keyboard user activates snooze, focus silently jumps to the top of the document, and they have 5 seconds to tab all the way back to pills that will have disappeared. The forgiving two-step pattern — a design centerpiece — is effectively unusable without a mouse.
- Fix: After arming, move focus programmatically to the first pill / the confirm button (ref + effect, or render the confirm as the same persistent button whose label and handler change so focus never unmounts). Extend or suspend the auto-reset while any pill/confirm has focus.

**A1-14 · LOW · effort:small — Tooltips violate WCAG 1.4.13: not dismissible with Escape and not hoverable**
- Where: `src/app/components/Tooltip.tsx:62`
- Evidence: The wrapper handles `onMouseEnter/onMouseLeave/onMouseDown/onFocus/onBlur` only — no keydown, so Escape doesn't hide an open tooltip while a control is focused. The bubble itself is `pointer-events: none` (globals.css L828), so pointer users can't move onto it (it can occlude nearby content while stuck under the cursor path). It's also role="tooltip" without aria-describedby wiring — harmless here since the label is mirrored to aria-label, but the role is inert.
- Impact: Keyboard users who focus a control get a persistent bubble they can't dismiss without blurring, which can cover adjacent content (e.g. the interactive control bar's tightly packed buttons); magnifier users can't hover the bubble to keep reading. Formal 1.4.13 failure.
- Fix: Add a document keydown listener while `pos` is set: Escape → hide(). That single change satisfies 'dismissible'. Hoverable matters less at 260px max-width but could be added by delaying hide 100ms and cancelling if the pointer enters the bubble (requires removing pointer-events:none).

**A1-15 · LOW · effort:small — Long scrollable text regions (prompt viewer, grading error, history briefs) are unreachable by keyboard scrolling**
- Where: `src/app/DashboardClient.tsx:5045`
- Evidence: Prompt viewer body: `<div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-6"><pre ...>{promptModal.content}</pre></div>` — no tabIndex and no focusable children, so arrow keys can never scroll it. Same for the grading error `<pre className="... max-h-40 overflow-y-auto ...">` (L3685) and the expanded history brief `<div className="max-h-64 overflow-y-auto custom-scrollbar"><FeedbackBody .../></div>` (L4292).
- Impact: Keyboard-only users can read only the first screenful of a multi-page prompt or a long feedback brief; the rest is physically unreachable. (Chrome makes scrollables focusable heuristically, but Safari/Firefox don't.)
- Fix: Add `tabIndex={0} role="region" aria-label={promptModal.title}` (and equivalents) to these three scroll containers so they take focus and respond to arrow/PageDown keys in every browser.

**A1-16 · LOW · effort:small — Heading outline is broken: three h1s per page and h2/h3/h4 levels skip and shuffle across surfaces**
- Where: `src/app/DashboardClient.tsx:2013`
- Evidence: The brand wordmark is an h1 in the mobile top bar (`<h1 className="text-[15px] font-bold ...">SRS <span ...>Master</span></h1>`, L2013) AND in the sidebar (L2042), alongside each tab's real h1 (greeting L2175, 'Your library' L2818, etc.) — up to three h1s at once. Under the dashboard h1, the empty state jumps straight to h3 ('Nothing here yet', L2232). Modal titles are inconsistent levels: calendar uses h2 (L4334), settings/feedback/archive use h3 (L4448/L4172/L4118) with h4 sections below, none anchored to a parent level.
- Impact: Screen-reader users navigating by headings (the single most-used SR navigation method) get a table of contents where the site logo appears as the page title twice and levels skip, making the dashboard structure hard to skim.
- Fix: Demote both brand wordmarks to `<p>` or a div (they're logos, not headings), promote 'Due today'/'Upcoming' to remain h2 (already correct), fix the empty/all-clear card titles from h3 to h2, and standardize modal titles as h2 with h3 sections.

**A1-17 · LOW · effort:small — Push notification row renders a fake switch with no switch semantics**
- Where: `src/app/DashboardClient.tsx:2090`
- Evidence: `<button onClick={togglePush} className="... nav-item-idle">...<span className={`w-7 h-[17px] rounded-full relative inline-block transition-colors ${... ? "bg-ink-900" : "bg-[...]"}`}><span className={`absolute top-0.5 w-[13px] h-[13px] rounded-full bg-paper-1 transition-transform ...`}></span></span></button>` — a decorative thumb-in-track with state conveyed only by which text variant renders ('Notifications on/off/blocked').
- Impact: Screen readers announce it as a plain button; the on/off state IS in the visible text, so it's not broken, but the toggle affordance is invisible non-visually and the 'blocked' state gives no hint that activation will fail. Minor compared to the segmented controls, but the same class of gap on a stateful control.
- Fix: Add `role="switch" aria-checked={pushPermission === "granted" && pushSubscribed}` to the button and `aria-disabled` (or a clearer disabled treatment) when pushPermission === "denied" since clicking then only re-prompts a dead end.

**A1-18 · LOW · effort:small — No skip link: keyboard users tab through the full sidebar (9+ stops) before reaching content on every tab switch**
- Where: `src/app/DashboardClient.tsx:2005`
- Evidence: DOM order inside `<div className="flex flex-col md:flex-row w-full print:hidden">` is: mobile brand button, menu button, sidebar brand button, 5 nav buttons, push toggle, sign-out, THEN `<main>`. No skip link exists anywhere (grep: no 'skip', no href="#main"), and `<main>` has no id or tabIndex to target.
- Impact: Every keyboard journey to the day's reviews costs ~9 extra Tab presses past identical chrome; combined with finding #2 (cards not focusable) the keyboard path through the app is consistently slower than it needs to be.
- Fix: Add a classic visually-hidden-until-focused skip link as the first child of body ('Zum Inhalt springen / Skip to content') targeting `<main id="main" tabIndex={-1}>`. The paper design system's kbd/focus tokens already give it a natural styled appearance on focus.

**A1-19 · LOW · effort:small — Sub-44px touch targets cluster on high-frequency controls (snooze pills 28px, tutor speak 24px, toast close ~20px)**
- Where: `src/app/DashboardClient.tsx:2327`
- Evidence: Snooze interval pills: `className="h-7 px-2.5 rounded-full ..."` (28px tall, appear for 5 seconds under time pressure). Tutor read-aloud: `className="w-6 h-6 rounded-lg ..."` (TutorPanel L379, 24px). Toast close: `p-0.5` around a w-4 icon (Toast.tsx L73, ~20px). By contrast the app elsewhere is careful — sign-out uses `w-9 h-9 -m-1`, file-remove uses w-7 with negative margin.
- Impact: On iPhone/iPad (explicitly supported — safe-area insets, PWA install flow, Apple Pencil scribble) these are the controls used mid-flow: snoozing from bed, dismissing an error, replaying tutor audio. Sub-28px targets measurably raise mis-taps; the snooze pills combine a small target with a 5s deadline.
- Fix: Extend hit areas without changing visuals, matching the existing sign-out pattern: pills → `h-7` visual inside a `min-h-[44px] py-2 -my-2` wrapper or just h-9 px-3; tutor speak → `w-9 h-9 -m-1.5`; toast close → `p-2 -m-1.5`.
