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
  // Public base URL. req.nextUrl.host is the INTERNAL Cloud Run bind (0.0.0.0:8080),
  // so prefer the forwarded / Host headers; APP_BASE_URL overrides for certainty.
  const envBase = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const rawHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  // Normalise the host to plausible characters only, so a spoofed
  // X-Forwarded-Host can't point the event links at an arbitrary origin.
  const host = /^[a-zA-Z0-9.\-:]+$/.test(rawHost) ? rawHost : req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || (/^(localhost|0\.0\.0\.0|127\.)/.test(host) ? "http" : "https");
  const baseUrl = envBase || `${proto}://${host}`;
  const eventLines: string[] = [];

  for (const item of items) {
    const reviewDate = new Date(item.nextReviewDate);
    const endDate = new Date(reviewDate);
    // UTC to match formatICSDate (all-day DTEND is exclusive = start + 1 day).
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    const interval = intervalLabelFor(item.currentLevel);
    const levelNum = item.currentLevel;
    const subjectLabel = item.subjectSub?.trim() ? `${item.subjectMain} - ${item.subjectSub}` : item.subjectMain;
    const tutorUrl = item.tutorPromptDocId ? `${baseUrl}/tutor/${item.tutorPromptDocId}` : (lang === "english" ? "None" : "Keine");
    const description = lang === "english" ? [
      `Your review for ${interval} (Level ${levelNum + 1})`,
      "",
      `🤖 Tutor Doc ID (do not delete): ${tutorUrl}`,
    ].join("\n") : [
      `Dein Review für ${interval} (Level ${levelNum + 1})`,
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
      // surfaced as a tappable link/button by Apple & Google Calendar). Escaped
      // like every other value so the host can't inject ICS syntax.
      `URL:${escapeICS(`${baseUrl}/quiz/${item.id}`)}`,
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
