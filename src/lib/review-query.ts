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
  /** The quiz text for the item's CURRENT level (the only one the UI shows). */
  currentQuizText: string;
}

export async function fetchReviewList(): Promise<ReviewListItem[]> {
  const rows = await prisma.sRSItem.findMany({
    where: { subjectMain: { not: "Freies Lernen" } },
    orderBy: { nextReviewDate: "asc" },
    select: LIST_SELECT,
  });

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
    currentQuizText: currentQuizText(row),
  }));
}
