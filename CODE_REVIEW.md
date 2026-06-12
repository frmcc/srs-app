# Code Review — SRS App

Full read of every source file. Findings ordered by severity. Line numbers verified against current code.

---

## 🔴 CRITICAL — Data corruption & silent failures

### C1. Web-created items upload a **0-byte file** to Drive → all future grading is corrupted

`src/app/api/quiz/route.ts`

Line 94 strips the base64 to save DB space:
```ts
dbFilesData.push({ name: ..., mimeType: ..., base64: "" }); // "Base64 removed to save database space"
```
Line 209 then uses that same array for the Drive upload:
```ts
firstFile.base64 ? Buffer.from(firstFile.base64, "base64") : Buffer.from("")
```
The condition is always false → an **empty file** is uploaded, and its `driveFileId` is saved in `sourceMaterialContent`. Every later grading run downloads this empty PDF as "Vorlesungsmaterial" — the Co-Prüfer grade against nothing and reconstruct expected answers from thin air. This is the worst bug in the repo: it silently poisons every item created via the web UI (the Shortcut path in `quiz-generator.ts` reads from disk and is unaffected). The podcast workers are also starved: `if (!file.base64) continue;` skips every upload.

**Fix** — keep buffers in memory for the request, strip only for the DB:
```ts
// during file collection (you already have the bytes):
const uploadBuffers: { name: string; mimeType: string; buffer: Buffer }[] = [];
for (const file of files) {
  const buffer = Buffer.from(await file.arrayBuffer());
  uploadBuffers.push({ name: file.name, mimeType: file.type, buffer });
  dbFilesData.push({ name: file.name, mimeType: file.type, base64: "" }); // DB copy stays slim
}

// Drive upload:
const firstFile = uploadBuffers[0];
const uploadedFile = await uploadToDrive(firstFile.name, firstFile.buffer, firstFile.mimeType, folderId);

// podcast workers: pass uploadBuffers (or base64 from them), not dbFilesData
```

### C2. Two `extractSection` implementations — one safe, one dangerous

`src/app/api/quiz/route.ts:16-21`:
```ts
return match ? match[1].trim() : text.trim();   // ← returns the ENTIRE model output on marker failure
```
`src/lib/quiz-generator.ts` has the fixed version returning `""`, with a comment explaining exactly why: *"Returning the entire unparsed text would cause a catastrophic prompt-injection loop."* You fixed this bug once and the old copy is still live on the web path. If the model omits a marker, the full multi-section output (blueprint + quiz + ledger + audit) gets stored as `quiz1DocId`, fed back into the mismatch checker and next-quiz generation, and compounds. Same family: `grade/route.ts:363` falls back to `videoPromptsText` for `lastVideoPrompt1`.

**Fix** — one shared helper, delete both locals:
```ts
// src/lib/markers.ts
export function extractSection(text: string | undefined, start: string, end: string): string {
  if (!text) return "";
  const m = text.match(new RegExp(`${start}([\\s\\S]*?)${end}`));
  return m ? m[1].trim() : "";   // NEVER fall back to full text
}
```

### C3. `savedFiles` shadowing kills failure cleanup

`src/app/api/quiz/submit/route.ts` — outer array (line 21) is what `finally` (line 94) iterates; the inner `const savedFiles` (line 42) shadows it inside `try`. On any failure before the worker is scheduled, the `finally` loops over an **always-empty array** → temp files leak forever in `uploads/`. The committed `uploads/*.pdf` in the repo are the evidence.

**Fix** — delete line 42, widen the outer type:
```ts
const savedFiles: { name: string; path: string; mimeType: string; base64: string }[] = [];
// ...
savedFiles.push({ ... });  // same array the finally block sees
```

### C4. Mismatch gate: fail-open AND false-positive

`grade/route.ts:182` (and the duplicate in `grade/shortcut/route.ts`):
```ts
if (mismatchCheckText.includes("MISMATCH")) throw ...
```
Two failure modes: a verbose reply concluding "…das ist KEIN MISMATCH" aborts a valid grading run; and any unexpected reply that mentions neither word silently passes as MATCH (fail-open). The prompt demands a single word — anchor on it:
```ts
const verdict = mismatchCheckText.trim().toUpperCase();
if (/^MISMATCH\b/.test(verdict)) throw new Error("Mismatch: wrong quiz sheet uploaded");
if (!/^MATCH\b/.test(verdict)) console.warn("[Mismatch check] ambiguous verdict:", verdict.slice(0, 80));
```
Same pattern for the decision parse at line 245: `decisionStr.startsWith("PASS")` makes the two equality checks dead code, and an **empty/unparsed marker silently becomes REPEAT** — the student gets demoted because a regex missed. Detect parse failure explicitly and surface it in the stream instead of defaulting.

### C5. Podcast route creates a raw `PrismaClient` — wrong DB in production

`src/app/api/podcast/generate/route.ts:16-17`:
```ts
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
```
This bypasses `src/lib/db.ts` entirely: no Turso/libsql adapter, so in prod it talks to a local SQLite file that isn't your database (or crashes), and it never disconnects → connection leak per invocation. **Fix:** `import { prisma } from "@/lib/db";` — that's the whole point of the singleton.

