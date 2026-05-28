import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";


/**
 * Generates an ICS calendar feed with all upcoming SRS reviews.
 * 
 * Usage:
 * - Browser: Visit /api/calendar to download .ics file
 * - Apple Calendar: Add subscription → http://localhost:3000/api/calendar
 * - Google Calendar: Settings → Import → paste URL or upload file
 */
export async function GET(req: NextRequest) {
  const items = await prisma.sRSItem.findMany({
    orderBy: { nextReviewDate: "asc" },
  });

  const now = new Date();
  const calName = "SRS Quiz Reviews";

  // Build ICS content
  let ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SRS Quiz System//EN",
    `X-WR-CALNAME:${calName}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const item of items) {
    const reviewDate = new Date(item.nextReviewDate);
    const dateStr = formatICSDate(reviewDate);
    const endDate = new Date(reviewDate);
    endDate.setDate(endDate.getDate() + 1);
    const endDateStr = formatICSDate(endDate);

    const intervals = ["Tag 1", "Tag 3", "Tag 7", "Tag 21", "Tag 60", "Tag 180", "Tag 365"];
    const interval = intervals[item.currentLevel] || `Level ${item.currentLevel}`;
    const isDue = reviewDate <= now;

    const summary = `🧠 Review: ${item.subjectMain} - ${item.subjectSub}`;
    const description = [
      `📝 Quiz Level: ${item.currentLevel + 1} (${interval})`,
      isDue ? "⚡ FÄLLIG - Jetzt reviewen!" : `📅 Fällig am ${reviewDate.toLocaleDateString("de-DE")}`,
      "",
      `ID: ${item.id}`,
    ].join("\\n");

    ics.push(
      "BEGIN:VEVENT",
      `UID:srs-${item.id}@srs-quiz`,
      `DTSTAMP:${formatICSDateTime(now)}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${endDateStr}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION:Quiz Review: ${item.subjectMain}`,
      "END:VALARM",
      "END:VEVENT"
    );
  }

  ics.push("END:VCALENDAR");

  const icsContent = ics.join("\r\n");

  return new Response(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="srs-reviews.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

function formatICSDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatICSDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
