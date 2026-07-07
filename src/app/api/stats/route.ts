export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Slim stats payload for the Statistik tab.
 *
 * Only raw review logs (last 365 days) + all-time totals are returned.
 * Streak, heatmap, pass rates and per-module aggregation happen CLIENT-side,
 * because "day" boundaries must use the user's local timezone — the server
 * (Cloud Run) runs in UTC and would re-introduce the midnight-drift bug.
 * The due-forecast needs no extra data: the dashboard already has all
 * nextReviewDate values in memory.
 */
export async function GET() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 365);

    const [logs, total, passed] = await Promise.all([
      prisma.reviewLog.findMany({
        where: {
          completedAt: { gte: since },
          subjectMain: { not: "Freies Lernen" },
        },
        orderBy: { completedAt: "asc" },
        select: {
          completedAt: true,
          passed: true,
          level: true,
          subjectMain: true,
          // For the client-side semester filter: logs are attributed to a
          // semester via itemId → item lookup, falling back to subject match.
          subjectSub: true,
          itemId: true,
        },
      }),
      prisma.reviewLog.count({ where: { subjectMain: { not: "Freies Lernen" } } }),
      prisma.reviewLog.count({ where: { subjectMain: { not: "Freies Lernen" }, passed: true } }),
    ]);

    return NextResponse.json({ logs, totals: { total, passed } });
  } catch (err) {
    console.error("[stats] Failed to load stats:", err);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
