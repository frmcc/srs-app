export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { intervalLabelFor } from "@/lib/srs";
import { buildCalendar, escapeICS, formatICSDate, formatICSDateTime, icsResponse } from "@/lib/ics";

/**
 * ICS feed of all upcoming SRS reviews.
 * Subscribe in Apple/Google Calendar via the /api/calendar URL.
 */
export async function GET(req: NextRequest) {
  const items = await prisma.sRSItem.findMany({
    where: { subjectMain: { not: "Freies Lernen" } },
    orderBy: { nextReviewDate: "asc" },
    select: {
      id: true,
      subjectMain: true,
      subjectSub: true,
      currentLevel: true,
      nextReviewDate: true,
      tutorPromptDocId: true,
    },
  });

  const now = new Date();
  const baseUrl = req.nextUrl.origin;
  const eventLines: string[] = [];

  for (const item of items) {
    const reviewDate = new Date(item.nextReviewDate);
    const endDate = new Date(reviewDate);
    endDate.setDate(endDate.getDate() + 1);

    const subjectLabel = item.subjectSub?.trim() ? `${item.subjectMain} - ${item.subjectSub}` : item.subjectMain;
    const tutorUrl = item.tutorPromptDocId ? `${baseUrl}/tutor/${item.tutorPromptDocId}` : "Keine";
    const description = [
      `Dein Review für ${intervalLabelFor(item.currentLevel)} (Level ${item.currentLevel})`,
      "",
      "📝 Dein Quiz für heute:",
      `${baseUrl}/?quizId=${item.id}`,
      "",
      `🤖 Tutor Doc ID (Nicht löschen): ${tutorUrl}`,
    ].join("\n");

    eventLines.push(
      "BEGIN:VEVENT",
      `UID:srs-${item.id}@srs-quiz`,
      `DTSTAMP:${formatICSDateTime(now)}`,
      `DTSTART;VALUE=DATE:${formatICSDate(reviewDate)}`,
      `DTEND;VALUE=DATE:${formatICSDate(endDate)}`,
      `SUMMARY:${escapeICS(`Review: ${subjectLabel}`)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeICS(`Quiz Review: ${item.subjectMain}`)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  }

  return icsResponse(buildCalendar("SRS Quiz Reviews", eventLines), "srs-reviews.ics");
}
