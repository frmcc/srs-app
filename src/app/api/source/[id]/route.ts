export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import { downloadFromDrive } from "@/lib/google-drive";

/**
 * Serves the ORIGINAL uploaded lecture PDF for a module, fetched from Google
 * Drive via the stored driveFileId. Opens inline in the browser (the built-in
 * PDF viewer offers a download). Linked from the dashboard's "Original-PDF"
 * button (shown only when hasSource is true).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const item = await prisma.sRSItem.findUnique({
      where: { id },
      select: { subjectMain: true, subjectSub: true, sourceMaterialContent: true },
    });
    if (!item || !item.sourceMaterialContent) {
      return new Response("Kein Original-Material vorhanden.", { status: 404 });
    }

    let driveFileId = "";
    try {
      driveFileId = JSON.parse(item.sourceMaterialContent).driveFileId || "";
    } catch {
      /* legacy non-JSON content — no downloadable Drive file */
    }
    if (!driveFileId) {
      return new Response("Kein Original-PDF für dieses Modul vorhanden.", { status: 404 });
    }

    const buffer = await downloadFromDrive(driveFileId);
    if (!buffer || buffer.length === 0) {
      return new Response("Original-PDF konnte nicht geladen werden.", { status: 502 });
    }

    const safeName =
      `${item.subjectMain}${item.subjectSub ? " - " + item.subjectSub : ""}`
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .trim() || "Vorlesungsmaterial";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        // inline → opens in the browser tab; the viewer's download button saves it.
        "Content-Disposition": `inline; filename="${safeName}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[source] Failed to serve source PDF:", err);
    return new Response(err instanceof Error ? err.message : "Internal Server Error", { status: 500 });
  }
}
