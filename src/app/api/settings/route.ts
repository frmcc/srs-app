import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Helper to ensure config exists
async function getOrCreateConfig() {
  let config = await prisma.appConfig.findUnique({
    where: { id: 1 },
  });

  if (!config) {
    config = await prisma.appConfig.create({
      data: {
        id: 1,
        currentSemester: 1,
        modulePresets: "[]",
        language: "german"
      },
    });
  }
  return config;
}

export async function GET() {
  try {
    const config = await getOrCreateConfig();
    return NextResponse.json({
      currentSemester: config.currentSemester,
      modulePresets: JSON.parse(config.modulePresets),
      language: config.language,
      wrapperMode: config.wrapperMode
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, presets, language } = body;
    const config = await getOrCreateConfig();

    if (action === "update_presets") {
      if (!Array.isArray(presets)) {
        return NextResponse.json({ error: "presets must be an array" }, { status: 400 });
      }
      const updated = await prisma.appConfig.update({
        where: { id: 1 },
        data: {
          modulePresets: JSON.stringify(presets),
        },
      });
      return NextResponse.json({
        currentSemester: updated.currentSemester,
        modulePresets: JSON.parse(updated.modulePresets),
        language: updated.language
      });
    }

    if (action === "update_language") {
      const updated = await prisma.appConfig.update({
        where: { id: 1 },
        data: {
          language: language,
        },
      });
      return NextResponse.json({
        currentSemester: updated.currentSemester,
        modulePresets: JSON.parse(updated.modulePresets),
        language: updated.language,
        wrapperMode: updated.wrapperMode
      });
    }

    if (action === "update_wrapper_toggle") {
      const { wrapperMode } = body;
      const updated = await prisma.appConfig.update({
        where: { id: 1 },
        data: {
          wrapperMode: wrapperMode,
        },
      });
      return NextResponse.json({
        currentSemester: updated.currentSemester,
        modulePresets: JSON.parse(updated.modulePresets),
        language: updated.language,
        wrapperMode: updated.wrapperMode
      });
    }

    if (action === "new_semester") {
      const updated = await prisma.appConfig.update({
        where: { id: 1 },
        data: {
          currentSemester: config.currentSemester + 1,
          modulePresets: "[]",
        },
      });
      return NextResponse.json({
        currentSemester: updated.currentSemester,
        modulePresets: JSON.parse(updated.modulePresets),
        language: updated.language
      });
    }

    if (action === "reset_semester") {
      const updated = await prisma.appConfig.update({
        where: { id: 1 },
        data: {
          currentSemester: 1,
          modulePresets: "[]",
        },
      });
      return NextResponse.json({
        currentSemester: updated.currentSemester,
        modulePresets: JSON.parse(updated.modulePresets),
        language: updated.language
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
