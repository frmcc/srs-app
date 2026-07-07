export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { intervalLabelFor } from "@/lib/srs";
import { buildCalendar, escapeICS, formatICSDate, formatICSDateTime, icsResponse } from "@/lib/ics";

/** ICS feed of completed reviews (one all-day event per review log). */
export async function GET() {
  const logs = await prisma.reviewLog.findMany({
    orderBy: { completedAt: "asc" },
    select: {
      id: true,
      subjectMain: true,
      subjectSub: true,
      level: true,
      passed: true,
      completedAt: true,
    },
  });

  const now = new Date();
  const eventLines: string[] = [];

  for (const log of logs) {
    const reviewDate = new Date(log.completedAt);
    const endDate = new Date(reviewDate);
    // UTC to match formatICSDate (all-day DTEND is exclusive = start + 1 day).
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    const subjectLabel = log.subjectSub?.trim() ? `${log.subjectMain} - ${log.subjectSub}` : log.subjectMain;
    const summary = log.passed ? `Completed: ${subjectLabel}` : `Repeat: ${subjectLabel}`;
    const description = [
      `Abgeschlossen am: ${reviewDate.toLocaleString("de-DE")}`,
      `Level: ${intervalLabelFor(log.level)} (Level ${log.level})`,
    ].join("\n");

    eventLines.push(
      "BEGIN:VEVENT",
      `UID:srs-log-${log.id}@srs-quiz`,
      `DTSTAMP:${formatICSDateTime(now)}`,
      `DTSTART;VALUE=DATE:${formatICSDate(reviewDate)}`,
      `DTEND;VALUE=DATE:${formatICSDate(endDate)}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }

  return icsResponse(buildCalendar("✅ Done Quiz Reviews", eventLines), "srs-done.ics");
}
