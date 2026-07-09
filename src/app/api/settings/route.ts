import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { AppConfig } from "@prisma/client";

// Atomic find-or-create — the old findUnique-then-create pattern threw a
// unique-constraint error when two requests raced on first boot.
function getOrCreateConfig() {
  return prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, currentSemester: 1, modulePresets: "[]", language: "german" },
  });
}

function serialize(config: AppConfig) {
  let presets: unknown = [];
  try {
    presets = JSON.parse(config.modulePresets);
  } catch {
    /* corrupted column — return empty rather than 500 */
  }
  return {
    currentSemester: config.currentSemester,
    modulePresets: presets,
    language: config.language,
    wrapperMode: config.wrapperMode,
    fileTransport: config.fileTransport,
  };
}

export async function GET() {
  try {
    return NextResponse.json(serialize(await getOrCreateConfig()));
  } catch (e) {
    console.error("[settings] request failed:", e);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: { action?: string; presets?: unknown; language?: string; wrapperMode?: string; fileTransport?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { action, presets, language, wrapperMode, fileTransport } = body;
    await getOrCreateConfig();

    switch (action) {
      case "update_presets": {
        if (!Array.isArray(presets)) {
          return NextResponse.json({ error: "presets must be an array" }, { status: 400 });
        }
        // Bound the blob: string entries only, capped count and length. The UI
        // renders these as a string list, and unbounded/typed junk could bloat
        // the column or break rendering.
        if (presets.length > 200 || !presets.every((p) => typeof p === "string" && p.length <= 200)) {
          return NextResponse.json({ error: "presets must be at most 200 strings of ≤200 chars" }, { status: 400 });
        }
        const updated = await prisma.appConfig.update({
          where: { id: 1 },
          data: { modulePresets: JSON.stringify(presets) },
        });
        return NextResponse.json(serialize(updated));
      }

      case "update_language": {
        if (language !== "german" && language !== "english") {
          return NextResponse.json({ error: "language must be 'german' or 'english'" }, { status: 400 });
        }
        const updated = await prisma.appConfig.update({ where: { id: 1 }, data: { language } });
        return NextResponse.json(serialize(updated));
      }

      case "update_wrapper_toggle": {
        if (wrapperMode !== "all" && wrapperMode !== "generation_only" && wrapperMode !== "none") {
          return NextResponse.json({ error: "wrapperMode must be 'all', 'generation_only' or 'none'" }, { status: 400 });
        }
        const updated = await prisma.appConfig.update({ where: { id: 1 }, data: { wrapperMode } });
        return NextResponse.json(serialize(updated));
      }

      case "update_file_transport": {
        if (fileTransport !== "inline" && fileTransport !== "file_api") {
          return NextResponse.json({ error: "fileTransport must be 'inline' or 'file_api'" }, { status: 400 });
        }
        const updated = await prisma.appConfig.update({ where: { id: 1 }, data: { fileTransport } });
        return NextResponse.json(serialize(updated));
      }

      case "new_semester": {
        // Atomic increment — read-then-write raced under concurrent clicks.
        const updated = await prisma.appConfig.update({
          where: { id: 1 },
          data: { currentSemester: { increment: 1 }, modulePresets: "[]" },
        });
        return NextResponse.json(serialize(updated));
      }

      case "reset_semester": {
        const updated = await prisma.appConfig.update({
          where: { id: 1 },
          data: { currentSemester: 1, modulePresets: "[]" },
        });
        return NextResponse.json(serialize(updated));
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (e) {
    console.error("[settings] request failed:", e);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
