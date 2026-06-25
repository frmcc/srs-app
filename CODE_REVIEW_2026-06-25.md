# SRS App — Deep Code Review (2026-06-25)

Full read of `src/`, the Prisma schema, and the API/shortcut surface. Findings are ordered by blast radius. Line numbers are against the current code, not the older `CODE_REVIEW.md` (which is stale — its line numbers no longer match; see L13).

> **Status — fixes applied 2026-06-25:** ✅ **H1** (no level advance over an empty quiz), ✅ **M3** (re-ask Chief once on an unparseable decision), ✅ **L1** (podcast button no longer sticks). Typecheck clean (`tsc --noEmit`, 0 errors). **Deliberately left unchanged** (behaviour-change risk): H2 dedup, H3 auth (would break existing iPhone Shortcuts), M2 payload, and the ICS feeds — the calendar must keep emitting far-future 60/180/365-day reviews, so windowing it would hide exactly the events you rely on. The optional Gemini wrapper and all SRS leveling math were not touched.

**Headline:** the *crash* surface is genuinely solid. Every `JSON.parse`, `formData()`, and `req.json()` is guarded, streams have hard timeouts, the optimistic lock exists, folder creation is mutexed, and there are no unbounded loops. The real problems are **silent logic failures** (a student can be quietly sent backwards), **wasted/duplicated AI spend**, and **frontend state that gets stuck**. None of these throw — which is exactly why they're dangerous.

---

## 🔴 HIGH — Logic & data

### H1. A passed level can advance with **no quiz**, silently sending the student back to Quiz 1

`src/lib/grading-pipeline.ts:333-337` + `src/lib/srs.ts:30-32`

On a PASS the level is incremented unconditionally, but the new quiz is only written *if it's non-empty*:

```ts
if (isPass) {
  updatePayload.currentLevel = nextLevel;          // always advances
  if (newLedgerText) updatePayload.coverageLedger = newLedgerText;
}
if (nextQuizText) updatePayload[targetQuizField] = nextQuizText;  // skipped when empty
```

If the next-quiz generation returns `""` — an empty or safety-blocked candidate; `nextQuizRes.text` is taken as-is via `|| ""` with no non-empty check — the target slot stays `null` **but the level still moves up.** (Note: a *marker* miss does **not** trigger this — `nextQuizText` is the full model output, not a marker-extracted slice; only a genuinely empty/blocked response does. So this is a low-frequency, high-severity latent bug, not an everyday one.) Next time the student opens that module, `currentQuizText` falls back across levels:

```ts
export function currentQuizText(item) {
  return item[quizFieldForLevel(item.currentLevel)] || item.quiz1DocId || "";
}
```

→ they silently retake **Quiz 1** at, say, Level 4, with no error and no indication anything is wrong. The schedule has already jumped to the long interval, so the regression is invisible for weeks.

**Fix** — don't advance without a quiz; treat empty generation as a retryable failure (nothing is persisted, so it's safe to ask for a re-run):

```ts
if (isPass && !nextQuizText.trim()) {
  throw new Error("Nächstes Quiz wurde leer generiert — bitte Bewertung erneut starten.");
}
```

…placed right after `nextQuizText` is resolved (≈ line 307), before the `updateMany`.

---

### H2. The optimistic lock runs **after** all the AI work — concurrency wastes a full pipeline, and generation has no idempotency at all

`src/lib/grading-pipeline.ts:137-344`

The item is read at L137; the lock check is the very last step at L340-344. Everything expensive — mismatch gate, both Co-Prüfer, Chief Assessor, video prompts, next-quiz generation (≈ 6 Gemini calls, minutes) — happens *before* the lock. Two gradings of the same module (double-tap, web + Shortcut, a retried Shortcut poll) both run the **entire** pipeline; the loser only finds out at the write:

```ts
const updated = await prisma.sRSItem.updateMany({
  where: { id: itemId, currentLevel: srsItem.currentLevel },
  data: updatePayload,
});
if (updated.count === 0) throw new ConcurrentGradingError();  // ← after paying for everything
```

Correctness is fine; **cost and latency are not.** Quiz *generation* is worse: `POST /api/quiz/submit` → `runQuizGeneration` always does `prisma.sRSItem.create`, so a double-submitted lecture produces **two duplicate modules**, two Drive folder trees, and two podcast runs. There's no dedupe key.

**Fixes:**
- Cheap pre-flight: re-read `currentLevel` and bail before the LLM calls if it already moved. Doesn't fully close the window but kills the common double-tap case for near-zero cost.
- Generation idempotency: derive a key from `(subjectMain, subjectSub, semester)` (or a client-sent request id) and `upsert` / reject duplicates within a short window, so a retried Shortcut can't fork a second module.

---

### H3. AI endpoints are **public by default** — open quota/cost drain

