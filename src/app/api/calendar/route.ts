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

  const url = req.nextUrl;
  const lang = url.searchParams.get("lang") === "english" ? "english" : "german";
  const now = new Date();
  const baseUrl = req.nextUrl.origin;
  const eventLines: string[] = [];

  for (const item of items) {
    const reviewDate = new Date(item.nextReviewDate);
    const endDate = new Date(reviewDate);
    endDate.setDate(endDate.getDate() + 1);

    const interval = intervalLabelFor(item.currentLevel);
    const levelNum = item.currentLevel;
    const subjectLabel = item.subjectSub?.trim() ? `${item.subjectMain} - ${item.subjectSub}` : item.subjectMain;
    const tutorUrl = item.tutorPromptDocId ? `${baseUrl}/tutor/${item.tutorPromptDocId}` : (lang === "english" ? "None" : "Keine");
    const description = lang === "english" ? [
      `Your review for ${interval} (Level ${levelNum + 1})`,
      "",
      "📝 Your quiz for today:",
      `${baseUrl}/quiz/${item.id}`,
      "",
      `🤖 Tutor Doc ID (do not delete): ${tutorUrl}`,
    ].join("\n") : [
      `Dein Review für ${interval} (Level ${levelNum + 1})`,
      "",
      "📝 Dein Quiz für heute:",
      `${baseUrl}/quiz/${item.id}`,
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
      // Clickable deep link to the module's current quiz (standard ICS field,
      // surfaced as a tappable link/button by Apple & Google Calendar).
      `URL:${baseUrl}/quiz/${item.id}`,
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
