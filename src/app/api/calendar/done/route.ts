export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const logs = await prisma.reviewLog.findMany({
    orderBy: { completedAt: "asc" },
  });

  const now = new Date();
  const calName = "✅ Done Quiz Reviews";

  let ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SRS Quiz System//EN",
    `X-WR-CALNAME:${calName}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const log of logs) {
    const reviewDate = new Date(log.completedAt);
    const dateStr = formatICSDate(reviewDate);
    // An all-day event for the day it was completed
    const endDate = new Date(reviewDate);
    endDate.setDate(endDate.getDate() + 1);
    const endDateStr = formatICSDate(endDate);

    const intervals = ["Tag 1", "Tag 3", "Tag 7", "Tag 21", "Tag 60", "Tag 180", "Tag 365"];
    const interval = intervals[log.level] || `Tag ?`;
    const levelNum = log.level + 1;
    
    const emoji = log.passed ? "✅" : "🔄";
    const status = log.passed ? "BESTANDEN" : "WIEDERHOLEN";

    const summary = `${emoji} ${status}: ${log.subjectMain} - ${log.subjectSub}`;
    const description = [
      `Abgeschlossen am: ${reviewDate.toLocaleString("de-DE")}`,
      `Level: ${interval} (Level ${levelNum})`,
    ].join("\n");

    ics.push(
      "BEGIN:VEVENT",
      `UID:srs-log-${log.id}@srs-quiz`,
      `DTSTAMP:${formatICSDateTime(now)}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${endDateStr}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }

  ics.push("END:VCALENDAR");

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
      "Content-Disposition": 'inline; filename="srs-done.ics"',
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
