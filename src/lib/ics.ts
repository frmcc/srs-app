/**
 * Shared iCalendar (RFC 5545) helpers for the two calendar feeds.
 * Single source of truth for escaping, date formatting, line folding,
 * and calendar assembly — previously duplicated in both routes.
 */

/** Escape text for use in ICS property values. Backslashes first. */
export function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    // Collapse ALL newline forms (incl. a bare \r) to the literal "\n" escape.
    // A raw carriage return left in a property value splits the line mid-value
    // and makes strict parsers (Apple Calendar) reject the whole feed.
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * All-day date: YYYYMMDD in UTC. The server runs in UTC and nextReviewDate is
 * computed in UTC, so formatting with local components would shift dates near
 * midnight by a day. Use UTC components to match.
 */
export function formatICSDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** UTC timestamp: YYYYMMDDTHHMMSSZ. */
export function formatICSDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Fold a content line at 75 OCTETS (not characters) per RFC 5545 §3.1.
 * The old char-based fold could split a multi-byte UTF-8 sequence
 * (umlauts in subject names, the ✅ in the done-feed name), producing
 * invalid bytes that make Apple/Google Calendar reject the feed.
 * Splits are byte-budgeted but always land on character boundaries.
 */
export function foldICSLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First line gets 75 octets; continuation lines lose 1 octet to the leading space.
  let budget = 75;

  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, "utf8");
    if (currentBytes + chBytes > budget) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
      budget = 74;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

/** Assemble a complete VCALENDAR document with proper folding + CRLF. */
export function buildCalendar(name: string, eventLines: string[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SRS Quiz System//EN",
    `X-WR-CALNAME:${escapeICS(name)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...eventLines,
    "END:VCALENDAR",
  ];
  return lines.map(foldICSLine).join("\r\n") + "\r\n";
}

/** Standard response wrapper for an ICS feed. */
export function icsResponse(content: string, filename: string): Response {
  return new Response(content, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