`src/middleware.ts:15-17`

```ts
const user = process.env.BASIC_AUTH_USER;
const password = process.env.BASIC_AUTH_PASSWORD;
if (!user || !password) return NextResponse.next();   // no creds → no auth, for the whole app
```

Auth is opt-in. If the app is deployed without `BASIC_AUTH_*` set (the default), anyone who knows the URL can hit `/api/quiz/submit` and `/api/grade/shortcut` and burn your Gemini + Google Drive + NotebookLM quota, or enumerate `/api/reviews/[id]`. The Shortcut endpoints take a `quizId` and a file with zero secret.

**Fix** — at minimum require a shared secret on the unauthenticated machine endpoints, even when Basic Auth is off:

```ts
// in the shortcut/submit routes
if (req.headers.get("x-shortcut-token") !== process.env.SHORTCUT_TOKEN) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

…or fail closed in `middleware.ts` when `NODE_ENV === "production"` and no creds are configured.

---

## 🟠 MEDIUM — Resilience & performance

### M1. Quota (429) errors are retried with long backoff before surfacing an error that won't clear

`src/lib/gemini-retry.ts:12-31`

**(Corrected — I overstated this on the first pass.)** `isTransient` returns `true` for `429` / `quota` / `Resource has been exhausted`, and the backoff is `[10s, 25s, 50s]` → a single persistently-failing call sleeps **up to 85s** before throwing. I originally claimed this could blow past `maxDuration = 300` and kill the request; re-tracing the loop, that's wrong: a hard quota block makes the *first* call exhaust ~85s and **throw**, which aborts the whole pipeline at ~85s — comfortably under 300s. Exhaustion always throws, so you can't accumulate 85s × N steps.

The real (smaller) problem: retrying a `429`/quota at all is the wrong policy. A quota error won't clear in 85s, so the user waits ~85s for an error that was knowable instantly, and you spend the retries for nothing.

**Fix** — split rate/quota from `503`/`fetch failed`: fail fast on `429`/quota with an actionable "quota exceeded, try later," and keep the `[10s, 25s, 50s]` backoff only for genuine transient `503`/network blips.

### M2. The dashboard re-downloads **every quiz's full text** on every focus/visibility change

`src/lib/review-query.ts:61-91` + `src/app/DashboardClient.tsx:473-486`

`fetchReviewList` projects all seven quiz columns to compute `currentQuizText`, and ships that full quiz body for **every** item in the list. The dashboard then refetches the whole list on mount, on `focus`, and on every `visibilitychange → visible`:

```ts
const onFocus = () => fetchReviews();
const onVisibilityChange = () => { if (document.visibilityState === "visible") fetchReviews(); };
```

On a phone (where app-switching fires `visibilitychange` constantly) this re-pulls all quiz text repeatedly. There's also no pagination — it's `findMany` over the whole table.

**Fix** — keep `currentQuizText` *out* of the list payload; load it lazily from `GET /api/reviews/[id]` only when a quiz is opened (`startQuiz`). Debounce the visibility/focus refetch (e.g. skip if the last fetch was < 15s ago). The list then carries only `generatedLevels` booleans + metadata.

### M3. A missing decision marker discards the entire grading run

`src/lib/markers.ts:87-94`, thrown at `grading-pipeline.ts:219`

`parseAssessmentDecision` correctly refuses to silently default to REPEAT — good. The throw happens at L219, **after 4 calls** (mismatch + both Co-Prüfer + Chief; the video-prompt and next-quiz calls at L231+ haven't run yet — I said "6" on the first pass, that was wrong). So one unparseable Chief-Assessor reply still discards 4 multi-second calls and forces a full re-run, even though the decision is the cheapest thing to redo.

**Fix** — on parse failure, re-ask *only* the Chief Assessor once with a stricter "respond with exactly `===ASSESSMENT_DECISION_START===PASS|REPEAT===...===END===`" instruction before giving up. Cuts the failure cost from "4 calls" to "one retry."

### M4. Graders are fed the full PDF **and** its extracted text

`src/lib/grading-pipeline.ts:76-78`

```ts
parts.push({ inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } });
parts.push({ text: `Vorlesungsmaterial (Text):\n${await pdfToText(buffer)}` });
```

Both the base64 PDF *and* the parsed text are sent on every grader/quiz call. That roughly doubles tokens, and the inline base64 is the slow part on the proxy path. For a large lecture PDF this is a lot of redundant payload per call (and it's sent to Co-Prüfer 1, Co-Prüfer 2, and the Chief).

**Fix** — send the PDF inline *or* the extracted text, not both. Prefer text when extraction succeeds; fall back to inline PDF only when `pdfToText` returns empty.

---

## 🟡 LOW — UX & code quality

### L1. Podcast "generate" button gets stuck on `Gestartet…` until reload

`src/app/DashboardClient.tsx:603-626` (confirmed)

`generatingPodcasts[stateKey]` is set `true` on click and only reset to `false` in the **catch** branch. On success it's never cleared, so the button stays disabled/"Gestartet…" indefinitely. It's masked *only* if the 60s poll happens to flip the URL to `http…` (which swaps the button for a link) — and that poll only runs while `hasPendingPodcast` is true, which it often isn't because the notebook URL is written at creation time.

**Fix** — clear it in a `finally`, or after a short delay:

```ts
} finally {
  setTimeout(() => setGeneratingPodcasts(prev => ({ ...prev, [stateKey]: false })), 4000);
}
```

### L2. `videoUrl` is a read-modify-write JSON blob with drifting semantics

`src/lib/notebooklm.ts:39-65`

The video worker reads `item.videoUrl`, `JSON.parse`s a history array, pushes, and writes the whole thing back — a classic lost-update if two writers ever overlap (low odds today, but unguarded). The column is named `videoUrl` (singular, "a URL") but actually stores a JSON array; the client has to sniff `startsWith("[")` vs `startsWith("http")` vs legacy to decode it (`DashboardClient.tsx:1199-1216`). That sniffing is fragile.

**Fix** — rename to `videoHistory` (or add a real `VideoArtifact` table) and always store JSON; drop the string/array/legacy guesswork. If you keep the column, do the update inside a transaction that re-reads first.

### L3. `countTasks` fallback + split math misleads the two graders on unmarked/short quizzes

`src/lib/srs.ts:50-52` + `grading-pipeline.ts:170-171`

`countTasks` returns `10` when no `Aufgabe N` markers are found, and the split is `floor(total/2)`. For a legacy/short quiz with 1 real task, the graders are told "10 tasks," Co-Prüfer 2 is told to start at task 2 that doesn't exist, and they'll either invent missing answers or grade emptiness. Mostly hits old items, but it's a silent quality hit.

**Fix** — when the marker count is 0, fall back to *actually* counting answer blocks (or pass `totalTasks=unknown` and let the prompt grade what's present) rather than asserting 10.

### L4. "Due Now" is computed in UTC days

`src/app/DashboardClient.tsx:218-226` — `isDue` compares `Date.UTC(...)` truncated days. For a UTC+1/+2 user, an item due "today" can flip a day early/late around midnight local time. Minor, but it's the headline status on every card.

### L5. ICS feeds are unbounded

`src/app/api/calendar/route.ts` and `.../calendar/done/route.ts` serialize **all** items / **all** review logs with no limit or windowing. The "done" feed grows forever. Add a horizon (e.g. last 6 months / next 12 months).

### L6. Repo hygiene / dead weight
- ~40 ad-hoc scripts in `scripts/` (`test_api.js`, `test_api2.js`, `test_api3.js`, `fix-db.js`, `fix-db2.js`, …), plus `dev.log`, `dev2.log`, `dev3.log`, `test.txt` committed to the repo root. These are gitignored for `*.log` but the scripts are noise — move to a `tools/` dir or delete.
- `CODE_REVIEW.md` is **stale**: it documents bugs (the 0-byte Drive upload, the `savedFiles` shadow, the dangerous `extractSection`) that the current code has already fixed and refactored away. Its line numbers point at code that no longer exists, which will mislead the next reader. Replace it with this file or delete it.
- `getOrCreateDriveFolder`'s in-memory `folderLocks` map (`google-drive.ts:50`) only dedupes within a single instance — on serverless/multi-instance it can still create duplicate sibling folders. Fine for single-instance Cloud Run; note it if you scale out.

---

## What's already good (keep it)
- Shared `markers.ts` with the "never fall back to full text" contract, and `parseMismatchVerdict` anchoring instead of `.includes()` — both prevent prompt-injection feedback loops.
- Optimistic lock via `updateMany(where currentLevel)` — the right primitive, just applied too late (H2).
- NDJSON readers buffer partial lines, cap with `STREAM_TIMEOUT_MS`, and treat a silent stream death as "resync from DB" instead of hanging.
- Atomic `upsert` / `{ increment: 1 }` in `settings/route.ts`; `P2025` mapped to 404 in the delete route.
- Temp-file lifecycle in `quiz-generator.ts` (cleanup in `finally`, after the podcast workers consume the files) is carefully done.

---

### Suggested order of attack
1. **H1** (silent regression to Quiz 1) — correctness, affects real study outcomes.
2. **H3** (public endpoints) — one header check, stops cost/abuse.
3. **H2 / M1** (wasted + duplicated AI spend) — money.
4. **M2** (payload bloat) + **L1** (stuck button) — the two most felt "clunky" issues.
5. Everything else as cleanup.
