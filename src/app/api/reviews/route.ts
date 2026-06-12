import { NextResponse } from "next/server";
import { fetchReviewList } from "@/lib/review-query";

export async function GET() {
  try {
    return NextResponse.json(await fetchReviewList());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
