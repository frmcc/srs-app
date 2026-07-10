import { NextRequest, NextResponse } from "next/server";
import { fetchReviewList, fetchPassRate30 } from "@/lib/review-query";

export async function GET(req: NextRequest) {
  try {
    // PP-6/IA-4 — the 30-day pass rate rides along with every list refetch so
    // the dashboard's rail card stays live after grading. The client sends its
    // local-midnight-minus-30-days cutoff (`passRateSince`) so the window
    // matches the Stats tab's local-day aggregation; absent or invalid, the
    // server falls back to a rolling now−30d window.
    const sinceParam = req.nextUrl.searchParams.get("passRateSince");
    const parsed = sinceParam ? new Date(sinceParam) : null;
    const since = parsed && !isNaN(parsed.getTime()) ? parsed : undefined;
    const [items, passRate30] = await Promise.all([fetchReviewList(), fetchPassRate30(since)]);
    return NextResponse.json({ items, passRate30 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
