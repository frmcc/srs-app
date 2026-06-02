import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";


export async function GET() {
  try {
    const reviews = await prisma.sRSItem.findMany({
      where: {
        subjectMain: {
          not: "Freies Lernen"
        }
      },
      orderBy: { nextReviewDate: "asc" }
    });

    return NextResponse.json(reviews);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
