export const dynamic = "force-dynamic";

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
    const interval = intervals[item.currentLevel] || `Tag ?`;
    const levelNum = item.currentLevel + 1;
    const baseUrl = req.nextUrl.origin;

    const summary = `🧠 Review: ${item.subjectMain} - ${item.subjectSub}`;
    const tutorUrl = item.tutorPromptDocId ? `${baseUrl}/tutor/${item.tutorPromptDocId}` : 'Keine';
    const description = [
      `Dein Review für ${interval} (Level ${levelNum})`,
      "",
      "📝 Dein Quiz für heute:",
      `${baseUrl}/`,
      "",
      `🤖 Tutor Doc ID (Nicht löschen): ${item.tutorPromptDocId || "Keine"}`,
      "",
      "🔗 Link zum Prompt:",
      tutorUrl,
    ].join("\n");

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

  // Fold lines at 75 characters as required by iCalendar RFC 5545
  const icsContent = ics
    .map(line => {
      if (line.length <= 75) return line;
      let folded = "";
      let currentLine = line;
      while (currentLine.length > 75) {
        folded += currentLine.substring(0, 75) + "\r\n ";
        currentLine = currentLine.substring(75);
      }
      folded += currentLine;
      return folded;
    })
    .join("\r\n");

  return new Response(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="srs-reviews.ics"',
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
  return text
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/;/g, "\\;")   // Escape semicolons
    .replace(/,/g, "\\,")   // Escape commas
    .replace(/\n/g, "\\n"); // Replace actual newlines with the literal \n string for ICS
}