### C6. Zero auth on every endpoint

`DELETE /api/reviews/[id]`, the semester-reset action, settings writes, quiz submission — all publicly callable if the host is reachable. The Shortcut endpoints especially are designed for remote calls. One env var fixes it:
```ts
// src/lib/auth.ts
export function assertAuth(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token !== process.env.APP_SECRET) throw new Response("Unauthorized", { status: 401 });
}
```
Call it first in every mutating route; add the header to the iPhone Shortcut. (Also: the hardcoded proxy-key fallback `"123456"` in `gemini-retry.ts:4` should be removed — fail loudly if unset.)

### C7. Stuck jobs = infinite polling loop on the Shortcut path

`generateContentWithRetry` can legally sleep 10 + 60×4 = **250s** per step; the grading pipeline runs ~6 steps. With `maxDuration = 300`, Vercel kills the function mid-`after()` — and the `BackgroundJob` row stays `processing` **forever**. A Shortcut that polls `GET /api/quiz/submit?jobId=…` until `done` never terminates. This is the literal infinite loop you asked me to hunt for.

**Fix** (two parts):
```ts
// 1. Stale-job detection in the GET poller:
const STALE_MS = 15 * 60 * 1000;
if (job.status === "processing" && Date.now() - job.updatedAt.getTime() > STALE_MS) {
  await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: "failed", error: "Timed out" } });
}
// 2. Budget the retries: cap total wait per step (e.g. 90s), not 250s.
```

---

## 🟠 RACE CONDITIONS

### R1. Concurrent grading of the same item
Two simultaneous grade requests both read `currentLevel = 2`, both pass, both write `currentLevel = 3` — one promotion lost, two quizzes written to different fields against the same baseline. Optimistic lock:
```ts
const updated = await prisma.sRSItem.updateMany({
  where: { id: srsItem.id, currentLevel: srsItem.currentLevel },  // version check
  data: updatePayload,
});
if (updated.count === 0) throw new Error("Item was modified concurrently — grading aborted");
```

### R2. `getOrCreateDriveFolder` list-then-create
Two parallel generations for the same module each list (empty), each create → duplicate Drive folders, items split between them. Serialize with an in-process mutex keyed by folder path (sufficient for a single-instance app), or re-list after create and merge.

### R3. `getOrCreateConfig` first-boot race
Two requests both `findUnique` (null) → both `create` id=1 → one throws P2002. Use `prisma.appConfig.upsert({ where: { id: 1 }, create: {...}, update: {} })`.

---

## 🟡 UX — why the app feels clunky (`DashboardClient.tsx`)

### U1. The dashboard never refreshes once loaded
Line 251:
```ts
if (activeTab === "dashboard" && upcomingReviews.length === 0) fetchReviews();
```
After the first load the condition is permanently false. Combined with: `handleGenerate`'s `done` handler resets the form after a 3s `setTimeout` **without** calling `fetchReviews()` (new module invisible until hard reload), and `handleGrade`'s `done` shows the result but never merges `data.data.srsItem` into `upcomingReviews` (stale level/date behind the modal). This trio is the single biggest "clunky" factor.

**Fix:**
```ts
useEffect(() => { if (activeTab === "dashboard") fetchReviews(); }, [activeTab]);
// in handleGenerate done-branch:  await fetchReviews();
// in handleGrade done-branch:
setUpcomingReviews(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
```

### U2. Spinner of death when a stream dies silently
Both stream readers only flip `isGrading`/`isGenerating` on an explicit `done`/`error` event. If the connection drops or the function times out (see C7), the loop just ends → button disabled forever, no message. Wrap the reader:
```ts
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // ...parse events
  }
} finally {
  setIsGrading(false);   // ALWAYS recover the UI
  if (!receivedTerminalEvent) setError("Verbindung abgebrochen — bitte erneut versuchen.");
}
```

### U3. Permanent "Wird generiert…" placeholders
Podcast/video cells show "generating" whenever the URL is null — including items where generation failed weeks ago or never started. `generatingPodcasts[stateKey]` is set but never cleared on success. Track real status (the `BackgroundJob` table already exists — expose it) or at minimum clear the flag and show "Nicht verfügbar – erneut generieren" after a timeout.

### U4. `alert()` / `confirm()` for errors and deletes
Blocking native dialogs in an otherwise polished dark UI. Replace with the inline error surface you already have for the grading modal, and an undo-style toast for deletes.

---

## 🟢 PERFORMANCE

### P1. Megabyte payloads on every dashboard load
`page.tsx` and `/api/reviews` both `findMany` with **no `select`** — every row carries 7 full quiz texts, blueprint, coverage ledger, tutor prompt, feedback. The dashboard list needs ~8 scalar fields. And it's fetched twice (SSR `initialItems` + client refetch).
```ts
const items = await prisma.sRSItem.findMany({
  where: { subjectMain: { not: "Freies Lernen" } },
  orderBy: { nextReviewDate: "asc" },
  select: { id: true, subjectMain: true, subjectSub: true, currentLevel: true,
            nextReviewDate: true, createdAt: true,
            prePodcastUrl: true, postPodcastUrl: true, videoUrl: true },
});
```
Fetch the heavy fields (`quizNDocId`, `lastFeedback`) on demand when a card is opened.

