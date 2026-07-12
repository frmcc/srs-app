import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { AppConfig } from "@prisma/client";
import { parseWrapperModules, parseStepModels } from "@/lib/wrapper-modules";

const ALLOWED_MODELS = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"];

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
    wrapperModules: parseWrapperModules(config.wrapperModules),
    fileTransport: config.fileTransport,
    aiModel: config.aiModel,
    stepModels: parseStepModels(config.stepModels),
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
    let body: { action?: string; presets?: unknown; language?: string; aiModel?: string; stepModels?: unknown; wrapperMode?: string; wrapperModules?: unknown; fileTransport?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { action, presets, language, aiModel, stepModels, wrapperMode, wrapperModules, fileTransport } = body;
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

      case "update_wrapper_modules": {
        // Per-module wrapper on/off: a JSON map { "<module>": true }. Only the
        // ticked (true) modules are kept, module names capped like presets.
        if (typeof wrapperModules !== "object" || wrapperModules === null || Array.isArray(wrapperModules)) {
          return NextResponse.json({ error: "wrapperModules must be an object map" }, { status: 400 });
        }
        const clean: Record<string, true> = {};
        const entries = Object.entries(wrapperModules as Record<string, unknown>);
        if (entries.length > 500) {
          return NextResponse.json({ error: "too many modules" }, { status: 400 });
        }
        for (const [name, on] of entries) {
          if (typeof name === "string" && name.length <= 200 && on === true) clean[name] = true;
        }
        const updated = await prisma.appConfig.update({ where: { id: 1 }, data: { wrapperModules: JSON.stringify(clean) } });
        return NextResponse.json(serialize(updated));
      }

      case "update_aimodel": {
        if (typeof aiModel !== "string" || !ALLOWED_MODELS.includes(aiModel)) {
          return NextResponse.json({ error: "Invalid AI model" }, { status: 400 });
        }
        const updated = await prisma.appConfig.update({ where: { id: 1 }, data: { aiModel } });
        return NextResponse.json(serialize(updated));
      }

      case "update_step_models": {
        // Per-step model overrides: JSON map { "<step>": "<model>" }. Only steps
        // with a valid model are kept; a step absent from the map uses aiModel.
        if (typeof stepModels !== "object" || stepModels === null || Array.isArray(stepModels)) {
          return NextResponse.json({ error: "stepModels must be an object map" }, { status: 400 });
        }
        const entries = Object.entries(stepModels as Record<string, unknown>);
        if (entries.length > 100) {
          return NextResponse.json({ error: "too many steps" }, { status: 400 });
        }
        const clean: Record<string, string> = {};
        for (const [step, model] of entries) {
          if (typeof step === "string" && step.length <= 60 && typeof model === "string" && ALLOWED_MODELS.includes(model)) clean[step] = model;
        }
        const updated = await prisma.appConfig.update({ where: { id: 1 }, data: { stepModels: JSON.stringify(clean) } });
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
