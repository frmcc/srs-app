import { prisma } from "@/lib/db";
import { currentQuizText } from "@/lib/srs";

/**
 * Shared list query for the dashboard (server page + /api/reviews).
 *
 * The seven quiz columns, blueprint, ledger, tutor prompt and video prompts
 * hold full LLM outputs — shipping all of them for every item made the list
 * payload megabytes. We project only what the dashboard renders and compute
 * `currentQuizText` (the one quiz the user can actually take) server-side.
 */
const LIST_SELECT = {
  id: true,
  subjectMain: true,
  subjectSub: true,
  semester: true,
  currentLevel: true,
  nextReviewDate: true,
  createdAt: true,
  lastFeedback: true,
  prePodcastUrl: true,
  postPodcastUrl: true,
  videoUrl: true,
  tutorPromptDocId: true,
  prePodcastPrompt: true,
  postPodcastPrompt: true,
  lastVideoPrompt1: true,
  lastVideoPrompt2: true,
  // Needed only to compute the `hasSource` boolean — the raw content never ships.
  sourceMaterialContent: true,
  // Needed to compute currentQuizText; stripped before the payload ships.
  quiz1DocId: true,
  quiz2DocId: true,
  quiz3DocId: true,
  quiz4DocId: true,
  quiz5DocId: true,
  quiz6DocId: true,
  quiz7DocId: true,
} as const;

export interface ReviewListItem {
  id: string;
  subjectMain: string;
  subjectSub: string;
  semester: number;
  currentLevel: number;
  nextReviewDate: Date;
  createdAt: Date;
  lastFeedback: string | null;
  prePodcastUrl: string | null;
  postPodcastUrl: string | null;
  videoUrl: string | null;
  tutorPromptDocId: string | null;
  prePodcastPrompt: string | null;
  postPodcastPrompt: string | null;
  lastVideoPrompt1: string | null;
  lastVideoPrompt2: string | null;
  generatedLevels: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  /** True if the original uploaded lecture PDF is downloadable via /api/source/[id]. */
  hasSource: boolean;
  /** The quiz text for the item's CURRENT level (the only one the UI shows). */
  currentQuizText: string;
  /** Failed attempts per level slot 0–6 (library shows "×N" markers). */
  failCounts: number[];
  /** Latest comprehension-check result (library weak-spot quiz); overwritten per run. */
  comprehensionScore: number | null;
  comprehensionPassed: boolean | null;
  comprehensionAt: string | null;
  comprehensionFeedback: string | null;
}

/** Current items store {driveFileId,...} in sourceMaterialContent; legacy rows may not. */
function hasDownloadableSource(content: string | null): boolean {
  if (!content) return false;
  try {
    return !!JSON.parse(content).driveFileId;
  } catch {
    return false;
  }
}

/** 30-day pass/total counts for the dashboard's right-rail card — computed
 *  server-side so the card paints with the first render instead of popping in
 *  after a client /api/stats round-trip. Mirrors /api/stats' WHERE
 *  (no "Freies Lernen") narrowed to the last 30 days.
 *
 *  `since` (optional): the exact window start. GET /api/reviews passes the
 *  client's local-midnight-minus-30-days cutoff — the same window StatsPanel
 *  computes — so the rail card and the Stats tab can never disagree by an
 *  off-by-one day. Without it (SSR, where the viewer's timezone is unknown)
 *  we fall back to a rolling now−30d window; the client's mount fetch
 *  revalidates with the exact cutoff moments later. */
export async function fetchPassRate30(since?: Date): Promise<{ passed: number; total: number }> {
  let cutoff = since;
  if (!cutoff || isNaN(cutoff.getTime())) {
    cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
  }
  const [total, passed] = await Promise.all([
    prisma.reviewLog.count({ where: { subjectMain: { not: "Freies Lernen" }, completedAt: { gte: cutoff } } }),
    prisma.reviewLog.count({ where: { subjectMain: { not: "Freies Lernen" }, completedAt: { gte: cutoff }, passed: true } }),
  ]);
  return { passed, total };
}

export async function fetchReviewList(): Promise<ReviewListItem[]> {
  const rows = await prisma.sRSItem.findMany({
    where: { subjectMain: { not: "Freies Lernen" } },
    orderBy: { nextReviewDate: "asc" },
    select: LIST_SELECT,
  });

  // Failed attempts per item+level (library "×N" markers). One grouped query.
  const failRows = await prisma.reviewLog.groupBy({
    by: ["itemId", "level"],
    where: { passed: false, itemId: { not: null } },
    _count: { _all: true },
  });
  const failMap = new Map<string, number[]>();
  for (const f of failRows) {
    if (!f.itemId) continue;
    const arr = failMap.get(f.itemId) ?? [0, 0, 0, 0, 0, 0, 0];
    const slot = Math.min(Math.max(f.level, 0), 6);
    arr[slot] += f._count._all;
    failMap.set(f.itemId, arr);
  }

  // Comprehension columns are heavy (feedback text), so fetch them ONLY for the
  // items that actually have a result, rather than widening the list projection.
  const compRows = await prisma.sRSItem.findMany({
    where: { subjectMain: { not: "Freies Lernen" }, comprehensionScore: { not: null } },
    select: {
      id: true,
      comprehensionScore: true,
      comprehensionPassed: true,
      comprehensionAt: true,
      comprehensionFeedback: true,
    },
  });
  const compMap = new Map(compRows.map((c) => [c.id, c]));

  return rows.map((row) => ({
    id: row.id,
    subjectMain: row.subjectMain,
    subjectSub: row.subjectSub,
    semester: row.semester,
    currentLevel: row.currentLevel,
    nextReviewDate: row.nextReviewDate,
    createdAt: row.createdAt,
    lastFeedback: row.lastFeedback,
    prePodcastUrl: row.prePodcastUrl,
    postPodcastUrl: row.postPodcastUrl,
    videoUrl: row.videoUrl,
    tutorPromptDocId: row.tutorPromptDocId,
    prePodcastPrompt: row.prePodcastPrompt,
    postPodcastPrompt: row.postPodcastPrompt,
    lastVideoPrompt1: row.lastVideoPrompt1,
    lastVideoPrompt2: row.lastVideoPrompt2,
    generatedLevels: [
      !!row.quiz1DocId, !!row.quiz2DocId, !!row.quiz3DocId, !!row.quiz4DocId,
      !!row.quiz5DocId, !!row.quiz6DocId, !!row.quiz7DocId,
    ] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean],
    hasSource: hasDownloadableSource(row.sourceMaterialContent),
    currentQuizText: currentQuizText(row),
    failCounts: failMap.get(row.id) ?? [0, 0, 0, 0, 0, 0, 0],
    comprehensionScore: compMap.get(row.id)?.comprehensionScore ?? null,
    comprehensionPassed: compMap.has(row.id) ? Boolean(compMap.get(row.id)?.comprehensionPassed) : null,
    comprehensionAt: compMap.get(row.id)?.comprehensionAt?.toISOString() ?? null,
    comprehensionFeedback: compMap.get(row.id)?.comprehensionFeedback ?? null,
  }));
}