### P2. Missing indexes
Every dashboard query sorts/filters on unindexed columns. In `schema.prisma`:
```prisma
@@index([nextReviewDate])
@@index([subjectMain])
```

### P3. Drive doc creation awaited inside the grading stream
`createGoogleDoc` (lines 436, 464) blocks the user-facing stream for seconds; it's a side effect. Move both into the existing `after()` block alongside the video-prompt worker.

---

## 🔵 CODE QUALITY / ARCHITECTURE

### Q1. The grading pipeline exists twice and is already drifting
`grade/route.ts` vs `grade/shortcut/route.ts` (~400 duplicated lines). Confirmed drift: task count `/Aufgabe \d+/g` fallback 10 vs `/^\d+\.|^\*\s/gm` fallback 5; `INTERVAL` label `"Tag X"` vs `` `Level ${n}` `` (the prompts reason about "Quiz-Intervall" — `Level 3` is noise to them); shortcut passes raw `quizQuestions` to the mismatch check; fail-branch reuses `lmUserParts` for the remedial quiz. Every future fix must be made twice and won't be. **Do what you already did for generation** (`lib/quiz-generator.ts`): extract `lib/grading-pipeline.ts` with a `runGradingPipeline(item, submission, emit)` where `emit` is a progress callback — the web route streams it, the shortcut route logs it. Same for `quiz/route.ts` vs `quiz-generator.ts` (which is where C1/C2 came from).

### Q2. Schema honesty
`quiz1DocId…quiz7DocId` store full quiz **text**, not Doc IDs; `videoUrl` stores a JSON history array; `sourceMaterialContent` stores JSON `{driveFileId, driveFolderId}` with two legacy shapes parsed defensively all over. Rename (`quiz1Text`, `videoHistory`), or at least add real columns `driveFileId`/`driveFolderId` and a `VideoPrompt` relation. The `if (prisma.reviewLog)` stale-client guard in grade/route.ts should be deleted — regenerate the client instead of coding around it.

### Q3. Repo hygiene / secrets
Committed: `.env`, `.env.yaml` (live keys → **rotate them**), `dev.db`, `prisma/dev.db`, `uploads/*.pdf`, `dev*.log`, `tsconfig.tsbuildinfo`, and ~40 one-off scripts (`test_*.js`, `fix-db*.js`, `migrate*.js`…). Add to `.gitignore`, `git rm --cached`, move keeper scripts to `scripts/` with a README line each.

### Q4. Misc (quick wins)
- ICS helpers (`formatICSDate`, `escapeICS`, folding) duplicated across `calendar/` and `calendar/done/`; folding counts chars not octets → spec says 75 **octets**, German umlauts can overflow. Share one `lib/ics.ts`, fold on `Buffer.byteLength`.
- `tutor/[id]/page.tsx` lacks the legacy `tutorPromptDocId` fallback its API twin has, and runs `findUnique` twice (metadata + page) — wrap in React `cache()`.
- `gemini-retry.ts`: retry classification by message substring is brittle (`includes("429")` matches any text containing 429); prefer `error.status` and treat substrings as last resort. Each "attempt" is up to 2 model calls (wrapper + official) — intended, but worth a comment; it doubles cost under proxy flakiness.
- `reviews/[id]` DELETE returns 500 for not-found — check P2025 → 404.
- `grade/route.ts` has no `try/catch` around `req.json()` — malformed body = unhandled 500 before the stream starts.
- Level-cap split brain: `Math.min(currentLevel+1, 6)` at line 276 (generation) vs uncapped `currentLevel + 1` at line 407 (DB). It happens to compose correctly today, but the invariant lives in two places — derive both from one `nextLevelFor(item)` helper.

---

## Priority order

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | C1 empty Drive upload | ~10 lines | stops ongoing data corruption |
| 2 | C2 shared `extractSection` | ~15 min | prevents prompt-feedback loops |
| 3 | C5 podcast PrismaClient | 2 lines | prod correctness |
| 4 | C3 savedFiles shadowing | 1 line | disk leak |
| 5 | U1+U2 dashboard refresh + stream recovery | ~1 h | biggest perceived-quality jump |
| 6 | C7 stale-job detection | ~30 min | kills the infinite poll loop |
| 7 | C4 mismatch/decision parsing | ~30 min | grading reliability |
| 8 | C6 auth + key rotation | ~1 h | security |
| 9 | P1+P2 select + indexes | ~30 min | dashboard speed |
| 10 | Q1 unify grading pipeline | ~half day | makes everything above maintainable once |

**Audit note (C1):** every SRSItem created through the web UI has a corrupt `driveFileId`. After fixing, run a one-off script: download each referenced file, flag the 0-byte ones, and re-upload from `uploads/` where the original still exists.
