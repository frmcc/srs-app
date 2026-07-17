"use client";

import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import {
  pageVariants,
  riseChild,
  staggerContainer,
  accordion,
  overlayMotion,
  modalPanel,
  pressable,
  hoverLift,
  EASE_OUT,
  EASE_IN,
  EASE_IN_OUT,
  DUR,
  springSoft,
  springTactile,
} from "@/lib/motion";
import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  PencilIcon,
  SparklesIcon,
  ClockIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  ArrowLeftIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
  Bars3Icon,
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  PrinterIcon,
  TrashIcon,
  Cog8ToothIcon,
  BellIcon,
  BellSlashIcon,
  SpeakerWaveIcon,
  VideoCameraIcon,
  LockClosedIcon,
  FolderOpenIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  MicrophoneIcon,
  ForwardIcon,
  BackwardIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, useTransition, Fragment, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useToasts, ToastStack } from "./components/Toast";
import { Tip } from "./components/Tooltip";
import { getAppearance, setAppearance, APPEARANCE_ACCENTS, type AppearancePref, type AppearanceAccent } from "@/lib/appearance";
import { WRAPPER_STEPS } from "@/lib/wrapper-modules";
import { useInteractiveQuiz, type DictationMode } from "./useInteractiveQuiz";
import { AutoGrowTextarea } from "./components/AutoGrowTextarea";
import SymbolBar, { type SymbolCategory } from "./components/SymbolBar";
import { ScribbleCanvas } from "./components/ScribbleCanvas";
import StatsPanel from "./components/StatsPanel";
import TutorPanel from "./components/TutorPanel";
import ChemText from "./components/ChemText";
import { splitChemBlocks, splitChemInline, unescapeChemText, stripChemForSpeech } from "@/lib/chem-markup";
import { fmtPercent } from "@/lib/format";
import { signOut } from "next-auth/react";

const LIB_LEVEL_SHORT = ["T1", "T3", "T7", "T21", "T60", "T180", "T365"] as const;
const LIB_LEVEL_DAYS  = [1, 3, 7, 21, 60, 180, 365] as const;
/** MC-4: interval names sit inside otherwise-localized tooltips — derive them per language ("Tag 7" / "Day 7"). */
const libLevelFull = (l: number, language: string) => `${language === "german" ? "Tag" : "Day"} ${LIB_LEVEL_DAYS[l]}`;
/** MC-3: bilingual, blame-free fallback when a stream error event carries no message. */
const fallbackErrorMsg = (language: string) =>
  language === "german" ? "Etwas ist schiefgelaufen — bitte erneut versuchen." : "Something went wrong — please try again.";

// Scribble key for the free-form (unstructured) answer box — the per-task
// sketches are keyed by task.id, this one has no task to hang off.
const FREE_SKETCH_KEY = "__free__";

// IS-17: one grace-period for every two-step "armed" confirm (delete, module
// delete, snooze pills, semester danger-zone) so they all disarm on the same
// rhythm instead of a 4s/5s mix — and there is a single source of truth.
const ARM_CONFIRM_MS = 5000;

/**
 * MO-13: shared pop for the pipeline step nodes (upload + grading). All three
 * states (done · active · idle) get the same enter/exit so <AnimatePresence
 * mode="wait"> actually cross-pops as the pipeline advances — not just the check.
 * Compositor-only (scale + opacity) on the tactile spring.
 */
const STEP_NODE_MOTION = {
  initial: { scale: 0.6, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.6, opacity: 0 },
  transition: springTactile,
} as const;

/**
 * Convert a base64url VAPID public key into the Uint8Array that the Push API
 * needs for `applicationServerKey`. iOS Safari rejects the raw base64 string
 * (the cause of "enabling notifications does nothing on iPhone"); Chrome was
 * lenient, which hid the bug.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Slim list item served by the server page (`initialItems`) and GET /api/reviews.
 * Dates arrive as Date objects from the server component and as ISO strings
 * from the JSON API. The full row (quiz columns, blueprint, …) is only
 * available via GET /api/reviews/[id] and inside grading/generation `done`
 * events — never merge those fat objects into this list shape.
 */
interface RawReviewItem {
  id: string;
  subjectMain: string;
  subjectSub: string;
  semester: number;
  currentLevel: number;
  nextReviewDate: string | Date;
  createdAt: string | Date;
  lastFeedback: string | null;
  prePodcastUrl: string | null;
  postPodcastUrl: string | null;
  videoUrl: string | null;
  tutorPromptDocId: string | null;
  prePodcastPrompt: string | null;
  postPodcastPrompt: string | null;
  lastVideoPrompt1: string | null;
  lastVideoPrompt2: string | null;
  generatedLevels: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  hasSource: boolean;
  /** Level-correct quiz text, computed server-side (incl. quiz-1 fallback and level>=6 rollover). */
  currentQuizText: string;
  /** Failed attempts per level slot 0–6 (library "×N" attempt markers). Optional: grade responses ship raw rows without it. */
  failCounts?: number[];
  /** Latest Verständnis-Check result — overwritten per run, null until the first one. */
  comprehensionScore?: number | null;
  comprehensionPassed?: boolean | null;
  comprehensionAt?: string | null;
  comprehensionFeedback?: string | null;
}

/** Display wrapper around a RawReviewItem produced by formatItems(). */
interface ReviewCard {
  id: string;
  subject: string;
  topic: string;
  level: number;
  isDue: boolean;
  semester: number;
  raw: RawReviewItem;
}

/** Slim grading outcome kept for the result screen (the fat srsItem is NOT retained). */
interface GradingOutcome {
  isPass: boolean;
  feedback: string;
  nextReviewDate: string | null;
  currentLevel: number | null;
  /** True when this run was a Verständnis-Check — the result screen shows the % instead of levels/dates. */
  comprehension?: boolean;
  comprehensionScore?: number | null;
  /** Set when the screen is a RECONSTRUCTION of a stored attempt (ISO date the
   *  quiz was answered) — the header drops the celebration/reschedule copy. */
  revisitedAt?: string | null;
  /** Revisit only: the level the replayed attempt belonged to (snapshot.level).
   *  The card's own level is the CURRENT one — wrong for a passed attempt. */
  revisitLevel?: number | null;
  /** Revisit only: no per-task answers exist in the snapshot (scanned-PDF
   *  attempt or legacy client) — task cards hide the answer section instead of
   *  claiming "Not answered", and pdf scans get an explanatory banner line. */
  revisitAnswersUnavailable?: boolean;
  /** Revisit only: true when the attempt arrived as a scanned PDF (Shortcut). */
  revisitPdfScan?: boolean;
  /** Revisit only: task ids whose sketches were dropped from the snapshot for
   *  size — their cards say "sketch too large to keep" instead of unanswered. */
  revisitSketchesDropped?: string[];
}

/** Answered-quiz snapshot from GET /api/reviews/[id]/answers (see AnswerSnapshot
 *  in lib/grading-pipeline — not imported here: that module is server-only). */
interface RevisitSnapshot {
  answeredAt?: string;
  level?: number | null;
  passed?: boolean;
  score?: number;
  quizText?: string;
  tasks?: Record<string, string>;
  free?: string;
  sketches?: Record<string, string>;
  sketchesDropped?: string[];
  pdfScan?: boolean;
}

/** One graded review from GET /api/reviews/[id]/history (ReviewLog row). */
interface FeedbackHistoryEntry {
  id: string;
  completedAt: string;
  level: number;
  passed: boolean;
  feedback: string | null;
}

// ---- Answer drafts (localStorage) -------------------------------------------
// Keyed by item AND level, so a draft never leaks into the next quiz level.
const draftKeyFor = (itemId: string, level: number) => `srs-draft-${itemId}-L${level}`;

interface AnswerDraft {
  individual: Record<string, string>;
  free: string;
  savedAt: number;
}

function loadDraft(itemId: string, level: number): AnswerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKeyFor(itemId, level));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnswerDraft;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clearDraft(itemId: string, level: number) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(draftKeyFor(itemId, level)); } catch { /* quota/private mode */ }
}

// ---- Upload intake -----------------------------------------------------------
// Extensions the pipeline can parse (mirrors the file input's `accept`). The
// picker enforces this natively, but drag-and-drop bypasses it — so drops are
// checked against the same list.
const UPLOAD_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".txt"];
const isSupportedUpload = (name: string) => {
  const lower = name.toLowerCase();
  return UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

interface NdjsonEvent {
  event: "progress" | "done" | "error";
  data: {
    step?: number;
    message?: string;
    success?: boolean;
    isPass?: boolean;
    feedback?: string;
    srsItem?: RawReviewItem;
    /** /api/comprehension only: the freshly generated Verständnis-Check quiz. */
    quizText?: string;
    /** /api/grade in comprehension mode only: the run's mastery percentage. */
    comprehensionScore?: number | null;
  };
}

/** Hard cap per NDJSON stream so a hung connection can never spin forever. */
const STREAM_TIMEOUT_MS = 6 * 60 * 1000;

/**
 * Reads an NDJSON stream line by line. Partial lines are buffered across
 * chunk boundaries (split on "\n", trailing fragment stays in the buffer).
 * Resolves with `true` if a terminal `done`/`error` event arrived before the
 * stream ended — `false` means the stream died silently.
 */
async function readNdjsonStream(
  res: Response,
  onEvent: (evt: NdjsonEvent) => void
): Promise<boolean> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawTerminalEvent = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const evt = JSON.parse(line) as NdjsonEvent;
      if (evt.event === "done" || evt.event === "error") sawTerminalEvent = true;
      onEvent(evt);
    } catch {
      // Not a complete JSON line — the server writes one JSON object per line.
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep the trailing fragment for the next chunk
    for (const line of lines) handleLine(line);
    if (sawTerminalEvent) {
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
  }
  buffer += decoder.decode(); // flush any multi-byte remainder
  if (buffer.trim()) handleLine(buffer); // final line without trailing \n

  return sawTerminalEvent;
}

const extractStudentQuiz = (rawQuizText: string) => {
  if (!rawQuizText) return "";
  const match = rawQuizText.match(/===STUDENT_QUIZ_START===([\s\S]*?)===STUDENT_QUIZ_END===/);
  return match ? match[1].trim() : rawQuizText;
};

const parseQuizTasks = (studentQuizText: string) => {
  if (!studentQuizText) return [];
  // Quizzes are LLM-generated in German ("AUFGABE 1 - 2 PUNKTE:") or English
  // ("TASK 1 - 2 POINTS:"), so we anchor on EITHER task word + number at the
  // start of a line. Keying on German "Aufgabe" alone made every English quiz
  // parse into ZERO tasks — which hid the per-task answer sheet and fell back to
  // a hardcoded 2-task template regardless of the real task count.
  const chunks = studentQuizText.split(/(?=^[ \t]*(?:Aufgabe|Task)\s+\d+)/im);
  const tasks: { id: string; header: string; label: string; questionText: string }[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    const headerMatch = trimmed.match(/^(?:Aufgabe|Task)\s+\d+/i);
    if (!headerMatch) continue; // intro/notes text before the first task → skip

    const headerLine = trimmed.split("\n")[0];
    const taskName = headerMatch[0].replace(/\s+/g, " "); // "Task 1" / "Aufgabe 1"
    const label = headerLine.replace(/:\s*$/, "").trim();  // e.g. "TASK 1 - 2 POINTS"
    const questionText = trimmed.startsWith(headerLine)
      ? trimmed.substring(headerLine.length).trim()
      : trimmed;

    tasks.push({
      // Suffix with the position so two tasks can never collide on the same id —
      // a collision made their answer fields mirror each other and produced
      // duplicate React keys. Ids are internal (keys + answer map), never shown.
      id: `${taskName.toLowerCase().replace(/\s+/g, "")}-${tasks.length}`,
      header: taskName + ":",
      label,
      questionText,
    });
  }
  return tasks;
};

/**
 * Parse the structured "# Gesamtbewertung" header the grading pipeline puts at
 * the top of every feedback brief into a small, localizable summary. Tolerant
 * of language variants; anything unparsable falls back to a plain snippet.
 */
function parseFeedbackSummary(feedback: string): { decision: "PASS" | "REPEAT" | null; mastery: number | null; snippet: string } {
  const head = feedback.slice(0, 600);
  const decisionMatch = head.match(/\b(PASS|BESTANDEN|REPEAT|WIEDERHOLEN)\b/i);
  const decision = decisionMatch
    ? (/PASS|BESTANDEN/i.test(decisionMatch[1]) ? ("PASS" as const) : ("REPEAT" as const))
    : null;
  const masteryMatch = head.match(/(\d{1,3})\s*%/);
  const mastery = masteryMatch ? Math.min(100, parseInt(masteryMatch[1], 10)) : null;
  // First prose line that isn't a heading/bullet — usually the brief's opening sentence.
  const prose = feedback
    .split("\n")
    .map(l => l.trim())
    .find(l => l.length > 40 && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("*"));
  const snippet = (prose ?? feedback.replace(/\s+/g, " ").trim()).slice(0, 160);
  return { decision, mastery, snippet };
}

/** Small stable content hash (djb2) for cache keys — keying on text LENGTH
 *  collided two different briefs of equal length onto the same cached
 *  translation. */
function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Crude language sniff for feedback briefs — decides whether to auto-translate. */
function detectFeedbackLanguage(text: string): "german" | "english" | "unknown" {
  const sample = text.slice(0, 1200);
  let de = 0;
  let en = 0;
  for (const w of ["Gesamtbewertung", "Entscheidung", "Beherrschung", "Aufgabe", "nicht", "und", "wird", "eine"]) {
    if (new RegExp(`\\b${w}\\b`, "i").test(sample)) de++;
  }
  for (const w of ["Decision", "Mastery", "assessment", "the", "and", "your", "answer", "with"]) {
    if (new RegExp(`\\b${w}\\b`, "i").test(sample)) en++;
  }
  if (de === en) return "unknown";
  return de > en ? "german" : "english";
}

/**
 * Appearance settings data (APPEARANCE.md) — per-accent preview/swatch values.
 * These are LITERAL palette values on purpose: the theme cards depict each
 * theme regardless of the active one, and the swatches show every accent's
 * gradient for the CURRENT theme.
 */
const ACCENT_PREVIEW_DOT: Record<AppearanceAccent, { paper: string; ink: string }> = {
  amber: { paper: "#EF9F1F", ink: "#F2A62E" },
  slate: { paper: "#6E8FB4", ink: "#8BAACC" },
  eucalyptus: { paper: "#619F98", ink: "#80B6B0" },
  heather: { paper: "#9C7EB6", ink: "#AC90C6" },
  graphite: { paper: "#4E4638", ink: "#DED5C3" },
};

const ACCENT_SWATCH: Record<AppearanceAccent, { paper: [string, string, string]; ink: [string, string, string]; onPaper: string; onInk: string }> = {
  amber: { paper: ["#F7BC5A", "#EF9F1F", "#DE850B"], ink: ["#F9C468", "#F2A62E", "#DE8A0E"], onPaper: "#2A1D07", onInk: "#2A1D07" },
  slate: { paper: ["#97B2D0", "#6E8FB4", "#55779D"], ink: ["#AFC8E2", "#8BAACC", "#6F92B8"], onPaper: "#142638", onInk: "#142638" },
  eucalyptus: { paper: ["#8FC0BA", "#619F98", "#4A8780"], ink: ["#A5D2CD", "#80B6B0", "#649D96"], onPaper: "#0E2421", onInk: "#0E2421" },
  heather: { paper: ["#BBA2CE", "#9C7EB6", "#83659F"], ink: ["#CBB4DD", "#AC90C6", "#9174AB"], onPaper: "#241533", onInk: "#241533" },
  graphite: { paper: ["#6E6455", "#4E4638", "#37312A"], ink: ["#F4EEE1", "#DED5C3", "#C4B8A0"], onPaper: "#F6F3EC", onInk: "#211B12" },
};

/** Exact microcopy from APPEARANCE.md (German mirrors the tone). */
const ACCENT_COPY: Record<AppearanceAccent, { name: string; en: string; de: string }> = {
  amber: { name: "Amber", en: "— the house colour. Lamplight for the last review of the night.", de: "— die Hausfarbe. Lampenlicht für die letzte Wiederholung des Abends." },
  slate: { name: "Slate", en: "— study-hall blue. It steadies attention when the list is long.", de: "— Studiensaal-Blau. Es beruhigt den Blick, wenn die Liste lang ist." },
  eucalyptus: { name: "Eucalyptus", en: "— clinic green, the colour of scrubs and steady hands.", de: "— Klinikgrün, die Farbe von Kitteln und ruhigen Händen." },
  heather: { name: "Heather", en: "— quiet violet from psychology's shelf of the library.", de: "— leises Violett aus dem Psychologie-Regal der Bibliothek." },
  graphite: { name: "Graphite", en: "— no colour at all. Ink, paper, and your own focus.", de: "— gar keine Farbe. Tinte, Papier und dein eigener Fokus." },
};

/**
 * MC-8: the library's Meister/Mastery badge, shared so due cards, scheduled
 * rows and the quiz header never render the impossible "Level 8 von 7" once
 * an item loops the T365 mastery interval (currentLevel is uncapped).
 */
function MasteryBadge({ level, language, className = "" }: { level: number; language: string; className?: string }) {
  const laps = level - (LIB_LEVEL_SHORT.length - 1); // completed T365 mastery reviews
  return (
    <Tip label={language === "german"
      ? `Alle 7 Level bestanden — ${laps}× durch die Meister-Schleife (Tag 365)`
      : `All 7 levels cleared — ${laps}× through the mastery loop (Day 365)`}>
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-amber-400/[0.14] border border-(--accent-border-soft) text-(--accent-text-strong) whitespace-nowrap ${className}`}>
        <AcademicCapIcon className="w-3 h-3" strokeWidth={2} />
        {language === "german" ? "Meister" : "Mastery"} ×{laps}
      </span>
    </Tip>
  );
}

/** Colorize standalone PASS/REPEAT verdicts inside feedback text. */
function colorizeVerdicts(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/\b(PASS|BESTANDEN|REPEAT|WIEDERHOLEN)\b/).map((part, i) => {
    if (/^(PASS|BESTANDEN)$/.test(part)) return <span key={`${keyPrefix}-v${i}`} className="font-semibold text-(--grade-pass-text)">{part}</span>;
    if (/^(REPEAT|WIEDERHOLEN)$/.test(part)) return <span key={`${keyPrefix}-v${i}`} className="font-semibold text-(--grade-fail-text)">{part}</span>;
    return <span key={`${keyPrefix}-v${i}`}>{part}</span>;
  });
}

/** Inline markdown-lite: **bold** plus verdict coloring. `**` inside math
 *  must never trigger the bold split, so math segments are lifted out first. */
function renderFeedbackInline(text: string, keyPrefix: string): ReactNode[] {
  // Math renders in every brief (the KaTeX chunk loads lazily; a line
  // without $-markup takes the plain pipeline below unchanged).
  const segs = splitChemInline(text);
  if (segs.some((s) => s.type === "math")) {
    return segs.map((seg, i) => {
      const key = `${keyPrefix}-m${i}`;
      if (seg.type !== "text") return <ChemText key={key} inline text={seg.raw} />;
      return <span key={key}>{renderFeedbackInline(unescapeChemText(seg.content), key)}</span>;
    });
  }
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const key = `${keyPrefix}-b${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={key} className="font-semibold text-ink-900">{colorizeVerdicts(part.slice(2, -2), key)}</strong>;
    }
    return <span key={key}>{colorizeVerdicts(part, key)}</span>;
  });
}

/** The line loop of FeedbackBody, appending to a shared `out` so heading
 *  margins ("first heading gets no mt-4") survive math-block splits. */
function appendFeedbackLines(out: ReactNode[], text: string, bodyCls: string, keyPrefix: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const key = `${keyPrefix}-${i}`;
    if (!line) { out.push(<div key={key} className="h-2.5" aria-hidden="true" />); return; }
    if (/^[-—_]{3,}$/.test(line)) { out.push(<div key={key} className="h-px bg-(--hairline) my-2.5" aria-hidden="true" />); return; }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(
        <p key={key} className={`caps-label !text-ink-600 ${out.length === 0 ? "" : "mt-4"} mb-1`}>
          {heading[1].replace(/\*\*/g, "")}
        </p>
      );
      return;
    }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const content = bullet[1];
      const kv = content.match(/^([^:*]{2,48}):\s+(.+)$/);
      out.push(
        <div key={key} className={`flex gap-2 ${bodyCls}`}>
          <span className="text-ink-300 shrink-0 select-none">–</span>
          <span className="min-w-0">
            {kv
              ? (<><span className="font-semibold text-ink-900">{kv[1]}:</span>{" "}{renderFeedbackInline(kv[2], key)}</>)
              : renderFeedbackInline(content, key)}
          </span>
        </div>
      );
      return;
    }
    out.push(<p key={key} className={bodyCls}>{renderFeedbackInline(line, key)}</p>);
  });
}

/**
 * Presentational renderer for grading briefs. The pipeline emits markdown-ish
 * text (## headings, "- Label: value" bullets, **bold**) — this renders it as
 * calm typography instead of raw backend output. Dependency-free on purpose.
 *
 * Math markup renders in every brief: $$…$$ blocks are lifted out BEFORE the
 * line loop (they span lines, which the loop can't see) and handed to the
 * lazy KaTeX renderer; the text between them flows through the exact
 * markdown-lite pipeline above. Plain text never tokenizes or loads the
 * chunk, so non-formula briefs render byte-identical.
 */
function FeedbackBody({ text, size = "base" }: { text: string; size?: "base" | "sm" }) {
  const bodyCls = size === "sm" ? "text-xs leading-[1.65] text-ink-600" : "text-sm leading-[1.7] text-ink-900/80";
  const out: ReactNode[] = [];
  splitChemBlocks(text).forEach((block, bi) => {
    if (block.type === "text") appendFeedbackLines(out, block.content, bodyCls, `fb${bi}`);
    else out.push(<div key={`fb-blk-${bi}`} className={bodyCls}><ChemText text={block.raw} /></div>);
  });
  return <div className="flex flex-col gap-1">{out}</div>;
}

/** One task's slice of a graded brief. */
interface PerTaskAssessment {
  heading: string;        // "Aufgabe 1"
  index: number;          // 1-based task number parsed from the heading
  mastery: number | null; // estimated mastery 0–100
  body: string;           // the per-task write-up (markdown-ish)
}

/**
 * Split a graded brief into the short summary (shown by default) and the
 * per-task assessment blocks the pipeline appends under "# Bewertung pro
 * Aufgabe" / "# Per-Task Assessment" (each a "## Aufgabe N" section carrying
 * "Geschätzte Beherrschung dieser Aufgabe: N %").
 */
function splitFeedback(feedback: string): { brief: string; perTasks: PerTaskAssessment[] } {
  if (!feedback) return { brief: "", perTasks: [] };
  const m = feedback.match(/\n#{1,3}\s*(?:Bewertung pro Aufgabe|Per-Task Assessment)\s*\n/i);
  if (!m || m.index === undefined) return { brief: feedback.trim(), perTasks: [] };
  const brief = feedback.slice(0, m.index).replace(/\s*-{3,}\s*$/, "").trim();
  const raw = feedback.slice(m.index + m[0].length);
  const perTasks: PerTaskAssessment[] = [];
  for (const part of raw.split(/\n(?=#{1,3}\s+(?:Aufgabe|Task)\b)/i)) {
    const h = part.match(/^#{1,3}\s+(.+?)\s*$/m);
    if (!h) continue;
    const heading = h[1].replace(/\*\*/g, "").trim();
    const num = heading.match(/(\d+)/);
    const masteryM =
      part.match(/Beherrschung dieser Aufgabe:?\s*(\d{1,3})\s*%/i) ||
      part.match(/mastery[^\d%]{0,24}(\d{1,3})\s*%/i);
    perTasks.push({
      heading,
      index: num ? parseInt(num[1], 10) : perTasks.length + 1,
      mastery: masteryM ? Math.max(0, Math.min(100, parseInt(masteryM[1], 10))) : null,
      body: part.replace(/^#{1,3}\s+.+?(?:\n|$)/, "").trim(),
    });
  }
  return { brief, perTasks };
}

/**
 * First top-level section of a brief — the "# Gesamtbewertung" / "# Overall
 * assessment" block. The revisit view shows only this: the remediation brief
 * that follows ("# Lern- und Nacharbeitsbrief …") plans the NEXT loop and the
 * per-task details already sit on the task cards. Cut at the second top-level
 * "# " heading (## subheadings don't count); briefs without one pass through.
 */
function overallSection(brief: string): string {
  const t = brief.trim();
  const headings = [...t.matchAll(/(?:^|\n)#\s/g)];
  if (headings.length < 2 || headings[1].index === undefined) return t;
  return t.slice(0, headings[1].index).replace(/\s*-{3,}\s*$/, "").trim();
}

/** Mastery % → grade tone (sage pass / grade-mid / clay fail — never the accent). */
function masteryTone(pct: number | null): string {
  if (pct === null) return "bg-paper-2 text-ink-400";
  if (pct >= 80) return "bg-(--grade-pass-wash) text-(--grade-pass-text)";
  if (pct >= 50) return "bg-paper-2 text-(--grade-mid)";
  return "bg-(--grade-fail-wash) text-(--grade-fail-text)";
}

/**
 * One read-only task card in the task-by-task assessment: the question, the
 * student's submitted answer (typed or scribbled, read-only) when available,
 * the mastery badge, an expandable per-task write-up, and — on the live result
 * screen — the per-task Tutor button.
 */
function TaskReviewCard({
  number, label, questionText, assessment, typedAnswer, sketch, sketchDropped, onTutor, tutorActive, language,
}: {
  number: number;
  label: string;
  questionText?: string;
  assessment: PerTaskAssessment | null;
  /** undefined = answers unavailable (history); "" = answered-but-empty is treated as not answered. */
  typedAnswer?: string;
  sketch?: string;
  /** Revisit: a sketch existed but was too large for the snapshot — say so
   *  instead of rendering the task as unanswered. */
  sketchDropped?: boolean;
  onTutor?: () => void;
  tutorActive?: boolean;
  language: string;
}) {
  const [open, setOpen] = useState(false);
  const de = language === "german";
  const pct = assessment?.mastery ?? null;
  const showAnswer = typedAnswer !== undefined || sketch !== undefined || !!sketchDropped;
  const answered = (typedAnswer && typedAnswer.trim()) || !!sketch;
  return (
    <div className="card-surface-elevated p-6 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-xl italic leading-none text-ink-300">{String(number).padStart(2, "0")}</span>
          <h3 className="caps-label !text-ink-600 truncate">{label}</h3>
        </div>
        {pct !== null && (
          <span className={`tnum text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${masteryTone(pct)}`}>
            {fmtPercent(pct, language)}
          </span>
        )}
      </div>

      {questionText && (
        <div className="text-[15px] text-ink-900 whitespace-pre-wrap leading-[1.65] mb-5"><ChemText text={questionText} /></div>
      )}

      {showAnswer && (
        <div className="border-t border-(--hairline) pt-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="caps-label">{de ? "Deine Antwort" : "Your answer"}</span>
            {onTutor && (
              <button
                type="button"
                onClick={onTutor}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer ${tutorActive ? "bg-(--accent-wash) text-(--accent-text-strong)" : "bg-paper-2 text-ink-600 hover:text-ink-900"}`}
              >
                <AcademicCapIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
                Tutor
              </button>
            )}
          </div>
          {sketch ? (
            // bg-[#fffefb] matches the paper-1 fill ScribbleCanvas bakes into the PNG
            // (always the light paper, even in ink theme) — a bg-white mat would show
            // as a brighter halo around the drawing while it loads.
            // eslint-disable-next-line @next/next/no-img-element -- client-only data-URL of the user's own drawing
            <img src={sketch} alt={de ? "Gescribbelte Antwort" : "Scribbled answer"} className="max-w-full rounded-xl border border-(--hairline-card) bg-[#fffefb]" />
          ) : answered ? (
            <>
              <p className="text-[15px] text-ink-900 whitespace-pre-wrap leading-[1.6]">{typedAnswer}</p>
              {sketchDropped && (
                <p className="text-sm text-ink-400 italic mt-2">{de ? "Zusätzliche Skizze war zu groß zum Speichern — nicht mehr verfügbar." : "An additional sketch was too large to keep — no longer available."}</p>
              )}
            </>
          ) : sketchDropped ? (
            <p className="text-sm text-ink-400 italic">{de ? "Skizze war zu groß zum Speichern — nicht mehr verfügbar." : "Sketch was too large to keep — no longer available."}</p>
          ) : (
            <p className="text-sm text-ink-400 italic">{de ? "Nicht beantwortet." : "Not answered."}</p>
          )}
        </div>
      )}

      {assessment?.body && (
        <div className={showAnswer || questionText ? "border-t border-(--hairline) mt-5 pt-4" : ""}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1.5 caps-label !text-(--accent-text-strong) cursor-pointer"
          >
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={2} />
            {de ? "Bewertung dieser Aufgabe" : "Assessment of this task"}
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div key="body" variants={accordion} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                <div className="pt-3">
                  <FeedbackBody text={assessment.body} size="sm" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** Resolve the latest playable video URL from the stored value (plain URL or a JSON history array). */
function latestVideoUrlOf(videoUrl: string | null): string | null {
  if (!videoUrl) return null;
  if (videoUrl.startsWith("http")) return videoUrl;
  if (videoUrl.startsWith("[")) {
    try {
      const arr = JSON.parse(videoUrl) as { url?: string }[];
      const last = arr[arr.length - 1];
      return last?.url?.startsWith("http") ? last.url : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * IA-11: the full stored video history (level + url), so the Library can offer the
 * same "Video-Archiv" the due card does. Older-level recap videos were otherwise
 * only reachable while an item happened to be due — the permanent home held less
 * than the transient dashboard card.
 */
function videoHistoryOf(videoUrl: string | null): { level: number; url: string; date?: string }[] {
  if (!videoUrl) return [];
  if (videoUrl.startsWith("http")) return [{ level: 0, url: videoUrl }];
  if (videoUrl.startsWith("[")) {
    try {
      const arr = JSON.parse(videoUrl) as { level?: number; url?: string; date?: string }[];
      return arr
        .filter((v): v is { level?: number; url: string; date?: string } => typeof v?.url === "string" && v.url.startsWith("http"))
        .map((v) => ({ level: v.level ?? 0, url: v.url, date: v.date }));
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * "Due" is a LOCAL-calendar-day question. The old comparison truncated to UTC
 * days, so for a UTC+1/+2 user the "JETZT FÄLLIG" badge flipped an hour or two
 * early/late around local midnight (L4 in CODE_REVIEW_2026-06-25).
 */
const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isDueLocal = (due: Date, today: Date) => startOfLocalDay(due) <= startOfLocalDay(today);

/**
 * PP-1 — `now` is a parameter so the SSR pass and the hydration render can use
 * the SAME timezone-neutral value (null → nothing is "due"), instead of each
 * side calling new Date() with a different clock and hydrating a different
 * sort order. The real client clock re-partitions dueness before first paint
 * (see the mount layout effect in DashboardClient).
 */
const formatItems = (data: RawReviewItem[], now: Date | null = new Date()): ReviewCard[] => {
  if (!Array.isArray(data)) return [];

  const formatted = data.map(item => {
    const isDue = now ? isDueLocal(new Date(item.nextReviewDate), now) : false;

    return {
      id: item.id,
      subject: item.subjectMain,
      topic: item.subjectSub,
      level: item.currentLevel,
      isDue,
      semester: item.semester || 1,
      raw: item
    };
  });

  // Sort logic: due items first, then strictly chronological (IA-1/IA-2).
  // Due items sort most-overdue first; scheduled items sort soonest first, so
  // scheduledItems[0] IS the next review and the Upcoming date column reads in
  // order. Module name only breaks ties within the same date.
  formatted.sort((a, b) => {
    if (a.isDue && !b.isDue) return -1;
    if (!a.isDue && b.isDue) return 1;

    const dateCompare = new Date(a.raw.nextReviewDate).getTime() - new Date(b.raw.nextReviewDate).getTime();
    if (dateCompare !== 0) return dateCompare;

    return a.subject.localeCompare(b.subject);
  });

  return formatted;
};

// useLayoutEffect on the client (corrections land before first paint),
// useEffect during the SSR pass (silences React's server warning). (PP-1)
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * AX-1 — shared dialog chrome for the seven overlays: real dialog semantics
 * (role/aria-modal/aria-labelledby), initial focus on the panel, a Tab trap,
 * and focus restored to the opener on close. Escape stays with the global
 * ordered handler in DashboardClient; the visuals stay whatever `className`
 * says. Wrap the panel content that used to live in `<motion.div {...modalPanel}>`.
 */
function ModalDialog({
  labelledBy,
  className,
  onClick,
  children,
}: {
  labelledBy: string;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, []);
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <motion.div
      {...modalPanel}
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={trapTab}
      onClick={onClick}
      className={`outline-none ${className ?? ""}`}
    >
      {children}
    </motion.div>
  );
}

/** Selectable Gemini models. id is stored; label is shown. */
const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: "gemini-3.5-flash", label: "3.5 Flash" },
  { id: "gemini-3.1-pro-preview", label: "3.1 Pro" },
  { id: "gemini-3.1-flash-lite", label: "3.1 Flash-Lite" },
];

export default function DashboardClient({
  initialItems,
  userName,
  userImage,
  userEmail,
  initialLanguage = "german",
  initialSemester = 1,
  initialModulePresets = [],
  initialWrapperModules = {},
  initialFileTransport = "inline",
  initialPassRate30 = null,
  vapidPublicKey,
  calendarToken,
  scribbleEnabled = false,
}: {
  initialItems: RawReviewItem[];
  userName?: string | null;
  userImage?: string | null;
  userEmail?: string | null;
  /** Server-read UI language — first paint must not flash German at English users. */
  initialLanguage?: string;
  /** Server-read semester — the sidebar's "Semester N" eyebrow must not flash "Semester 1". */
  initialSemester?: number;
  /** Server-read module presets — the upload tab's module select must not flash empty. */
  initialModulePresets?: string[];
  /** Server-read AI-wrapper mode — seeds the Settings toggle at first paint. */
  initialWrapperMode?: string;
  /** Server-read per-module wrapper toggles — seeds the Settings checkboxes. */
  initialWrapperModules?: Record<string, boolean>;
  /** Server-read file transport — seeds the Settings toggle at first paint. */
  initialFileTransport?: string;
  /** Server-computed 30-day pass rate — the right-rail card must not pop in late. */
  initialPassRate30?: { passed: number; total: number } | null;
  vapidPublicKey?: string | null;
  calendarToken?: string | null;
  /** Handwriting canvas in the answer boxes — allowlist feature (SCRIBBLE_ALLOWED_EMAILS). */
  scribbleEnabled?: boolean;
}) {
  // Query-string fragments for the ICS feed URLs (calendar clients can't log in).
  const calTokenAnd = calendarToken ? `&token=${calendarToken}` : "";
  const calTokenOnly = calendarToken ? `?token=${calendarToken}` : "";

  // `startTransition` marks background refetch state updates as non-urgent so
  // React never interrupts an ongoing animation to apply them — no more blink.
  const [, startTransition] = useTransition();

  // PP-1 — the initializer runs during SSR AND the hydration render; passing a
  // null clock makes both deterministic (identical HTML, no hydration re-sort).
  const [upcomingReviews, setUpcomingReviews] = useState<ReviewCard[]>(initialItems ? formatItems(initialItems, null) : []);
  /** Full raw items — kept in sync with every fetchReviews() so the Library always shows live data. */
  const [rawItems, setRawItems] = useState<RawReviewItem[]>(initialItems ?? []);
  /** True only on first mount when we have no SSR items — shows skeleton cards while the first API fetch runs. */
  // PP-11 — the server page (page.tsx → fetchReviewList) throws on failure, so a
  // rendered client with initialItems === [] authoritatively means "empty library",
  // never "still loading". Initialising to false keeps the first paint honest: a
  // brand-new account sees the empty state directly, not skeleton cards that dissolve
  // into it. The only genuine loading window left is an explicit "Try again" retry,
  // which flips this true itself.
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  /** True when the last /api/reviews fetch FAILED — distinct from "empty library". */
  const [reviewsError, setReviewsError] = useState(false);
  /** EM-16 — a dead/blocked Google avatar URL flips this so the designed initials
   *  tile renders instead of the browser's broken-image glyph. */
  const [avatarFailed, setAvatarFailed] = useState(false);
  /** Cards whose study-materials section is expanded. */
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("dashboard");
  // Mirror of activeTab for reading the CURRENT tab inside async callbacks/timers
  // without capturing a stale value.
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const [isGenerating, setIsGenerating] = useState(false);
  /** IA-8 — generation finished: hold on the success screen (checklist + explicit
   *  next-step fork) instead of auto-yanking to the dashboard on a 3s timer. */
  const [generationDone, setGenerationDone] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  /** EM-1 — persistent record of the last failed upload run (toasts vanish after 5s). */
  const [uploadError, setUploadError] = useState("");

  // PP-1 — the viewer's clock: null during SSR and the hydration render (both
  // paint the same timezone-neutral frame), then set to the real client time
  // BEFORE first client paint. Greeting, date eyebrow and overdue labels key
  // off this instead of an SSR-computed `new Date()`, which used the server's
  // timezone and made the headline flash on hydration.
  const [clock, setClock] = useState<Date | null>(null);
  useIsoLayoutEffect(() => {
    const d = new Date();
    // Mount-only correction pass: swaps the timezone-neutral SSR frame for the
    // viewer's clock BEFORE first paint, and re-partitions dueness the same way
    // (the SSR/hydration frame used formatItems with a null clock).
    setClock(d);
    if (initialItems && initialItems.length > 0) setUpcomingReviews(formatItems(initialItems, d));
  }, []);

  // Toasts (non-blocking replacement for alert())
  const { toasts, addToast, dismissToast } = useToasts();

  // Pre-selected module: seeded from the server-read presets so the upload
  // tab's select never flashes the "no modules" fallback (EM-5/PP-3).
  const [subjectInput, setSubjectInput] = useState(initialModulePresets[0] ?? "");
  const [textInput, setTextInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Semester & Settings State — seeded from the server page's AppConfig read
  // (EM-5/PP-3: no "Semester 1"/empty-presets flash), revalidated by the
  // /api/settings fetch below.
  const [currentSemester, setCurrentSemester] = useState<number>(initialSemester);
  const [modulePresets, setModulePresets] = useState<string[]>(initialModulePresets);
  const [language, setLanguage] = useState<string>(initialLanguage);
  // Per-module wrapper on/off: { "<module name>": true }. Replaces the old
  // global 3-way wrapperMode radio.
  const [wrapperModules, setWrapperModules] = useState<Record<string, boolean>>(initialWrapperModules ?? {});
  const [fileTransport, setFileTransport] = useState<string>(initialFileTransport);
  // Default Gemini model + per-step overrides ({ "<step>": "<model>" }); a step
  // absent uses aiModel. Edited in the "Customise per step" popup.
  const [aiModel, setAiModel] = useState<string>("gemini-3.5-flash");
  const [stepModels, setStepModels] = useState<Record<string, string>>({});
  const [showStepCustomize, setShowStepCustomize] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  /** IA-13/LIVE-9 — the "Erweitert / Advanced" disclosure (dictation, AI connection,
   *  PDF delivery). Default closed; reset to closed each time Settings closes. */
  /** Active settings tab — the sheet was one long scroll of equal-rank groups
   *  (cluttered); four pinned tabs give each area its own quiet page. */
  const [settingsTab, setSettingsTab] = useState<"study" | "appearance" | "sync" | "advanced">("study");
  const settingsBodyRef = useRef<HTMLDivElement | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [newPresetInput, setNewPresetInput] = useState("");

  // ── Appearance (theme + accent) — per-device, applied pre-paint by the
  // <head> script; this state only mirrors it for the Settings UI. ──────────
  const [appearance, setAppearancePref] = useState<AppearancePref>({ mode: "paper", accent: "amber" });
  const [resolvedTheme, setResolvedTheme] = useState<"paper" | "ink">("paper");
  useEffect(() => {
    const sync = () => {
      const pref = getAppearance();
      setAppearancePref(pref);
      setResolvedTheme(window.__srsAppearance?.resolve(pref.mode) ?? "paper");
    };
    // rAF: read AFTER the head script has applied the persisted preference.
    const raf = requestAnimationFrame(sync);
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (getAppearance().mode === "auto") sync(); };
    mql.addEventListener("change", onChange);
    return () => { cancelAnimationFrame(raf); mql.removeEventListener("change", onChange); };
  }, []);
  const updateAppearance = useCallback((patch: Partial<AppearancePref>) => {
    const next = setAppearance(patch);
    setAppearancePref(next);
    setResolvedTheme(window.__srsAppearance?.resolve(next.mode) ?? "paper");
  }, []);

  // Revalidation only — first paint is already seeded from the server props.
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setCurrentSemester(data.currentSemester);
          if (data.modulePresets) setModulePresets(data.modulePresets);
          if (data.language) setLanguage(data.language);
          if (data.wrapperModules && typeof data.wrapperModules === "object") setWrapperModules(data.wrapperModules);
          if (data.aiModel) setAiModel(data.aiModel);
          if (data.stepModels && typeof data.stepModels === "object") setStepModels(data.stepModels);
          if (data.fileTransport) setFileTransport(data.fileTransport);
          if (data.modulePresets && data.modulePresets.length > 0) {
            // Fill only if still empty — never stomp the SSR seed or a user edit.
            setSubjectInput(prev => prev || data.modulePresets[0]);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Quiz taking state
  const [selectedReview, setSelectedReview] = useState<ReviewCard | null>(null);
  // Live Tutor slide-over (web twin of the iPad audio tutor)
  const [showTutorPanel, setShowTutorPanel] = useState(false);
  // When the tutor is opened from a specific task's button, that task is pinned
  // at the top of the chat. null = opened generally (header button), no pin.
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  // The student-facing text of the quiz being taken, resolved ONCE in
  // startQuiz. The free-form fallback must render THIS — re-deriving from
  // selectedReview.raw.currentQuizText showed the regular quiz while a
  // comprehension check (whose text never lives on the review row) was
  // actually being graded.
  const [activeQuizText, setActiveQuizText] = useState("");
  const [studentAnswers, setStudentAnswers] = useState("");
  const [parsedTasks, setParsedTasks] = useState<ReturnType<typeof parseQuizTasks>>([]);
  const [individualAnswers, setIndividualAnswers] = useState<Record<string, string>>({});
  // Symbol bar (Math/Physics palettes for every student) — retracted by default;
  // the chosen category + open state persist so it reopens as the student left it.
  const [symbolCategory, setSymbolCategory] = useState<SymbolCategory>("math");
  const [symbolBarOpen, setSymbolBarOpen] = useState(false);
  useEffect(() => {
    try {
      const cat = localStorage.getItem("srsSymbolCategory");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
      if (cat === "math" || cat === "physics") setSymbolCategory(cat);
      if (localStorage.getItem("srsSymbolBarOpen") === "1") setSymbolBarOpen(true);
    } catch { /* private mode */ }
  }, []);
  const symbolCategories = useMemo<SymbolCategory[]>(() => ["math", "physics"], []);
  const chooseSymbolCategory = useCallback((c: SymbolCategory) => {
    setSymbolCategory(c);
    try { localStorage.setItem("srsSymbolCategory", c); } catch { /* quota */ }
  }, []);
  const setSymbolOpen = useCallback((open: boolean) => {
    setSymbolBarOpen(open);
    try { localStorage.setItem("srsSymbolBarOpen", open ? "1" : "0"); } catch { /* quota */ }
  }, []);
  // Track the last-focused answer box so a symbol chip inserts at its caret.
  const answerElsRef = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const lastAnswerTaskRef = useRef<string | null>(null);
  const insertSymbol = useCallback((token: string, taskId?: string | null) => {
    const id = taskId ?? lastAnswerTaskRef.current;
    if (!id) return;
    const el = answerElsRef.current[id];
    setIndividualAnswers(prev => {
      const cur = prev[id] ?? "";
      const s0 = el ? (el.selectionStart ?? cur.length) : cur.length;
      const s1 = el ? (el.selectionEnd ?? s0) : s0;
      const next = cur.slice(0, s0) + token + cur.slice(s1);
      if (el) {
        const caret = s0 + token.length;
        const refocus = document.activeElement === el;
        requestAnimationFrame(() => { if (refocus) el.focus(); el.setSelectionRange(caret, caret); });
      }
      return { ...prev, [id]: next };
    });
  }, []);
  // Scribbled answers (allowlist feature): taskId (or FREE_SKETCH_KEY) → PNG data
  // URL, plus which pads are open. Deliberately NOT part of the localStorage draft
  // — a handful of canvases would blow the ~5 MB quota and kill the text draft.
  const [answerSketches, setAnswerSketches] = useState<Record<string, string>>({});
  const [openScribbles, setOpenScribbles] = useState<Record<string, boolean>>({});
  const [isGrading, setIsGrading] = useState(false);

  // ---- Verständnis-Check (library weak-spot quiz) ---------------------------
  /** True while the OPEN quiz is a comprehension check — grading then runs with
   *  `comprehension: true` and never touches schedule, levels or drafts. */
  const [comprehensionMode, setComprehensionMode] = useState(false);
  /** In-flight generation (one at a time); message mirrors the NDJSON progress. */
  const [compGen, setCompGen] = useState<{ itemId: string; message: string } | null>(null);
  /** Feedback viewer modal for the latest comprehension result of an item. */
  const [compFeedback, setCompFeedback] = useState<RawReviewItem | null>(null);

  // Right-rail pass-rate card (last 30 days) — server-computed and passed as a
  // prop, so it paints WITH the dashboard instead of popping in after a lazy
  // /api/stats round-trip (which shipped a year of logs just for two counts).
  // PP-6/IA-4 — kept live afterwards: every fetchReviews() (mount, refocus,
  // post-grade) carries fresh counts back, so the number moves when a grade
  // just changed it instead of freezing at the SSR snapshot.
  const [passRate30, setPassRate30] = useState(initialPassRate30);

  // ---- Interactive Mode: reads each question aloud (Gemini TTS with browser
  // fallback), then dictates the spoken answer into the box until the user says
  // "nächste Aufgabe". Default "hybrid": instant browser dictation, AI-polished
  // on advance. ---------------------------------------------------------------
  const [dictationMode, setDictationMode] = useState<DictationMode>(() => {
    if (typeof window === "undefined") return "hybrid";
    const saved = localStorage.getItem("srs-dictation-mode");
    // One-time migration: old "gemini" users get the strictly-better hybrid
    // (same AI quality, but with instant live text). Re-selecting "Gemini" in
    // settings afterwards is respected — the migration flag only fires once.
    if (!localStorage.getItem("srs-dictation-migrated-hybrid")) {
      try { localStorage.setItem("srs-dictation-migrated-hybrid", "1"); } catch { /* private mode */ }
      if (saved === "gemini" || !saved) {
        try { localStorage.setItem("srs-dictation-mode", "hybrid"); } catch { /* private mode */ }
        return "hybrid";
      }
    }
    return saved === "browser" || saved === "gemini" || saved === "hybrid" ? saved : "hybrid";
  });
  const updateDictationMode = useCallback((mode: DictationMode) => {
    setDictationMode(mode);
    if (typeof window !== "undefined") localStorage.setItem("srs-dictation-mode", mode);
  }, []);
  // File transport ("inline" base64 vs "file_api" upload) — persisted in
  // AppConfig; the grading/generation pipelines read it per run.
  const updateFileTransport = useCallback((mode: "inline" | "file_api") => {
    // IS-7 — flip the segment immediately, revert if the round-trip fails.
    const prev = fileTransport;
    setFileTransport(mode);
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_file_transport', fileTransport: mode })
    }).then(res => res.json()).then(data => {
      if (data.error) {
        setFileTransport(prev);
        addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
        return;
      }
      if (data.fileTransport) setFileTransport(data.fileTransport);
    }).catch(err => {
      console.error(err);
      setFileTransport(prev);
      addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
    });
  }, [addToast, language, fileTransport]);
  // IS-7 — AI-connection segment: flip immediately, revert if the POST fails.
  // Toggle the wrapper for one module (optimistic; persists the full map).
  const toggleWrapperModule = useCallback((moduleName: string) => {
    // Flip the tick immediately, revert if the round-trip fails (matches
    // updateFileTransport). Derive next from the render-current map so the
    // side-effecting fetch stays outside any state updater and fires once.
    const prev = wrapperModules;
    const next = { ...prev };
    if (next[moduleName]) delete next[moduleName]; else next[moduleName] = true;
    setWrapperModules(next);
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_wrapper_modules', wrapperModules: next })
    }).then(res => res.json()).then(data => {
      if (data.error) {
        setWrapperModules(prev);
        addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
        return;
      }
      if (data.wrapperModules) setWrapperModules(data.wrapperModules);
    }).catch(err => {
      console.error(err);
      setWrapperModules(prev);
      addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
    });
  }, [addToast, language, wrapperModules]);
  const updateAiModel = useCallback((model: string) => {
    const prev = aiModel;
    setAiModel(model);
    fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_aimodel', aiModel: model })
    }).then(res => res.json()).then(data => {
      if (data.error) { setAiModel(prev); addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`); return; }
      if (data.aiModel) setAiModel(data.aiModel);
    }).catch(err => { console.error(err); setAiModel(prev); addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting."); });
  }, [addToast, language, aiModel]);
  // "" / "default" removes the per-step override (→ default model).
  const updateStepModel = useCallback((step: string, model: string) => {
    const prev = stepModels;
    const next = { ...prev };
    if (!model || model === "default") delete next[step]; else next[step] = model;
    setStepModels(next);
    fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_step_models', stepModels: next })
    }).then(res => res.json()).then(data => {
      if (data.error) { setStepModels(prev); addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`); return; }
      if (data.stepModels && typeof data.stepModels === "object") setStepModels(data.stepModels);
    }).catch(err => { console.error(err); setStepModels(prev); addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting."); });
  }, [addToast, language, stepModels]);
  const handleInteractiveAnswer = useCallback((taskId: string, text: string) => {
    setIndividualAnswers(prev => ({ ...prev, [taskId]: text }));
  }, []);
  // Mirror of individualAnswers for the interactive hook: the AI overwrite must
  // compare against the CURRENT box content (state in callbacks would be stale).
  const individualAnswersRef = useRef(individualAnswers);
  useEffect(() => {
    individualAnswersRef.current = individualAnswers;
  });
  const getInteractiveAnswer = useCallback((taskId: string) => individualAnswersRef.current[taskId] ?? "", []);
  const interactive = useInteractiveQuiz({
    tasks: parsedTasks,
    language: language === "english" ? "English" : "German",
    dictationMode,
    onAnswer: handleInteractiveAnswer,
    getAnswer: getInteractiveAnswer,
  });
  // Stop interactive mode (audio + mic) whenever we leave the quiz view.
  const stopInteractive = interactive.stop;
  useEffect(() => {
    if (activeTab !== "quiz") stopInteractive();
  }, [activeTab, stopInteractive]);
  useEffect(() => {
    if (interactive.error) addToast("error", interactive.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast once per distinct error; addToast identity is irrelevant
  }, [interactive.error]);
  // Smoothly keep the current interactive question centered in view as it advances.
  useEffect(() => {
    if (!interactive.active || interactive.currentIndex < 0) return;
    // MO-16: honour prefers-reduced-motion — the CSS scroll-behavior reset only
    // governs behavior:"auto" scrolls, so an explicit "smooth" here still animates
    // the full-viewport centering unless we opt out for reduce-motion users.
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`iq-${interactive.currentIndex}`)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  }, [interactive.active, interactive.currentIndex]);
  const [showAllScheduled, setShowAllScheduled] = useState(false);
  const [gradingStep, setGradingStep] = useState(0);
  const [gradingMsg, setGradingMsg] = useState("");
  const [gradingError, setGradingError] = useState("");
  const [gradingResult, setGradingResult] = useState<GradingOutcome | null>(null);
  // Task-by-task assessment view on the result screen (default off — the short
  // brief shows first). Reset whenever a fresh result arrives — EXCEPT on a
  // revisit, where seeing the answered tasks is the whole point (openRevisit
  // would set it true only for this effect to snap it shut again).
  const [showTaskReview, setShowTaskReview] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- collapse the detail view when a fresh result arrives
  useEffect(() => { setShowTaskReview(gradingResult?.revisitedAt !== undefined); }, [gradingResult]);
  // Parse the graded brief into the short summary + per-task assessments, and
  // map each per-task block onto the current quiz's tasks (by 1-based index).
  const taskReview = useMemo(() => {
    const { brief, perTasks } = splitFeedback(gradingResult?.feedback || "");
    const byIndex = new Map(perTasks.map((p) => [p.index, p]));
    const byTask = new Map<string, PerTaskAssessment>();
    parsedTasks.forEach((t, i) => {
      const a = byIndex.get(i + 1);
      if (a) byTask.set(t.id, a);
    });
    return { brief, perTasks, byTask };
  }, [gradingResult, parsedTasks]);

  // Inline delete confirmation (two-step button); the delete itself is
  // optimistic, so there is no per-item busy state.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Snooze: first click on the clock arms the card, then +1/+3/+7 pills appear.
  const [snoozeArmedId, setSnoozeArmedId] = useState<string | null>(null);

  // Two-step confirmation state for the semester danger-zone buttons
  const [confirmingNewSemester, setConfirmingNewSemester] = useState(false);
  const [confirmingResetSemester, setConfirmingResetSemester] = useState(false);

  /** Single close path for settings — disarms the semester confirms so a stale
   *  "click again to confirm" can't survive into the next time it opens. */
  const closeSettingsModal = useCallback(() => {
    setShowSettingsModal(false);
    setConfirmingNewSemester(false);
    setConfirmingResetSemester(false);
    setSettingsTab("study"); // IA-13/LIVE-9 — reopen on the first tab
  }, []);
  const [isSemesterActionBusy, setIsSemesterActionBusy] = useState(false);

  // Historical feedback modal (+ per-module feedback history from ReviewLog)
  const [activeFeedbackItem, setActiveFeedbackItem] = useState<RawReviewItem | null>(null);
  // Task-by-task toggle inside the history modal (assessment-only — the filled
  // answers aren't stored). Reset each time a different item's history opens.
  const [showHistTaskReview, setShowHistTaskReview] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- collapse the detail view when a different item's history opens
  useEffect(() => { setShowHistTaskReview(false); }, [activeFeedbackItem]);
  // Per past-review task-by-task toggles inside the "Review history" list.
  const [openReviewTasks, setOpenReviewTasks] = useState<Set<string>>(new Set());
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  /** Per-history-entry translations, keyed `${logId}:${targetLang}`. */
  const [historyTranslations, setHistoryTranslations] = useState<Record<string, string>>({});
  const [historyTranslating, setHistoryTranslating] = useState<Record<string, boolean>>({});
  // Guards for the auto-translate effect kept in REFS (not the effect deps).
  // Previously the effect depended on the very state it wrote, so setting the
  // "translating" flag re-fired the effect, which cancelled its own in-flight
  // request — the flag then stayed true forever and the entry spun endlessly.
  const historyInFlightRef = useRef<Set<string>>(new Set());
  const historyDoneRef = useRef<Set<string>>(new Set());
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarUrlCopied, setCalendarUrlCopied] = useState(false);
  const [archiveModalData, setArchiveModalData] = useState<{level: number, url: string, date?: string}[] | null>(null);

  // Podcast State

  // Prompt viewer modal (podcast prompts + video scripts)
  const [promptModal, setPromptModal] = useState<{ title: string; content: string } | null>(null);
  /** One quiet entry point for all of a lecture's debug prompts (podcast + video scripts). */
  const [promptsModal, setPromptsModal] = useState<{ title: string; prompts: { label: string; content: string }[] } | null>(null);
  // Auto-translation of the open feedback brief into the UI language.
  const [feedbackTranslation, setFeedbackTranslation] = useState<string | null>(null);
  const [feedbackTranslating, setFeedbackTranslating] = useState(false);
  const [showFeedbackOriginal, setShowFeedbackOriginal] = useState(false);

  // Library tab — free-text search over module + lecture names
  const [librarySearch, setLibrarySearch] = useState("");

  // Library tab — accordion state (populated reactively by the rawItems useEffect below)
  const [expandedLibrarySemesters, setExpandedLibrarySemesters] = useState<Set<number>>(new Set());
  const [expandedLibraryModules, setExpandedLibraryModules] = useState<Set<string>>(new Set());
  const [expandedLibraryItems, setExpandedLibraryItems] = useState<Set<string>>(new Set());

  // Library tab — module management (design 9a): Edit mode shows per-module
  // remove buttons; deletion is two-step (arm → confirm) and removes ALL
  // lectures of the module via the per-item DELETE endpoint.
  const [libraryEditing, setLibraryEditing] = useState(false);
  const [confirmingDeleteModuleKey, setConfirmingDeleteModuleKey] = useState<string | null>(null);

  // Push notification state
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  // IS-12 — in-flight guard: the subscribe/unsubscribe flow awaits a permission
  // prompt + serviceWorker.ready + a network round-trip, so the toggle needs a
  // busy state (disables re-entrant taps, shows the knob mid-travel).
  const [pushBusy, setPushBusy] = useState(false);

  // Check notification permission on mount. Must run in an effect (not a
  // lazy initializer) so SSR markup and the first client render agree.
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time external API read, SSR-safe
      setPushPermission(Notification.permission);
      if (Notification.permission === "granted" && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.pushManager.getSubscription().then((sub) => {
            if (sub) setPushSubscribed(true);
          }).catch(() => {});
        }).catch(() => {});
      }
    }
  }, []);

  const subscribeToPush = useCallback(async () => {
    try {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        addToast("error", language === "german" ? "Push wird in diesem Browser nicht unterstützt." : "Push isn't supported in this browser.");
        return;
      }

      // iOS/iPadOS only deliver web push to a PWA added to the Home Screen.
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
      const isIosLike = /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
      if (isIosLike && !isStandalone) {
        addToast("error", language === "german"
          ? "Auf dem iPhone/iPad zuerst über Teilen → Zum Home-Bildschirm hinzufügen, dann hier Mitteilungen aktivieren."
          : "On iPhone/iPad, add the app to your Home Screen first (Share → Add to Home Screen), then enable notifications here.");
        return;
      }

      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        addToast("error", language === "german" ? "Mitteilungen wurden nicht erlaubt." : "Notification permission was denied.");
        return;
      }

      // A wedged service worker or a push-subscribe call that never settles (an
      // iOS/Safari quirk) would otherwise leave the toggle stuck on "One moment…"
      // forever. Bound each async step so a hang surfaces as a normal error and
      // the busy state clears — the user can just try again.
      const withTimeout = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> =>
        Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);

      const reg = await withTimeout(navigator.serviceWorker.ready, 12000, "service worker ready");
      // Read at runtime from the server prop (works on Cloud Run without needing
      // the var inlined at build time, which is the usual cause of this error).
      const vapidKey = vapidPublicKey;
      if (!vapidKey) {
        // MC-7: "VAPID" is developer jargon — surface the same warm bilingual
        // failure as every other push error and keep the real cause in the console.
        console.error("Push subscribe error: VAPID public key not configured.");
        addToast("error", language === "german" ? "Mitteilungen konnten nicht aktiviert werden." : "Couldn't enable notifications.");
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await withTimeout(reg.pushManager.subscribe({
          userVisibleOnly: true,
          // iOS requires a Uint8Array here, not the raw base64 string.
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }), 25000, "push subscribe");
      }

      const subJson = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      // Only claim success if the SERVER stored the subscription — otherwise the
      // bell would show "on" while no push row exists and nothing ever arrives.
      if (!res.ok) throw new Error(`subscribe failed: HTTP ${res.status}`);
      setPushSubscribed(true);
      addToast("success", language === "german" ? "Mitteilungen aktiviert." : "Notifications enabled.");
    } catch (err) {
      console.error("Push subscribe error:", err);
      addToast("error", language === "german" ? "Mitteilungen konnten nicht aktiviert werden." : "Couldn't enable notifications.");
    }
  }, [addToast, language, vapidPublicKey]);

  const togglePush = useCallback(async () => {
    // IS-12 — ignore re-entrant taps while a subscribe/unsubscribe is in flight.
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            const endpoint = sub.endpoint;
            await sub.unsubscribe();
            const res = await fetch("/api/push/subscribe", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint }),
            });
            if (!res.ok) throw new Error(`unsubscribe failed: HTTP ${res.status}`);
          }
          setPushSubscribed(false);
          addToast("success", language === "german" ? "Mitteilungen deaktiviert." : "Notifications disabled.");
        } catch (err) {
          console.error("Push unsubscribe error:", err);
          addToast("error", language === "german" ? "Mitteilungen konnten nicht deaktiviert werden." : "Couldn't disable notifications.");
        }
      } else {
        await subscribeToPush();
      }
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, pushSubscribed, subscribeToPush, addToast, language]);

  // Guards against overlapping refetches (mount + focus + interval can race).
  const fetchInFlightRef = useRef(false);
  // If a refetch is requested while one is in flight, remember it and run once
  // more when the current one settles — dropping it silently could leave stale
  // SRS state after a grade/generate resync.
  const fetchDirtyRef = useRef(false);
  // PP-9 — timestamp of the freshest list we hold (0 = not yet seeded). Seeded to
  // mount time in the mount effect because the server page (SSR) delivered
  // `initialItems` milliseconds ago, so the mount refetch is redundant; and
  // returning to the tab fires BOTH `focus` and `visibilitychange`, which
  // otherwise queue two sequential GETs. The trigger guard below skips any
  // refetch landing within FETCH_MIN_INTERVAL_MS of the last one. (Seeded in an
  // effect, not here, so render stays pure — Date.now() is impure.)
  const lastFetchAtRef = useRef(0);
  // Ids deleted optimistically; filtered out of any refetch result until the
  // list no longer contains them, so an in-flight GET can't resurrect a card.
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // Live mirror of rawItems for the optimistic handlers below (snooze, delete,
  // undo): the undo toast fires from a closure that would otherwise hold a
  // stale rawItems — same trick as fetchReviewsRef.
  const rawItemsRef = useRef<RawReviewItem[]>(rawItems);
  useEffect(() => { rawItemsRef.current = rawItems; }, [rawItems]);
  /** Commit an optimistic items update: the raw list, the formatted dashboard
   *  cards, and the ref mirror all move in the same tick, so the UI responds
   *  before the network does and later handlers see the committed state. */
  const commitItems = useCallback((next: RawReviewItem[]) => {
    rawItemsRef.current = next;
    setRawItems(next);
    setUpcomingReviews(formatItems(next));
  }, []);
  // In-flight optimistic due-date overrides (snooze/undo): re-applied on top of
  // any refetch result until the server reflects them, so a racing GET can't
  // bounce a card back to its old slot — the date twin of deletedIdsRef.
  // settledAt (stamped when the owning PATCH settles) lets fetchReviews expire
  // entries whose request finished before the GET started.
  const pendingDatesRef = useRef<Map<string, { iso: string; settledAt: number | null }>>(new Map());
  // Ids with a snooze PATCH on the wire. The server adds `days` per request
  // (offset from max(now, due)), so an accidental double-click would compound
  // the move — block re-entry until the first request settles.
  const snoozeInFlightRef = useRef<Set<string>>(new Set());

  // Ensures the ?quizId= deep-link is consumed exactly once — not on every
  // subsequent upcomingReviews update (focus-refetch, post-grade refresh, etc).
  const processedQuizIdRef = useRef(false);

  // Library search field — focused by the global ⌘K shortcut (CRAFT.md §3).
  const librarySearchRef = useRef<HTMLInputElement | null>(null);

  // AX-13 — a stable ref callback that moves focus INTO a two-step confirm
  // control the instant it mounts (arming snooze/delete unmounts the focused
  // trigger, which would otherwise drop focus to <body>). Stable identity means
  // React only invokes it on mount (node) and unmount (null), so it fires once
  // per arm rather than on every render.
  const focusOnArm = useCallback((el: HTMLElement | null) => {
    el?.focus({ preventScroll: true });
  }, []);

  // LIVE-1/PP-2 — every tab change lands at the top. On md+ the scroller is
  // <main> (.app-shell-main), so window.scrollTo alone was a no-op there; on
  // mobile the window scrolls. Instant (not smooth — html sets
  // scroll-behavior:smooth) so the tab's enter animation is what the user sees.
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [activeTab]);

  const fetchReviews = useCallback(async () => {
    if (fetchInFlightRef.current) {
      // Coalesce: mark dirty so we run exactly once more after the current one.
      fetchDirtyRef.current = true;
      return;
    }
    fetchInFlightRef.current = true;
    lastFetchAtRef.current = Date.now(); // PP-9 — mark this list as the freshest
    try {
      // PP-6/IA-4 — send the same 30-day window StatsPanel aggregates with
      // (local midnight − 30 days) so the rail card and the Stats tab count
      // identical log sets.
      const today = startOfLocalDay(new Date());
      const cutoff30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
      // Anything settled before this GET started is observable in its response,
      // so its pending-date entry must not outlive this fetch (see below).
      const fetchStartedAt = Date.now();
      const res = await fetch(`/api/reviews?passRateSince=${encodeURIComponent(cutoff30.toISOString())}`);
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      // Response shape: { items, passRate30 } — tolerate the legacy bare array
      // (a client rendered just before a deploy talking to the old route).
      const items: unknown = Array.isArray(data) ? data : data?.items;
      const passRate: { passed: number; total: number } | null =
        !Array.isArray(data) &&
        typeof data?.passRate30?.passed === "number" &&
        typeof data?.passRate30?.total === "number"
          ? data.passRate30
          : null;
      if (Array.isArray(items)) {
        // Drop any items we just deleted optimistically (an in-flight GET that
        // started before the DELETE could otherwise re-add them). Once the
        // server stops returning an id, forget it.
        const deleted = deletedIdsRef.current;
        const filtered = deleted.size ? items.filter((it: { id: string }) => !deleted.has(it.id)) : items;
        for (const id of Array.from(deleted)) {
          if (!items.some((it: { id: string }) => it.id === id)) deleted.delete(id);
        }
        // Re-apply in-flight optimistic due dates (snooze/undo) the same way.
        // An entry dies when (a) the server echoes its date, (b) the item is
        // gone, or (c) its PATCH settled before this GET began — (c) bounds the
        // override to one fetch cycle so it can never pin a date that later
        // changed legitimately (e.g. a grade rescheduling the card).
        const pending = pendingDatesRef.current;
        let merged = filtered as RawReviewItem[];
        if (pending.size) {
          for (const [id, entry] of Array.from(pending)) {
            const match = merged.find((it) => it.id === id);
            if (
              !match ||
              new Date(match.nextReviewDate).toISOString() === entry.iso ||
              (entry.settledAt !== null && entry.settledAt < fetchStartedAt)
            ) {
              pending.delete(id);
            }
          }
          if (pending.size) {
            merged = merged.map((it) => (pending.has(it.id) ? { ...it, nextReviewDate: pending.get(it.id)!.iso } : it));
          }
        }
        startTransition(() => {
          setUpcomingReviews(formatItems(merged));
          setRawItems(merged);
          if (passRate) setPassRate30(passRate);
          setReviewsError(false);
        });
      }
    } catch (err) {
      // Distinguish a fetch failure from a genuinely empty library so the UI can
      // show a retry affordance instead of the "upload your first lecture" state.
      console.error("Failed to refresh reviews:", err);
      setReviewsError(true);
    } finally {
      fetchInFlightRef.current = false;
      setIsLoadingReviews(false);
      if (fetchDirtyRef.current) {
        fetchDirtyRef.current = false;
        // Re-run the queued refetch on the next tick.
        setTimeout(() => { void fetchReviewsRef.current?.(); }, 0);
      }
    }
  }, [startTransition]);
  // Stable handle so the coalesced re-run above can call the latest fetchReviews.
  const fetchReviewsRef = useRef<null | (() => Promise<void>)>(null);
  useEffect(() => { fetchReviewsRef.current = fetchReviews; }, [fetchReviews]);

  // Refetch when the tab regains focus/visibility — but not redundantly. PP-9:
  // the mount call is skipped because SSR just delivered a fresh list (seeded
  // into lastFetchAtRef), and the focus+visibilitychange pair that both fire on
  // one tab-return collapses to a single GET.
  const FETCH_MIN_INTERVAL_MS = 1500;
  useEffect(() => {
    // Seed to mount time so the redundant mount refetch is skipped (SSR just
    // delivered the list); real refetches happen on later focus/visibility.
    if (lastFetchAtRef.current === 0) lastFetchAtRef.current = Date.now();
    const maybeFetch = () => {
      if (Date.now() - lastFetchAtRef.current < FETCH_MIN_INTERVAL_MS) return;
      fetchReviews();
    };
    maybeFetch();
    const onFocus = () => maybeFetch();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") maybeFetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchReviews]);

  /** True while a library search query is active — search results are always expanded. */
  const librarySearching = librarySearch.trim().length > 0;

  /** Library: items grouped by semester → module → lecture, always derived from latest fetch. */
  const libraryBySemester = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    const matches = (item: RawReviewItem) =>
      !query ||
      item.subjectMain.toLowerCase().includes(query) ||
      item.subjectSub.toLowerCase().includes(query) ||
      `semester ${item.semester}`.includes(query);

    const result = new Map<number, Map<string, RawReviewItem[]>>();
    const sorted = rawItems.filter(matches).sort((a, b) => {
      if (a.semester !== b.semester) return a.semester - b.semester;
      if (a.subjectMain !== b.subjectMain) return a.subjectMain.localeCompare(b.subjectMain);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    for (const item of sorted) {
      if (!result.has(item.semester)) result.set(item.semester, new Map());
      const modMap = result.get(item.semester)!;
      if (!modMap.has(item.subjectMain)) modMap.set(item.subjectMain, []);
      modMap.get(item.subjectMain)!.push(item);
    }
    return result;
  }, [rawItems, librarySearch]);

  // Keep accordion expansion sets in sync: newly uploaded lectures auto-expand
  // their semester and module without collapsing anything the user already closed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- safe: each updater returns the SAME Set reference when nothing changed, so no re-render loop
    setExpandedLibrarySemesters(prev => {
      let changed = false;
      const next = new Set(prev);
      rawItems.forEach(item => { if (!next.has(item.semester)) { next.add(item.semester); changed = true; } });
      return changed ? next : prev;
    });
    setExpandedLibraryModules(prev => {
      let changed = false;
      const next = new Set(prev);
      rawItems.forEach(item => {
        const key = `${item.semester}__${item.subjectMain}`;
        if (!next.has(key)) { next.add(key); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [rawItems]);

  // While any podcast is still rendering server-side ("Wird generiert"), poll
  // every 60s (only while the tab is visible) so links appear without a reload.
  // NOTE: a NULL url means "no notebook was ever created" — it will never become
  // an http link, so it must NOT count as pending (that drove a permanent poll).
  // Only a non-null, not-yet-http placeholder counts as pending.
  const isPendingUrl = (url: string | null) => !!url && !url.startsWith("http");
  const hasPendingPodcast = upcomingReviews.some(
    r => isPendingUrl(r.raw.prePodcastUrl) || isPendingUrl(r.raw.postPodcastUrl)
  );

  useEffect(() => {
    if (!hasPendingPodcast) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchReviews();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [hasPendingPodcast, fetchReviews]);

  // Load the per-module feedback history whenever the feedback modal opens.
  useEffect(() => {
    if (!activeFeedbackItem) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient modal state on close
      setFeedbackHistory(null);
      setExpandedHistoryIds(new Set());
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    fetch(`/api/reviews/${activeFeedbackItem.id}/history`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
      .then((logs: FeedbackHistoryEntry[]) => {
        if (!cancelled && Array.isArray(logs)) setFeedbackHistory(logs);
      })
      .catch(err => console.error("Failed to load feedback history:", err))
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [activeFeedbackItem]);

  // Keep the OPEN feedback / comprehension modals pointed at the LIVE item.
  // They capture a RawReviewItem object reference; a background refetch replaces
  // rawItems with fresh objects, so without this the modal would keep rendering
  // stale lastFeedback / comprehension numbers until reopened.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- returns the SAME ref when unchanged, so no cascade/loop
    setActiveFeedbackItem((cur) => {
      if (!cur) return cur;
      const live = rawItems.find((r) => r.id === cur.id);
      return live && live !== cur ? live : cur;
    });
    setCompFeedback((cur) => {
      if (!cur) return cur;
      const live = rawItems.find((r) => r.id === cur.id);
      return live && live !== cur ? live : cur;
    });
  }, [rawItems]);

  /** Opens the feedback brief with fresh translation state. */
  const openFeedbackItem = useCallback((item: RawReviewItem) => {
    setFeedbackTranslation(null);
    setShowFeedbackOriginal(false);
    setFeedbackTranslating(false);
    setActiveFeedbackItem(item);
  }, []);

  // While a stored attempt is being fetched for the revisit view (item id) —
  // drives the button spinners in the feedback/comprehension modals.
  const [revisitLoading, setRevisitLoading] = useState<string | null>(null);

  /**
   * Revisit the LAST answered quiz: fetch the stored snapshot (quiz text as
   * answered + the user's answers + sketches) and rehydrate the regular result
   * screen from it — same task-by-task cards, same per-task tutor, but with a
   * "last attempt" header instead of the celebration. Latest attempt only;
   * that is all the server keeps.
   */
  const openRevisit = useCallback(async (item: RawReviewItem, comprehension: boolean) => {
    if (isGrading) {
      addToast("error", language === "german"
        ? "Eine Bewertung läuft noch — das Ergebnis ist gleich da."
        : "A grading run is still in progress — your result is almost ready.");
      return;
    }
    if (revisitLoading) return;
    setRevisitLoading(item.id);
    try {
      const res = await fetch(`/api/reviews/${item.id}/answers${comprehension ? "?mode=comprehension" : ""}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: { snapshot: RevisitSnapshot | null; feedback: string | null } = await res.json();
      if (!data.snapshot) {
        // Graded before answer snapshots existed — nothing stored to replay.
        addToast("error", language === "german"
          ? "Für diesen Versuch wurden keine Antworten gespeichert — erst ab der nächsten Bewertung."
          : "No answers were stored for this attempt — available from the next graded run on.");
        return;
      }
      const snapshot = data.snapshot;

      // Rehydrate the quiz/result state exactly like startQuiz + a finished
      // grade would have left it, from the snapshot instead of live typing.
      const card = upcomingReviews.find((r) => r.id === item.id) ?? formatItems([item])[0];
      setSelectedReview(card);
      setComprehensionMode(comprehension);
      const studentQuizOnly = extractStudentQuiz(snapshot.quizText || "");
      setActiveQuizText(studentQuizOnly);
      const tasks = parseQuizTasks(studentQuizOnly);
      setParsedTasks(tasks);
      const answers: Record<string, string> = {};
      tasks.forEach(t => { answers[t.id] = snapshot.tasks?.[t.id] ?? ""; });
      setIndividualAnswers(answers);
      setStudentAnswers(snapshot.free || "");
      setAnswerSketches(snapshot.sketches ?? {});
      setOpenScribbles({});
      // Scanned-PDF attempts (Shortcut) and legacy clients store no per-task
      // answers — the cards must say "unavailable", not "Not answered".
      const sketchKeys = Object.keys(snapshot.sketches ?? {});
      const hasPerTaskAnswers =
        tasks.some(t => (snapshot.tasks?.[t.id] ?? "").trim()) ||
        sketchKeys.some(k => k !== FREE_SKETCH_KEY);
      setGradingResult({
        isPass: !!snapshot.passed,
        feedback: data.feedback ?? "",
        nextReviewDate: null,
        currentLevel: null,
        comprehension,
        comprehensionScore: typeof snapshot.score === "number" ? snapshot.score : null,
        revisitedAt: snapshot.answeredAt ?? "",
        revisitLevel: typeof snapshot.level === "number" ? snapshot.level : null,
        revisitAnswersUnavailable: !hasPerTaskAnswers && tasks.length > 0,
        revisitPdfScan: !!snapshot.pdfScan,
        revisitSketchesDropped: snapshot.sketchesDropped ?? [],
      });
      // The [gradingResult] effect opens the task review on revisits — seeing
      // the answered tasks is the point of revisiting.
      setShowTutorPanel(false);
      setFocusedTaskId(null);
      setGradingError("");
      setActiveFeedbackItem(null);
      setCompFeedback(null);
      setActiveTab("quiz");
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
        mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
      }
    } catch (e) {
      console.error("Failed to load answer snapshot:", e);
      addToast("error", language === "german"
        ? "Letzter Versuch konnte nicht geladen werden — bitte erneut versuchen."
        : "Couldn't load the last attempt — please try again.");
    } finally {
      setRevisitLoading(null);
    }
  }, [isGrading, revisitLoading, upcomingReviews, language, addToast]);

  // Fetch (or reuse a cached) translation whenever the open brief isn't in the
  // UI language. Cached per item + language + text length in localStorage, so
  // each brief costs at most one flash-lite call per language.
  useEffect(() => {
    const item = activeFeedbackItem;
    const fb = item?.lastFeedback;
    if (!item || !fb) return;
    let cancelled = false;
    const run = async () => {
      const target = language === "german" ? "german" : "english";
      const detected = detectFeedbackLanguage(fb);
      if (detected === "unknown" || detected === target) {
        if (!cancelled) { setFeedbackTranslation(null); setFeedbackTranslating(false); }
        return;
      }
      const cacheKey = `srs-fb-tr:${item.id}:${target}:${hashText(fb)}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) { if (!cancelled) setFeedbackTranslation(cached); return; }
      } catch { /* private mode */ }
      if (cancelled) return;
      setFeedbackTranslating(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id, target }),
        });
        const data = await res.json();
        if (!cancelled && data.translated) {
          setFeedbackTranslation(data.translated);
          try { localStorage.setItem(cacheKey, data.translated); } catch { /* quota */ }
        }
      } catch { /* quiet — the original stays readable */ }
      finally { if (!cancelled) setFeedbackTranslating(false); }
    };
    run();
    return () => { cancelled = true; };
  }, [activeFeedbackItem, language]);

  // Auto-translate EXPANDED history entries that aren't in the UI language.
  // Same localStorage cache strategy as the main brief (one call per entry+language).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!feedbackHistory) return;
      const target = language === "german" ? "german" : "english";
      for (const entry of feedbackHistory) {
        if (cancelled) return;
        if (!expandedHistoryIds.has(entry.id) || !entry.feedback) continue;
        const trKey = `${entry.id}:${target}`;
        // Guards live in refs so this loop never re-triggers its own effect.
        if (historyDoneRef.current.has(trKey) || historyInFlightRef.current.has(trKey)) continue;
        const detected = detectFeedbackLanguage(entry.feedback);
        if (detected === "unknown" || detected === target) continue;
        const cacheKey = `srs-fb-tr:log:${entry.id}:${target}:${hashText(entry.feedback)}`;
        let cached: string | null = null;
        try { cached = localStorage.getItem(cacheKey); } catch { /* private mode */ }
        if (cached) {
          const hit = cached;
          historyDoneRef.current.add(trKey);
          setHistoryTranslations(prev => ({ ...prev, [trKey]: hit }));
          continue;
        }
        historyInFlightRef.current.add(trKey);
        setHistoryTranslating(prev => ({ ...prev, [trKey]: true }));
        try {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logId: entry.id, target }),
          });
          const data = await res.json();
          if (data.translated) {
            historyDoneRef.current.add(trKey);
            setHistoryTranslations(prev => ({ ...prev, [trKey]: data.translated }));
            try { localStorage.setItem(cacheKey, data.translated); } catch { /* quota */ }
          }
        } catch { /* quiet — the original stays readable */ }
        finally {
          // Always clear the in-flight guard + spinner, even if the effect was
          // superseded — otherwise the entry could never retry.
          historyInFlightRef.current.delete(trKey);
          setHistoryTranslating(prev => ({ ...prev, [trKey]: false }));
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [expandedHistoryIds, feedbackHistory, language]);

  // Global Escape key — closes whichever overlay is on top, ordered by z-index
  // (prompt viewer 90 → prompts list / comprehension feedback 80 → settings 60
  // → the z-50 modals). With nothing open, Escape backs out of armed two-step
  // confirms (snooze pills, delete confirms) instead of leaving them to their
  // timeout.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // IS-10: mark the press consumed — the tutor panel's own Escape listener
      // checks defaultPrevented, so one keystroke closes exactly one layer.
      if (promptModal) { e.preventDefault(); setPromptModal(null); return; }
      if (promptsModal) { e.preventDefault(); setPromptsModal(null); return; }
      if (compFeedback) { e.preventDefault(); setCompFeedback(null); return; }
      if (showSettingsModal) { e.preventDefault(); closeSettingsModal(); return; }
      if (showCalendarModal) { e.preventDefault(); setShowCalendarModal(false); return; }
      if (activeFeedbackItem) { e.preventDefault(); setActiveFeedbackItem(null); return; }
      if (archiveModalData) { e.preventDefault(); setArchiveModalData(null); return; }
      if (snoozeArmedId) { e.preventDefault(); setSnoozeArmedId(null); return; }
      if (confirmingDeleteId) { e.preventDefault(); setConfirmingDeleteId(null); return; }
      if (confirmingDeleteModuleKey) { e.preventDefault(); setConfirmingDeleteModuleKey(null); return; }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [promptModal, promptsModal, compFeedback, showSettingsModal, closeSettingsModal, showCalendarModal, activeFeedbackItem, archiveModalData, snoozeArmedId, confirmingDeleteId, confirmingDeleteModuleKey]);

  // The inline "Wirklich löschen?" prompt resets itself if not confirmed.
  useEffect(() => {
    if (!confirmingDeleteId) return;
    const timeoutId = window.setTimeout(() => setConfirmingDeleteId(null), ARM_CONFIRM_MS);
    return () => window.clearTimeout(timeoutId);
  }, [confirmingDeleteId]);

  // Armed module-delete confirm (library edit mode) resets itself the same way.
  useEffect(() => {
    if (!confirmingDeleteModuleKey) return;
    const timeoutId = window.setTimeout(() => setConfirmingDeleteModuleKey(null), ARM_CONFIRM_MS);
    return () => window.clearTimeout(timeoutId);
  }, [confirmingDeleteModuleKey]);

  // Armed snooze pills reset themselves if no interval is picked.
  useEffect(() => {
    if (!snoozeArmedId) return;
    const timeoutId = window.setTimeout(() => setSnoozeArmedId(null), ARM_CONFIRM_MS);
    return () => window.clearTimeout(timeoutId);
  }, [snoozeArmedId]);

  // Armed semester actions (settings modal) reset themselves like every other
  // two-step confirm in the app.
  useEffect(() => {
    if (!confirmingNewSemester && !confirmingResetSemester) return;
    const timeoutId = window.setTimeout(() => {
      setConfirmingNewSemester(false);
      setConfirmingResetSemester(false);
    }, ARM_CONFIRM_MS);
    return () => window.clearTimeout(timeoutId);
  }, [confirmingNewSemester, confirmingResetSemester]);

  /** Push a review OUT by N days (sick/holiday/no time). The server offsets from
   *  max(now, current due date), so snoozing can never PULL a review closer.
   *  Optimistic: the card moves immediately using that same rule; the PATCH
   *  response reconciles the exact date, failure rolls the move back. */
  const handleSnooze = async (e: React.MouseEvent, id: string, days: number) => {
    e.stopPropagation();
    if (snoozeInFlightRef.current.has(id)) return;
    setSnoozeArmedId(null);
    // Remember the date we're moving away from so undo/rollback can restore it.
    const prevDate = rawItemsRef.current.find(r => r.id === id)?.nextReviewDate ?? null;
    const prevIso = prevDate instanceof Date ? prevDate.toISOString() : prevDate;
    if (!prevIso) return;
    snoozeInFlightRef.current.add(id);
    type PendingDate = { iso: string; settledAt: number | null };
    const applyDate = (iso: string): PendingDate => {
      const entry: PendingDate = { iso, settledAt: null };
      pendingDatesRef.current.set(id, entry);
      commitItems(rawItemsRef.current.map(r => (r.id === id ? { ...r, nextReviewDate: iso } : r)));
      return entry;
    };
    // Stamp the override once its OWNING request settles, so the next refetch
    // may retire it (fetchReviews trusts server dates from that point on).
    // Ownership is the entry's identity: if a later snooze/undo of this card
    // has replaced the map entry, that request is still in flight and this
    // stamp must not touch it — a cross-stamp would let a refetch expire the
    // live override and bounce the card to a stale server date.
    const markSettled = (owned: PendingDate) => {
      if (pendingDatesRef.current.get(id) === owned) owned.settledAt = Date.now();
    };
    // eslint-disable-next-line react-hooks/purity -- runs at click time (event handler), not during render; mirrors the server's max(now, due) offset rule
    let owned = applyDate(new Date(Math.max(Date.now(), new Date(prevIso).getTime()) + days * 86_400_000).toISOString());
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned status ${res.status}`);
      }
      const updated = await res.json();
      const serverIso = new Date(updated.nextReviewDate).toISOString();
      owned = applyDate(serverIso);
      const newDate = new Date(serverIso).toLocaleDateString(language === "german" ? "de-DE" : "en-GB");
      // CRAFT.md §8 — forgiveness: an undo bar instead of a confirm dialog.
      addToast("undo", language === "german" ? `Verschoben auf ${newDate}.` : `Snoozed until ${newDate}.`, {
        action: {
          label: language === "german" ? "Rückgängig" : "Undo",
          onClick: () => {
            // Optimistic restore too — the card jumps back before the PATCH lands.
            let undoOwned = applyDate(prevIso);
            fetch(`/api/reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restoreDate: prevIso }) })
              .then(res => { if (!res.ok) throw new Error(); fetchReviews(); })
              .catch(() => {
                undoOwned = applyDate(serverIso);
                addToast("error", language === "german" ? "Rückgängig machen fehlgeschlagen." : "Failed to undo.");
              })
              .finally(() => markSettled(undoOwned));
          },
        },
      });
      fetchReviews();
    } catch (err) {
      console.error(err);
      owned = applyDate(prevIso);
      addToast("error", language === "german" ? "Verschieben fehlgeschlagen." : "Failed to snooze the review.");
    } finally {
      snoozeInFlightRef.current.delete(id);
      markSettled(owned);
    }
  };

  const handleDeleteModule = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Two-step confirmation: first click arms the button, second click deletes.
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }
    setConfirmingDeleteId(null);
    // Optimistic: the card leaves NOW; deletedIdsRef keeps an in-flight
    // background refetch from re-adding it while the DELETE is on the wire.
    const prevItems = rawItemsRef.current;
    deletedIdsRef.current.add(id);
    commitItems(prevItems.filter(r => r.id !== id));
    // One card = one lecture (SRSItem) — "Modul" here misled: the module's
    // other lectures survive this delete.
    addToast("success", language === "german" ? "Vorlesung gelöscht." : "Lecture deleted.");
    try {
      const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
      // 404 = already gone on the server — deleted either way.
      if (!res.ok && res.status !== 404) throw new Error(`Server returned status ${res.status}`);
    } catch (err) {
      console.error(err);
      // Roll back additively: reinsert only THIS card into the live list (a
      // wholesale snapshot restore would resurrect cards deleted, or re-date
      // cards snoozed, while the DELETE was on the wire). The follow-up
      // refetch restores exact ordering.
      deletedIdsRef.current.delete(id);
      commitItems([...rawItemsRef.current, ...prevItems.filter(r => r.id === id)]);
      void fetchReviews();
      addToast("error", language === "german" ? "Fehler beim Löschen der Vorlesung." : "Failed to delete the lecture.");
    }
  };

  // ── Library controls (design 9a) ───────────────────────────────────────────
  /** Derived collapse-all control: if ANYTHING is open, close everything; else open every semester + module. */
  const anyLibraryOpen = expandedLibrarySemesters.size > 0 || expandedLibraryModules.size > 0;
  const collapseAllTimerRef = useRef<number | null>(null);
  const toggleAllLibrary = () => {
    if (collapseAllTimerRef.current !== null) {
      window.clearTimeout(collapseAllTimerRef.current);
      collapseAllTimerRef.current = null;
    }
    if (anyLibraryOpen) {
      // MO-14: collapse only the top level with animation. Each module/item body
      // stays mounted at full height inside its collapsing semester, so we get one
      // clean height animation per semester instead of dozens of nested, concurrent
      // height tweens. Once the semesters have finished collapsing (and unmounted
      // their contents), clear the inner sets silently so re-expanding starts fresh.
      setExpandedLibrarySemesters(new Set());
      collapseAllTimerRef.current = window.setTimeout(() => {
        setExpandedLibraryModules(new Set());
        collapseAllTimerRef.current = null;
      }, 240);
    } else {
      const sems = new Set<number>();
      const mods = new Set<string>();
      for (const [sem, modules] of libraryBySemester.entries()) {
        sems.add(sem);
        for (const moduleName of modules.keys()) mods.add(`${sem}__${moduleName}`);
      }
      setExpandedLibrarySemesters(sems);
      setExpandedLibraryModules(mods);
    }
  };
  useEffect(() => () => {
    if (collapseAllTimerRef.current !== null) window.clearTimeout(collapseAllTimerRef.current);
  }, []);

  /** Edit-mode module delete: two-step confirm, then removes ALL lectures of the module. */
  const handleDeleteLibraryModule = async (e: React.MouseEvent, modKey: string, lectures: RawReviewItem[]) => {
    e.stopPropagation();
    if (confirmingDeleteModuleKey !== modKey) {
      setConfirmingDeleteModuleKey(modKey);
      return;
    }
    setConfirmingDeleteModuleKey(null);
    // Optimistic: the whole module row leaves NOW (same guard-set trick as the
    // single-lecture delete); a failure restores just the lectures that survived.
    const prevItems = rawItemsRef.current;
    const ids = new Set(lectures.map(l => l.id));
    ids.forEach(id => deletedIdsRef.current.add(id));
    commitItems(prevItems.filter(r => !ids.has(r.id)));
    addToast("success", language === "german" ? "Modul gelöscht." : "Module deleted.");
    const results = await Promise.allSettled(
      lectures.map(l => fetch(`/api/reviews/${l.id}`, { method: "DELETE" }))
    );
    // 404 = already gone on the server — deleted either way.
    const failed = lectures.filter((l, i) => {
      const r = results[i];
      return !(r.status === "fulfilled" && (r.value.ok || r.value.status === 404));
    });
    if (failed.length > 0) {
      const failedIds = new Set(failed.map(l => l.id));
      failedIds.forEach(id => deletedIdsRef.current.delete(id));
      // Bring the failed ones back (a follow-up refetch restores exact order).
      commitItems([...rawItemsRef.current, ...prevItems.filter(r => failedIds.has(r.id))]);
      void fetchReviews();
      addToast("error", language === "german"
        ? (lectures.length === 1
            ? "Die Vorlesung konnte nicht gelöscht werden."
            : `${failed.length} von ${lectures.length} Vorlesungen konnten nicht gelöscht werden.`)
        : (lectures.length === 1
            ? "The lecture could not be deleted."
            : `${failed.length} of ${lectures.length} lectures could not be deleted.`));
    }
  };


  // Monotonic token for savePresets — see its doc comment.
  const presetsSaveSeqRef = useRef(0);
  /** Persist module presets; shared by add/remove handlers in the settings modal.
   *  Optimistic: the list updates (and onApply runs) immediately; the server's
   *  reply reconciles it, and a failure rolls back and runs onRollback. Each
   *  POST sends the FULL list, so only the LATEST call's response may touch
   *  state — an out-of-order older response would clobber a newer edit. */
  const savePresets = (newPresets: string[], opts?: { onApply?: () => void; onRollback?: () => void }) => {
    const prevPresets = modulePresets;
    const seq = ++presetsSaveSeqRef.current;
    setModulePresets(newPresets);
    opts?.onApply?.();
    const rollback = (message: string) => {
      // Superseded by a newer edit — that call's response owns the state now.
      if (seq !== presetsSaveSeqRef.current) return;
      setModulePresets(prevPresets);
      opts?.onRollback?.();
      addToast("error", message);
    };
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_presets', presets: newPresets })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          rollback(`${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
          return;
        }
        // Server list is authoritative (it may trim/dedupe) — reconcile silently.
        if (seq === presetsSaveSeqRef.current) setModulePresets(data.modulePresets || []);
      })
      .catch(err => {
        console.error(err);
        rollback(language === "german" ? "Einstellungen konnten nicht gespeichert werden." : "Failed to save settings.");
      });
  };

  /** Danger-zone semester actions (new semester / reset), confirmed via two-step buttons. */
  const runSemesterAction = (action: "new_semester" | "reset_semester") => {
    if (isSemesterActionBusy) return;
    setIsSemesterActionBusy(true);
    setConfirmingNewSemester(false);
    setConfirmingResetSemester(false);
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
          return;
        }
        setCurrentSemester(data.currentSemester);
        setModulePresets(data.modulePresets || []);
        setSubjectInput("");
        addToast("success", language === "german"
          ? `Semester aktualisiert: Semester ${data.currentSemester}.`
          : `Semester updated: Semester ${data.currentSemester}.`);
      })
      .catch(err => {
        console.error(err);
        addToast("error", language === "german" ? "Aktion fehlgeschlagen. Bitte erneut versuchen." : "Action failed. Please try again.");
      })
      .finally(() => setIsSemesterActionBusy(false));
  };

  useEffect(() => {
    if (!showSettingsModal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient confirm state when the modal closes
      setConfirmingNewSemester(false);
      setConfirmingResetSemester(false);
    }
  }, [showSettingsModal]);

  // Remembers the untouched free-text template so the draft autosave can tell
  // "user typed something" apart from "prefilled headers only".
  const freeTemplateRef = useRef("");

  const startQuiz = useCallback((review: ReviewCard, comprehensionQuizText?: string) => {
    // EM-2 — a grade in flight belongs to the CURRENT selectedReview; starting
    // another quiz would re-render the grading screen under the new lecture's
    // header and paint the finished verdict beneath the wrong title. One at a time.
    if (isGrading) {
      addToast("error", language === "german"
        ? "Eine Bewertung läuft noch — das Ergebnis ist gleich da."
        : "A grading run is still in progress — your result is almost ready.");
      return;
    }
    setSelectedReview(review);

    // Verständnis-Check: the freshly generated quiz is passed in directly (the
    // list payload never carries comprehensionQuizText). Grading then runs with
    // `comprehension: true` — schedule, levels and drafts stay untouched.
    const isComprehension = typeof comprehensionQuizText === "string";
    setComprehensionMode(isComprehension);

    // The server already resolved the level-correct quiz text (incl. quiz-1
    // fallback and the level>=6 quiz-7 rollover) into `currentQuizText`.
    const quizText = isComprehension ? comprehensionQuizText : review.raw.currentQuizText || "";

    // Only display/process student questions
    const studentQuizOnly = extractStudentQuiz(quizText);
    setActiveQuizText(studentQuizOnly);

    // Fallback template (used only if the structured per-task sheet can't parse).
    // Match task headers in BOTH languages at line starts — mirroring
    // parseQuizTasks — so we build one block per REAL task instead of a hardcoded
    // 2-task German guess that was wrong for every English quiz.
    const taskMatches = studentQuizOnly.match(/^[ \t]*(?:Aufgabe|Task)\s+\d+/gim) || [];
    let answerTemplate = "";
    if (taskMatches.length > 0) {
      answerTemplate = taskMatches.map((t: string) => `${t.trim().replace(/\s+/g, " ")}:\n\n`).join("\n");
    } else {
      answerTemplate = (language === "german" ? "Aufgabe 1:" : "Task 1:") + "\n\n";
    }

    freeTemplateRef.current = answerTemplate;

    // Parse individual tasks for structured answer sheet
    const tasks = parseQuizTasks(studentQuizOnly);
    setParsedTasks(tasks);

    const initialAnswers: Record<string, string> = {};
    tasks.forEach(t => {
      initialAnswers[t.id] = "";
    });

    // Restore a saved draft (reload / phone lock must not eat typed answers).
    // Only ids that still exist in THIS quiz are merged — stale drafts from a
    // regenerated quiz text can't inject answers into the wrong task.
    // Comprehension checks NEVER touch drafts: every run is a fresh quiz, and a
    // stale draft from the level quiz must not leak into (or get eaten by) it.
    const draft = isComprehension ? null : loadDraft(review.id, review.level);
    let restored = false;
    let freeText = answerTemplate;
    if (draft) {
      for (const [taskId, text] of Object.entries(draft.individual || {})) {
        if (taskId in initialAnswers && text) {
          initialAnswers[taskId] = text;
          restored = true;
        }
      }
      if (tasks.length === 0 && draft.free && draft.free !== answerTemplate) {
        freeText = draft.free;
        restored = true;
      }
    }
    setStudentAnswers(freeText);
    setIndividualAnswers(initialAnswers);
    setAnswerSketches({}); // sketches never survive a quiz switch (not draft-persisted)
    setOpenScribbles({});
    if (restored) {
      addToast("success", language === "german" ? "Entwurf wiederhergestellt." : "Draft restored.");
    }

    setGradingResult(null);
    setGradingError("");
    setShowTutorPanel(false); // a fresh quiz starts unobstructed
    setActiveTab("quiz");
    setShowMobileMenu(false); // close the mobile menu if open
    // Always start at the top so the quiz header is immediately visible — the
    // activeTab effect covers tab CHANGES; this also covers re-starts while
    // already on the quiz tab. Instant + the md+ <main> scroller (PP-2).
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
      mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [language, addToast, isGrading]);

  useEffect(() => {
    if (processedQuizIdRef.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const quizId = params.get("quizId");
    // No deep link → nothing to consume.
    if (!quizId) {
      processedQuizIdRef.current = true;
      return;
    }
    // Wait until the list has loaded before deciding (an empty list can't match).
    if (upcomingReviews.length === 0) return;

    // Consume the deep link EXACTLY ONCE now — whether or not the item is found.
    // Leaving it armed let a later background refetch (that finally brings the
    // item into the list) call startQuiz mid-other-quiz. Strip only quizId,
    // preserving any other query params.
    processedQuizIdRef.current = true;
    params.delete("quizId");
    const qs = params.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : ""));

    const review = upcomingReviews.find(r => r.id === quizId);
    if (review) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- runs once (guarded by processedQuizIdRef); opens the ?quizId= deep link
      startQuiz(review);
    } else {
      // EM-17 — a notification/calendar link for a lecture that was deleted (or
      // belongs to another account) would otherwise land on a silent dashboard.
      // Say why, so "link broken" isn't mistaken for "app ignored me".
      addToast(
        "error",
        language === "german" ? "Diese Wiederholung existiert nicht mehr." : "That review no longer exists.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep-link opener: intentionally keyed only on upcomingReviews; the open is guarded by processedQuizIdRef
  }, [upcomingReviews]);

  // Debounced draft autosave — a reload or phone lock must not eat 10 typed answers.
  useEffect(() => {
    if (activeTab !== "quiz" || !selectedReview || isGrading || gradingResult) return;
    // Comprehension checks are draft-free (see startQuiz) — never let one
    // overwrite or delete the saved draft of the REAL quiz at this level.
    if (comprehensionMode) return;
    const { id, level } = selectedReview;
    const timeoutId = window.setTimeout(() => {
      const hasIndividualContent = Object.values(individualAnswers).some(v => v.trim().length > 0);
      const hasFreeContent = parsedTasks.length === 0 && studentAnswers !== freeTemplateRef.current && studentAnswers.trim().length > 0;
      try {
        if (hasIndividualContent || hasFreeContent) {
          const draft: AnswerDraft = { individual: individualAnswers, free: studentAnswers, savedAt: Date.now() };
          localStorage.setItem(draftKeyFor(id, level), JSON.stringify(draft));
        } else {
          localStorage.removeItem(draftKeyFor(id, level));
        }
      } catch { /* quota/private mode — drafts are best-effort */ }
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [individualAnswers, studentAnswers, activeTab, selectedReview, isGrading, gradingResult, parsedTasks.length, comprehensionMode]);

  const exportQuizForPrint = () => {
    if (!selectedReview || parsedTasks.length === 0) return;
    window.print();
  };

  /** Shared intake for the drop zone and the file picker: keeps supported
   *  types only, skips duplicate names (both paths), reports rejects. */
  const addUploadFiles = (incoming: File[]) => {
    const rejected = incoming.filter((f) => !isSupportedUpload(f.name));
    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).join(", ");
      addToast("error", language === "german"
        ? `Nicht unterstützt: ${names} — bitte PDF, DOCX, XLSX, CSV oder TXT.`
        : `Not supported: ${names} — please use PDF, DOCX, XLSX, CSV or TXT.`);
    }
    const supported = incoming.filter((f) => isSupportedUpload(f.name));
    if (supported.length > 0) {
      setUploadedFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        return [...prev, ...supported.filter((f) => !existingNames.has(f.name))];
      });
    }
  };

  const handleGenerate = async () => {
    if ((!textInput.trim() && uploadedFiles.length === 0) || !subjectInput.trim()) return;
    if (isGenerating) return; // double-submit guard
    setIsGenerating(true);
    setGenerationDone(false); // IA-8 — leaving the success screen back into a run
    setUploadError(""); // a fresh run clears the previous failure record (EM-1)
    setProgressStep(0);
    setProgressMsg(language === "german" ? "Starte KI-Pipeline…" : "Starting AI pipeline…");

    // Hard timeout so a hung connection can't leave the spinner on forever.
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);
    let sawDone = false;

    try {
      const formData = new FormData();
      formData.append("subjectMain", subjectInput.trim());
      // Topic is auto-derived from the material during generation (blueprint KERNTHEMA).
      formData.append("subjectSub", "");
      formData.append("language", language);
      formData.append("modelName", aiModel);
      if (textInput.trim()) formData.append("content", textInput);
      uploadedFiles.forEach(file => formData.append("files", file));

      const res = await fetch("/api/quiz", {
        method: "POST",
        body: formData,
        signal: abortController.signal
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned status ${res.status}`);
      }

      const sawTerminalEvent = await readNdjsonStream(res, (evt) => {
        if (evt.event === "progress") {
          if (typeof evt.data.step === "number") setProgressStep(evt.data.step);
          setProgressMsg(evt.data.message ?? "");
        } else if (evt.event === "done") {
          sawDone = true;
          setProgressStep(8);
          setProgressMsg(language === "german" ? "Erfolgreich in deine SRS-Datenbank integriert!" : "Successfully integrated into your SRS database!");
          // `srsItem` here is the FULL created row — never append it to the
          // slim list state; refetch the slim list instead.
          fetchReviews();
          // IA-8 — the upload flow exists for batch uploads (a whole day of
          // lectures). Instead of a 3s timer that resets the form and yanks the
          // user to the dashboard mid-flow, keep the completed checklist on screen
          // and offer the fork explicitly (upload another / go to dashboard).
          // generationDone (not isGenerating) drives the success screen, so no
          // stray "AI task running" lock lingers in Settings afterwards.
          setIsGenerating(false);
          setGenerationDone(true);
        } else if (evt.event === "error") {
          const msg = evt.data.message ?? fallbackErrorMsg(language);
          setProgressMsg(msg);
          // EM-1 — keep a persistent inline failure record (the progress screen
          // unmounts right after this and a 5s toast is easy to miss).
          setUploadError(msg);
          addToast("error", `${language === "german" ? "Generierungsfehler" : "Generation error"}: ${msg}`);
        }
      });

      if (!sawTerminalEvent) {
        // Stream died silently (network drop / server restart / HMR). The
        // backend keeps working after a disconnect — results land in the DB.
        const disconnectMsg = language === "german"
          ? "Verbindung unterbrochen — Status wird neu geladen…"
          : "Connection lost — reloading status…";
        setProgressMsg(disconnectMsg);
        setUploadError(disconnectMsg);
        addToast("error", disconnectMsg);
        fetchReviews();
      }
    } catch (e) {
      console.error(e);
      const message = e instanceof DOMException && e.name === "AbortError"
        ? (language === "german" ? "Zeitüberschreitung — Verbindung unterbrochen. Status wird neu geladen…" : "Timeout — connection lost. Reloading status…")
        : e instanceof Error && e.message ? e.message : (language === "german" ? "Verbindung zum Server fehlgeschlagen." : "Failed to connect to server.");
      setProgressMsg(message);
      setUploadError(message);
      addToast("error", message);
      fetchReviews();
    } finally {
      window.clearTimeout(timeoutId);
      // Always clear the busy state — EXCEPT after `done`, where the success
      // screen stays mounted (isGenerating kept true, generationDone flips the
      // screen to its completed state) until the user picks a next step (IA-8).
      if (!sawDone) setIsGenerating(false);
    }
  };

  const handleGrade = useCallback(async () => {
    if (!selectedReview || isGrading) return;

    // Scribbled answers ride along as labeled images; the text under the task
    // header points the graders at the right image so nothing gets orphaned.
    // taskId lets the server key the revisit snapshot back to the task box.
    const sketchesPayload: { label: string; image: string; taskId: string }[] = [];
    let payloadAnswers = studentAnswers;
    if (parsedTasks.length > 0) {
      payloadAnswers = parsedTasks.map(task => {
        const answer = (individualAnswers[task.id] || "").trim();
        const sketch = answerSketches[task.id];
        if (!sketch) return `${task.header}\n${answer}`;
        const sketchLabel = task.header.replace(/:\s*$/, ""); // "Aufgabe 3"
        sketchesPayload.push({ label: sketchLabel, image: sketch, taskId: task.id });
        const note = language === "german"
          ? `[Antwort handschriftlich gescribbelt — siehe Bild „${sketchLabel}“ unten]`
          : `[Answer scribbled by hand — see image "${sketchLabel}" below]`;
        return `${task.header}\n${answer ? `${answer}\n${note}` : note}`;
      }).join("\n\n");
    } else if (answerSketches[FREE_SKETCH_KEY]) {
      const freeLabel = language === "german" ? "Antwortblatt" : "Answer sheet";
      sketchesPayload.push({ label: freeLabel, image: answerSketches[FREE_SKETCH_KEY], taskId: FREE_SKETCH_KEY });
      const note = language === "german"
        ? `\n\n[Zusätzlich handschriftlich gescribbelte Antworten — siehe Bild „${freeLabel}“ unten]`
        : `\n\n[Additional hand-scribbled answers — see image "${freeLabel}" below]`;
      payloadAnswers = `${studentAnswers}${note}`;
    }

    if (!payloadAnswers.trim() && sketchesPayload.length === 0) return;

    // Stop any live interactive (hands-free) session before grading — otherwise
    // the mic stays hot through the grading + result screens and, in gemini/
    // degraded mode, keeps streaming audio to /api/transcribe. stopInteractive is
    // idempotent, so calling it when idle is a no-op.
    stopInteractive();

    setIsGrading(true);
    setGradingStep(0);
    setGradingMsg(language === "german" ? "Starte Bewertungs-Pipeline…" : "Starting grading pipeline…");
    setGradingError("");

    // Hard timeout so a hung connection can't leave the spinner on forever.
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);

    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedReview.id,
          studentAnswers: payloadAnswers,
          language: language,
          modelName: aiModel,
          // Verständnis-Check: same pipeline, but the outcome is only the
          // score — schedule, levels and logs stay untouched server-side.
          ...(comprehensionMode ? { comprehension: true } : {}),
          // Structured copy of the same answers, keyed by task id — the server
          // persists these as the revisit snapshot (latest attempt only).
          structuredAnswers: parsedTasks.length > 0
            ? {
                tasks: Object.fromEntries(
                  parsedTasks
                    .map(task => [task.id, (individualAnswers[task.id] || "").trim()])
                    .filter(([, answer]) => answer)
                ),
                free: "",
              }
            : { tasks: {}, free: studentAnswers.trim() },
          // Scribbled answer boxes (allowlist feature; server re-checks).
          ...(sketchesPayload.length > 0 ? { sketches: sketchesPayload } : {}),
        }),
        signal: abortController.signal
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned status ${res.status}`);
      }

      const sawTerminalEvent = await readNdjsonStream(res, (evt) => {
        if (evt.event === "progress") {
          if (typeof evt.data.step === "number") setGradingStep(evt.data.step);
          setGradingMsg(evt.data.message ?? "");
        } else if (evt.event === "done") {
          setGradingStep(5);
          setGradingMsg(comprehensionMode
            ? (language === "german" ? "Verständnis-Check abgeschlossen!" : "Comprehension check finished!")
            : (language === "german" ? "Bewertung abgeschlossen! Zeitplan aktualisiert." : "Grading finished! Scheduling updated."));
          // Graded = answers consumed; the local draft is obsolete either way.
          // (Comprehension checks are draft-free — and must not delete the REAL
          // level draft under the same key.)
          if (!comprehensionMode) clearDraft(selectedReview.id, selectedReview.level);
          // `srsItem` is the FULL updated row — keep only what the result
          // screen needs and resync the slim list via refetch.
          const nrd = evt.data.srsItem?.nextReviewDate;
          setGradingResult({
            isPass: !!evt.data.isPass,
            feedback: evt.data.feedback ?? evt.data.srsItem?.lastFeedback ?? "",
            // A comprehension run never moves the schedule — showing the (old)
            // date on the result screen would read as "rescheduled", so drop it.
            nextReviewDate: comprehensionMode ? null : nrd ? new Date(nrd).toISOString() : null,
            currentLevel: typeof evt.data.srsItem?.currentLevel === "number" ? evt.data.srsItem.currentLevel : null,
            comprehension: comprehensionMode,
            comprehensionScore: typeof evt.data.comprehensionScore === "number" ? evt.data.comprehensionScore : null,
          });
          fetchReviews();
          // EM-2 — the grading copy invites leaving this page. If the user did,
          // the quiz tab has no nav entry to come back through: hand them the
          // way back with an action toast (the ink action bar, 6s).
          if (activeTabRef.current !== "quiz") {
            addToast("undo", language === "german" ? "Bewertung abgeschlossen." : "Grading finished.", {
              action: {
                label: language === "german" ? "Ergebnis ansehen" : "View result",
                onClick: () => setActiveTab("quiz"),
              },
            });
          }
        } else if (evt.event === "error") {
          const msg = evt.data.message ?? fallbackErrorMsg(language);
          setGradingMsg(msg);
          setGradingError(msg);
          addToast("error", `${language === "german" ? "Bewertungsfehler" : "Grading error"}: ${msg}`);
        }
      });

      if (!sawTerminalEvent) {
        // Stream died silently — the backend keeps grading after a
        // disconnect, so resync the list from the DB.
        const message = language === "german"
          ? "Verbindung unterbrochen — Status wird neu geladen…"
          : "Connection lost — reloading status…";
        setGradingMsg(message);
        setGradingError(message);
        addToast("error", message);
        fetchReviews();
      }
    } catch (e) {
      console.error(e);
      const message = e instanceof DOMException && e.name === "AbortError"
        ? (language === "german" ? "Zeitüberschreitung — Verbindung unterbrochen. Status wird neu geladen…" : "Timeout — connection lost. Reloading status…")
        : e instanceof Error && e.message ? e.message : (language === "german" ? "Verbindung zum Server fehlgeschlagen." : "Failed to connect to grading server.");
      setGradingMsg(message);
      setGradingError(message);
      addToast("error", message);
      fetchReviews();
    } finally {
      window.clearTimeout(timeoutId);
      setIsGrading(false); // never leave the grading spinner stuck
    }
  }, [selectedReview, isGrading, studentAnswers, parsedTasks, individualAnswers, answerSketches, language, aiModel, fetchReviews, addToast, comprehensionMode, stopInteractive]);

  /**
   * Verständnis-Check button (library): stream the quiz generation, then drop
   * straight into the quiz view with the fresh quiz. One generation at a time.
   * Abandoning the quiz is harmless — the previous score stays until a new run
   * is actually graded (overwrite-per-run happens server-side on grading).
   */
  const generateComprehension = useCallback(async (item: RawReviewItem) => {
    if (compGen) return;
    setCompGen({ itemId: item.id, message: language === "german" ? "Starte Verständnis-Check…" : "Starting comprehension check…" });

    // Hard timeout so a hung connection can't leave the button spinning forever.
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);

    try {
      const res = await fetch("/api/comprehension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, language, modelName: aiModel }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned status ${res.status}`);
      }

      let quizText = "";
      let errMsg = "";
      const sawTerminalEvent = await readNdjsonStream(res, (evt) => {
        if (evt.event === "progress") {
          setCompGen({ itemId: item.id, message: evt.data.message ?? "" });
        } else if (evt.event === "done") {
          quizText = evt.data.quizText ?? "";
        } else if (evt.event === "error") {
          errMsg = evt.data.message ?? fallbackErrorMsg(language);
        }
      });
      if (errMsg) throw new Error(errMsg);
      if (!sawTerminalEvent || !quizText.trim()) {
        throw new Error(language === "german"
          ? "Verbindung unterbrochen — bitte erneut versuchen."
          : "Connection lost — please try again.");
      }

      // Auto-open: reuse the whole quiz machinery with the fresh quiz text.
      const card = upcomingReviews.find((r) => r.id === item.id) ?? formatItems([item])[0];
      if (card) startQuiz(card, quizText);
    } catch (e) {
      console.error(e);
      const message = e instanceof DOMException && e.name === "AbortError"
        ? (language === "german" ? "Zeitüberschreitung — bitte erneut versuchen." : "Timeout — please try again.")
        : e instanceof Error && e.message
          ? e.message
          : (language === "german" ? "Verbindung zum Server fehlgeschlagen." : "Failed to reach the server.");
      addToast("error", `${language === "german" ? "Verständnis-Check" : "Comprehension check"}: ${message}`);
    } finally {
      window.clearTimeout(timeoutId);
      setCompGen(null);
    }
  }, [compGen, language, aiModel, upcomingReviews, startQuiz, addToast]);

  // CRAFT.md §3 — global keyboard shortcuts (companion to the Escape effect
  // above). Lives below startQuiz/handleGrade because const declarations
  // aren't hoisted and both belong in the dependency array.
  const interactiveActive = interactive.active;
  const interactiveTogglePause = interactive.togglePause;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K — jump to the library search. Always available, even while
      // typing. Any open overlay closes first so focus can't land behind it.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPromptModal(null);
        setPromptsModal(null);
        setCompFeedback(null);
        closeSettingsModal();
        setShowCalendarModal(false);
        setActiveFeedbackItem(null);
        setArchiveModalData(null);
        setActiveTab("library");
        window.setTimeout(() => librarySearchRef.current?.focus(), 80);
        return;
      }

      const modalOpen = Boolean(promptModal || promptsModal || showCalendarModal || showSettingsModal || activeFeedbackItem || archiveModalData || compFeedback);

      // ⌘Enter / Ctrl+Enter — submit the quiz. Must also work while typing in an answer box.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (modalOpen || activeTab !== "quiz" || isGrading || gradingResult) return;
        const hasAnswer = parsedTasks.length > 0
          ? parsedTasks.some(task => (individualAnswers[task.id] || "").trim().length > 0)
          : studentAnswers.trim().length > 0;
        if (!hasAnswer) return; // mirrors the submit button's disabled condition
        e.preventDefault();
        handleGrade();
        return;
      }

      // Everything below stays quiet while a modal is open or the user is typing.
      const el = document.activeElement;
      const typing = el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (modalOpen || typing) return;

      // Enter — start the first due review straight from the dashboard.
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (activeTab !== "dashboard") return;
        const firstDue = upcomingReviews.find(r => r.isDue);
        if (!firstDue) return;
        e.preventDefault();
        startQuiz(firstDue);
        return;
      }

      // Space — pause/resume the hands-free voice mode.
      if (e.key === " " && interactiveActive) {
        e.preventDefault();
        interactiveTogglePause();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    promptModal, promptsModal, showCalendarModal, showSettingsModal, closeSettingsModal, activeFeedbackItem, archiveModalData, compFeedback,
    activeTab, isGrading, gradingResult, parsedTasks, individualAnswers, studentAnswers, upcomingReviews,
    interactiveActive, interactiveTogglePause, startQuiz, handleGrade,
  ]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-[100dvh] bg-transparent flex font-sans">

      {/* Print-Only Wrapper */}
      {activeTab === "quiz" && selectedReview && parsedTasks.length > 0 && (
        <div className="hidden print:block p-4 md:p-8 w-full bg-white text-black">
          <div className="max-w-3xl mx-auto">
            <div className="border-b-2 border-(--line) pb-6 mb-8">
              <h1 className="text-2xl font-display text-ink-900 mb-2" style={{ fontWeight: 470 }}>{selectedReview.topic}</h1>
              <p className="text-xs text-ink-600 font-medium">
                <span className="bg-ink-900 text-paper-0 px-2 py-0.5 rounded mr-2 font-bold uppercase tracking-wider">Level {selectedReview.level + 1}</span>
                {selectedReview.subject}
              </p>
              <div className="flex justify-between mt-4 pt-4 border-t border-(--line) text-xs text-ink-600">
                <p>Name: ___________________________</p>
                <p>{language === "german" ? "Datum" : "Date"}: _______________</p>
              </div>
            </div>

            <div className="space-y-8">
              {parsedTasks.map(task => {
                let lineCount = 4;
                const isMC = /^[A-D]\)\s/m.test(task.questionText);
                if (isMC) {
                  lineCount = 2;
                } else {
                  const match = task.questionText.match(/(\d+)(?:[-–](\d+))?\s*(Sätze|Stichpunkt)/i);
                  if (match) {
                    const num = parseInt(match[2] || match[1], 10);
                    if (!isNaN(num)) {
                      lineCount = Math.max(3, Math.min(15, Math.ceil(num * 1.5)));
                    }
                  }
                }

                return (
                  <div key={task.id} className="break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                    <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wider mb-2">{task.label}</h2>
                    <div className="text-sm text-ink-900 bg-paper-2 border border-(--line) rounded-lg p-4 mb-4 whitespace-pre-wrap leading-relaxed">
                      <ChemText text={task.questionText} theme="paper" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">{language === "german" ? "Antwort" : "Answer"}:</p>
                      {Array.from({ length: lineCount }).map((_, i) => (
                        <div key={i} className="border-b border-(--line) h-8 w-full"></div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main App (Hidden in Print) */}
      <div className="flex flex-col md:flex-row w-full print:hidden">

        {/* AX-18 — skip link: the first tab stop on every tab switch, so keyboard
            and screen-reader users jump past the sidebar chrome straight to the
            page content instead of paging through ~9 identical nav stops. Hidden
            until focused; the global :focus-visible outline styles it on arrival. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-(--paper-0) focus:text-ink-900 focus:text-sm focus:font-semibold focus:border focus:border-(--line-soft)"
        >
          {language === "german" ? "Zum Inhalt springen" : "Skip to content"}
        </a>

        {/* Mobile Top Bar */}
        <div className="md:hidden flex items-center justify-between px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-(--hairline) bg-(--paper-0)/92 backdrop-blur-md fixed top-0 left-0 right-0 z-50">
          <button onClick={() => { setActiveTab("dashboard"); setShowMobileMenu(false); }} className="flex items-center gap-2.5 cursor-pointer text-left transition-opacity hover:opacity-80">
            <div className="brand-tile w-7 h-7 rounded-[8px]">
              <span className="font-display italic font-semibold text-[13px] text-(--accent-on) -translate-y-px">S</span>
            </div>
            {/* AX-16 — the brand wordmark is a logo, not a page heading; a <p> keeps it out of the screen-reader heading outline (the tab's real h1 lives in <main>). */}
            <p className="text-[15px] font-bold tracking-[-0.01em] text-ink-900">SRS <span className="font-display italic text-(--accent-text)" style={{ fontWeight: 560 }}>Master</span></p>
          </button>
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-expanded={showMobileMenu}
            aria-label={language === "german" ? (showMobileMenu ? "Menü schließen" : "Menü öffnen") : (showMobileMenu ? "Close menu" : "Open menu")}
            className="p-2 -mr-2 text-ink-600 hover:text-ink-900 cursor-pointer"
          >
            {/* MO-2 — the Bars3/XMark swap cross-fades on springTactile instead of flipping raw */}
            <AnimatePresence mode="wait" initial={false}>
              {showMobileMenu ? (
                <motion.span
                  key="menu-close"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}
                  transition={springTactile}
                  className="flex"
                >
                  <XMarkIcon className="w-6 h-6" />
                </motion.span>
              ) : (
                <motion.span
                  key="menu-open"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}
                  transition={springTactile}
                  className="flex"
                >
                  <Bars3Icon className="w-6 h-6" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Spacer for fixed Mobile Top Bar — LS-4: mirrors the bar's real box
            exactly (same paddings + border, inner h-10 = the 40px menu-button
            row) so in-flow content clears the bar instead of tucking 13px under it. */}
        <div className="md:hidden px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-transparent opacity-0 pointer-events-none">
          <div className="h-10"></div>
        </div>

        {/* Sidebar (desktop) + mobile menu overlay (MO-2/MT-3/MT-15) — one body,
            two shells. The desktop aside stays statically mounted; on phones the
            menu mounts conditionally inside AnimatePresence as a fixed overlay
            OVER the main content (which stays mounted, preserving its scroll
            position) and follows the system's enter/exit law. Its top padding
            mirrors the top bar's real height formula instead of the old
            hardcoded 61px. */}
        {(() => {
          // IA-7: the quiz view renders as a tab with no nav entry of its own, so
          // during a quiz every nav item sat idle — the shell couldn't answer
          // "where am I?". Keep the origin lit: Library for comprehension checks
          // (started from the library), Dashboard for graded reviews (started from
          // a due card / "review ahead").
          const quizOrigin = comprehensionMode ? "library" : "dashboard";
          const dashActive = activeTab === "dashboard" || (activeTab === "quiz" && quizOrigin === "dashboard");
          const libActive = activeTab === "library" || (activeTab === "quiz" && quizOrigin === "library");
          const sidebarBody = (
            <>
          <button onClick={() => { setActiveTab("dashboard"); setShowMobileMenu(false); }} className="hidden md:flex items-center gap-3 px-2 cursor-pointer text-left transition-opacity hover:opacity-80">
            <div className="brand-tile w-[34px] h-[34px]">
              <span className="font-display italic font-semibold text-lg text-(--accent-on) -translate-y-px">S</span>
            </div>
            <div className="flex flex-col gap-1">
              {/* AX-16 — brand wordmark demoted from h1 to p (logo, not a heading). */}
              <p className="text-[15px] font-bold tracking-[-0.01em] leading-none text-ink-900 font-sans">SRS <span className="font-display italic text-(--accent-text)" style={{ fontWeight: 560 }}>Master</span></p>
              <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-400">
                Semester {currentSemester}
              </div>
            </div>
          </button>

          <nav className="flex flex-col gap-0.5 md:mt-7.5">
            <button onClick={() => { setActiveTab("dashboard"); setShowMobileMenu(false); }} aria-current={dashActive ? "page" : undefined} className={`flex items-center gap-3 h-[38px] px-3 cursor-pointer press-row ${dashActive ? 'nav-item-active' : 'nav-item-idle'}`}>
              <CalendarDaysIcon className={`w-[18px] h-[18px] shrink-0 ${dashActive ? 'text-ink-900' : 'text-ink-400'}`} strokeWidth={1.6} />
              <span className={`text-sm whitespace-nowrap ${dashActive ? 'font-semibold' : 'font-medium'}`}>Dashboard</span>
            </button>
            <button onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }} aria-current={activeTab === 'upload' ? "page" : undefined} className={`flex items-center gap-3 h-[38px] px-3 cursor-pointer press-row ${activeTab === 'upload' ? 'nav-item-active' : 'nav-item-idle'}`}>
              <CloudArrowUpIcon className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'upload' ? 'text-ink-900' : 'text-ink-400'}`} strokeWidth={1.6} />
              <span className={`text-sm whitespace-nowrap ${activeTab === 'upload' ? 'font-semibold' : 'font-medium'}`}>{language === 'german' ? 'Material hochladen' : 'Upload material'}</span>
            </button>
            <button onClick={() => { setActiveTab("library"); setShowMobileMenu(false); }} aria-current={libActive ? "page" : undefined} className={`flex items-center gap-3 h-[38px] px-3 cursor-pointer press-row ${libActive ? 'nav-item-active' : 'nav-item-idle'}`}>
              <BookOpenIcon className={`w-[18px] h-[18px] shrink-0 ${libActive ? 'text-ink-900' : 'text-ink-400'}`} strokeWidth={1.6} />
              <span className={`text-sm whitespace-nowrap ${libActive ? 'font-semibold' : 'font-medium'}`}>{language === 'german' ? 'Bibliothek' : 'Library'}</span>
            </button>
            <button onClick={() => { setActiveTab("stats"); setShowMobileMenu(false); }} aria-current={activeTab === 'stats' ? "page" : undefined} className={`flex items-center gap-3 h-[38px] px-3 cursor-pointer press-row ${activeTab === 'stats' ? 'nav-item-active' : 'nav-item-idle'}`}>
              <ChartBarIcon className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'stats' ? 'text-ink-900' : 'text-ink-400'}`} strokeWidth={1.6} />
              <span className={`text-sm whitespace-nowrap ${activeTab === 'stats' ? 'font-semibold' : 'font-medium'}`}>{language === 'german' ? 'Statistik' : 'Statistics'}</span>
            </button>
            <button onClick={() => { setShowSettingsModal(true); }} className="flex items-center gap-3 h-[38px] px-3 cursor-pointer press-row nav-item-idle">
              <Cog8ToothIcon className="w-[18px] h-[18px] shrink-0 text-ink-400" strokeWidth={1.6} />
              <span className="text-sm font-medium whitespace-nowrap">{language === 'german' ? 'Einstellungen' : 'Settings'}</span>
            </button>
          </nav>

          <div className="mt-auto flex flex-col pt-8">
            {/* IA-12 — the notifications control moved out of the nav list (it was the
                only "nav item" that didn't navigate) and into Settings, where its scope
                line already promises to cover the app's preferences. */}
            {/* IA-3 — the Live Tutor is SHIPPED (Tutor toggle in every quiz), so the
                card points at it instead of advertising it as locked/coming soon. */}
            <div className="mt-3 card-surface p-4">
              <SparklesIcon className="w-[17px] h-[17px] text-ink-400 mb-2.5" strokeWidth={1.6} />
              <h3 className="text-sm font-semibold text-ink-900">Live Tutor</h3>
              <p className="text-[13px] leading-normal text-ink-600 mt-1">
                {language === "german"
                  ? "Öffne ein Quiz und frag ihn — er kennt deine Vorlesung und deine Entwürfe."
                  : "Open a quiz and ask away — it knows your lecture and your drafts."}
              </p>
            </div>

            {/* User identity strip (Google account) */}
            <div className="mt-4 pt-3.5 px-2 border-t border-(--hairline) flex items-center gap-2.5">
              {userImage && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Google avatar; next/image would need remote-domain config + fixed dimensions
                <img
                  src={userImage}
                  alt={userName || "avatar"}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-(--accent-wash) flex items-center justify-center shrink-0">
                  <span className="text-(--accent-text-strong) text-[11px] font-bold leading-none tracking-[0.02em]">
                    {userName?.[0]?.toUpperCase() ?? userEmail?.[0]?.toUpperCase() ?? "?"}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink-900 truncate leading-tight">{userName || userEmail || "User"}</p>
                {userName && userEmail && (
                  <p className="text-[11px] text-ink-400 truncate leading-snug">{userEmail}</p>
                )}
              </div>
              <Tip label={language === "german" ? "Abmelden" : "Sign out"}>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-9 h-9 -m-1 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-(--grade-fail-accent) hover:bg-(--grade-fail-wash) transition-all cursor-pointer shrink-0"
                >
                  <ArrowRightOnRectangleIcon className="w-[15px] h-[15px]" strokeWidth={1.6} />
                </button>
              </Tip>
            </div>
          </div>
            </>
          );
          return (
            <>
              {/* Desktop sidebar — statically mounted, keeps the one-time mount slide */}
              <motion.aside
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.32, ease: EASE_OUT }}
                className="app-shell-sidebar hidden md:flex md:w-[264px] sidebar-gradient border-r border-(--hairline) flex-col px-4.5 pt-[max(26px,calc(env(safe-area-inset-top)+18px))] pb-[max(1.25rem,env(safe-area-inset-bottom))] md:sticky md:top-0 md:h-[100dvh] z-40 overflow-y-auto custom-scrollbar"
              >
                {sidebarBody}
              </motion.aside>

              {/* Mobile menu — a true overlay: enter 240ms EASE_OUT, exit 200ms
                  EASE_IN_OUT (motion.ts law). Main stays mounted underneath, so
                  its scroll position survives open/close. */}
              <AnimatePresence>
                {showMobileMenu && (
                  <motion.aside
                    key="mobile-menu"
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1, transition: { duration: 0.24, ease: EASE_OUT } }}
                    exit={{ y: -8, opacity: 0, transition: { duration: 0.2, ease: EASE_IN_OUT } }}
                    className="md:hidden fixed inset-x-0 bottom-0 top-[calc(max(0.75rem,env(safe-area-inset-top))_+_3.25rem_+_1px)] z-40 flex flex-col sidebar-gradient px-4.5 pt-6.5 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain custom-scrollbar"
                  >
                    {sidebarBody}
                  </motion.aside>
                )}
              </AnimatePresence>
            </>
          );
        })()}

        {/* MT-1 — bottom tab bar: the four destinations in thumb reach on phones.
            Settings, notifications and the account strip keep living in the
            hamburger menu. Active state is paper+ink — no accent (CC-5). */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-(--paper-0)/92 backdrop-blur-md border-t border-(--hairline) pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-stretch">
            {([
              { tab: "dashboard", icon: CalendarDaysIcon, label: "Dashboard" },
              { tab: "upload", icon: CloudArrowUpIcon, label: language === "german" ? "Hochladen" : "Upload" },
              { tab: "library", icon: BookOpenIcon, label: language === "german" ? "Bibliothek" : "Library" },
              { tab: "stats", icon: ChartBarIcon, label: language === "german" ? "Statistik" : "Stats" },
            ] as const).map(({ tab, icon: Icon, label }) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setShowMobileMenu(false); }}
                aria-current={activeTab === tab ? "page" : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-1 pt-2.5 pb-2 cursor-pointer press-row ${activeTab === tab ? "text-ink-900" : "text-ink-400"}`}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={activeTab === tab ? 1.9 : 1.6} />
                <span className={`text-[10px] leading-none ${activeTab === tab ? "font-semibold" : "font-medium"}`}>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        {/* Mobile: page scrolls naturally (URL bar can collapse, native momentum).
            md+: fixed app-shell — sidebar stays put, main scrolls internally. */}
        {/* md:overscroll-y-contain — <main> is the md+ scroller; without it iOS
            chains its end-of-scroll into a BODY rubber-band that visibly drags
            the fixed tutor panel along (the split-view "weird scrolling"). */}
        <main id="main" tabIndex={-1} ref={mainRef} className="app-shell-main block flex-1 relative px-4 md:px-8 lg:px-12 pt-8 md:pt-11.5 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:pb-[max(3rem,env(safe-area-inset-bottom))] md:h-[100dvh] md:overflow-y-auto md:overscroll-y-contain focus:outline-none">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dash"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="max-w-5xl mx-auto"
              >
                {(() => {
                  const de = language === "german";
                  const dueItems = upcomingReviews.filter(r => r.isDue);
                  const scheduledItems = upcomingReviews.filter(r => !r.isDue);
                  const visibleScheduled = showAllScheduled ? scheduledItems : scheduledItems.slice(0, 6);
                  const firstName = userName?.split(" ")[0];
                  // PP-1 — greeting/eyebrow/dueness key off the `clock` state (null
                  // during SSR + hydration, real before first client paint) instead
                  // of an SSR-computed new Date() that flashed on hydration.
                  const greeting = !clock
                    ? (de ? "Willkommen zurück" : "Welcome back")
                    : (() => {
                        // MC-20 — one set of day-part boundaries for both languages (they
                        // disagreed at 11:00–11:59), plus a small-hours branch so a 2am
                        // session isn't met with a chirpy "Good morning" — the greeting
                        // exists for exactly this kind of quiet acknowledgment.
                        const hour = clock.getHours();
                        if (hour < 5) return de ? "Noch wach?" : "Still up?";
                        if (hour < 11) return de ? "Guten Morgen" : "Good morning";
                        if (hour < 18) return de ? "Guten Tag" : "Good afternoon";
                        return de ? "Guten Abend" : "Good evening";
                      })();
                  const dateEyebrow = clock
                    ? clock.toLocaleDateString(de ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long" })
                    : " ";
                  const nextUp = scheduledItems[0] ? new Date(scheduledItems[0].raw.nextReviewDate) : null;
                  const fmtLong = (d: Date) => d.toLocaleDateString(de ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
                  const fmtShort = (d: Date) => d.toLocaleDateString(de ? "de-DE" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
                  const fmtDay = (d: Date) => d.toLocaleDateString(de ? "de-DE" : "en-GB", { day: "numeric", month: "long" });
                  const minutes = dueItems.length * 7;
                  // IA-2 — overdue exists as a concept: due before today (not just "due").
                  const overdueOf = (r: ReviewCard) => !!clock && startOfLocalDay(new Date(r.raw.nextReviewDate)) < startOfLocalDay(clock);
                  const overdueCount = dueItems.filter(overdueOf).length;
                  // PP-1 — the SSR/hydration frame has no clock yet: show the same
                  // skeleton the reviews fetch uses instead of asserting dueness.
                  const dashboardPending = isLoadingReviews || !clock;
                  return (
                    <>
                      <motion.header variants={riseChild} className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                        <div>
                          <p className="caps-label tracking-[0.14em] mb-3">{dateEyebrow}</p>
                          <h1 className="font-display text-[34px] sm:text-[40px] tracking-[-0.02em] leading-[1.05] text-ink-900" style={{ fontWeight: 470 }}>
                            {greeting}{firstName ? `, ${firstName}` : ""}.
                          </h1>
                          <p className="text-[15px] text-ink-600 mt-3 leading-normal">
                            {dashboardPending
                              ? (de ? "Einen Moment…" : "One moment…")
                              : dueItems.length > 0
                              ? (de
                                  ? `${dueItems.length} ${dueItems.length === 1 ? "Wiederholung ist" : "Wiederholungen sind"} bereit — ${overdueCount > 0 ? `${overdueCount} davon überfällig, ` : ""}etwa ${minutes} Minuten.`
                                  : `${dueItems.length} ${dueItems.length === 1 ? "review is" : "reviews are"} ready — ${overdueCount > 0 ? `${overdueCount} overdue, ` : ""}about ${minutes} minutes.`)
                              : nextUp
                              ? (de ? `Heute ist nichts fällig. Die nächste Wiederholung kommt am ${fmtLong(nextUp)}.` : `Nothing due today. The next review lands ${fmtLong(nextUp)}.`)
                              : reviewsError
                              ? (de ? "Deine Wiederholungen konnten nicht geladen werden." : "Couldn't load your reviews.")
                              : (de ? "Lade deine erste Vorlesung hoch — der Rest plant sich selbst." : "Upload your first lecture — the rest schedules itself.")}
                          </p>
                        </div>
                        {dashboardPending ? null : dueItems.length > 0 ? (
                           
                          <button onClick={() => startQuiz(dueItems[0])} className="btn-primary h-11 px-6 text-sm shrink-0 cursor-pointer">
                            {de ? "Jetzt wiederholen" : "Start reviewing"}
                            <span className="kbd kbd-invert ml-1.5 hidden md:inline-flex">↵</span>
                          </button>
                        ) : scheduledItems.length > 0 ? (
                           
                          <button onClick={() => startQuiz(scheduledItems[0])} className="btn-secondary h-11 px-6 text-sm shrink-0 cursor-pointer">
                            {de ? "Vorarbeiten" : "Review ahead"}
                          </button>
                        ) : null}
                      </motion.header>

                      {!dashboardPending && dueItems.length === 0 && upcomingReviews.length > 0 && (
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 1, ease: EASE_OUT, delay: 0.15 }}
                          className="h-0.5 mt-7 rounded-full origin-left"
                          style={{ background: "linear-gradient(90deg, var(--a-g1), var(--a-g2) 60%, color-mix(in srgb, var(--a-g2) 0%, transparent))" }}
                        />
                      )}

                      <motion.div variants={riseChild} className="flex flex-col xl:flex-row gap-8 xl:gap-9 mt-10 items-start">
                        <div className="flex-1 min-w-0 w-full">
                          {dashboardPending ? (
                            /* Skeleton — static paper blocks, no shimmer */
                            <div className="flex flex-col gap-2.5">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="card-surface p-5 space-y-3">
                                  <div className="h-3 w-28 rounded bg-paper-2" />
                                  <div className="h-4 rounded bg-paper-2" style={{ width: `${58 + i * 10}%` }} />
                                </div>
                              ))}
                            </div>
                          ) : reviewsError && upcomingReviews.length === 0 ? (
                            /* EM-14 — a failed refetch on an empty list must not read as
                               cheerful onboarding: mirror the Library's error card + retry
                               (the code's own documented intent, previously shipped only there). */
                            <div className="card-surface p-12 md:p-16 flex flex-col items-center text-center">
                              <div className="w-[52px] h-[52px] rounded-[14px] bg-paper-2 flex items-center justify-center mb-6">
                                <BookOpenIcon className="w-6 h-6 text-ink-400" strokeWidth={1.6} />
                              </div>
                              <h2 className="font-display text-[22px] text-ink-900 mb-2.5" style={{ fontWeight: 480 }}>
                                {de ? "Konnte nicht geladen werden" : "Couldn't load your reviews"}
                              </h2>
                              <p className="text-sm text-ink-600 leading-relaxed max-w-sm">
                                {de
                                  ? "Beim Laden ist etwas schiefgelaufen. Prüfe deine Verbindung und versuche es erneut."
                                  : "Something went wrong loading your data. Check your connection and try again."}
                              </p>
                              <button
                                onClick={() => { setIsLoadingReviews(true); fetchReviews(); }}
                                className="btn-primary h-11 px-6 text-sm mt-7 cursor-pointer"
                              >
                                {de ? "Erneut versuchen" : "Try again"}
                              </button>
                            </div>
                          ) : upcomingReviews.length === 0 ? (
                            /* Empty state */
                            <div className="card-surface p-12 md:p-16 flex flex-col items-center text-center">
                              <div className="w-[52px] h-[52px] rounded-[14px] bg-paper-2 flex items-center justify-center mb-6">
                                <BookOpenIcon className="w-6 h-6 text-ink-400" strokeWidth={1.6} />
                              </div>
                              {/* AX-16 — this is the primary content under the page h1; an h2 keeps the heading outline from skipping a level. */}
                              <h2 className="font-display text-[22px] text-ink-900 mb-2.5" style={{ fontWeight: 480 }}>
                                {de ? "Hier ist noch nichts" : "Nothing here yet"}
                              </h2>
                              <p className="text-sm text-ink-600 leading-relaxed max-w-sm">
                                {de
                                  ? "Deine erste Vorlesung wird in etwa einer Minute zum Quiz — und alles, was du erstellst, wohnt hier."
                                  : "Your first lecture becomes a quiz in about a minute — and everything you make lives here."}
                              </p>
                              <button
                                onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }}
                                className="btn-primary h-11 px-6 text-sm mt-7 cursor-pointer"
                              >
                                {de ? "Erste Vorlesung hochladen" : "Upload your first lecture"}
                              </button>
                            </div>
                          ) : dueItems.length === 0 ? (
                            /* All clear */
                            <div className="card-surface-elevated p-8">
                              <div className="w-10 h-10 rounded-full bg-(--grade-pass-wash) flex items-center justify-center">
                                <CheckIcon className="w-[18px] h-[18px] text-(--grade-pass-accent)" strokeWidth={2} />
                              </div>
                              <div className="text-base tracking-[-0.011em] text-ink-900 mt-3.5" style={{ fontWeight: 650 }}>{de ? "Alles erledigt." : "All clear."}</div>
                              <p className="text-sm leading-relaxed text-ink-600 mt-1.5">
                                {nextUp
                                  ? (de ? `Das war alles bis ${fmtLong(nextUp)}. Pausen sind Teil der Methode.` : `That's everything until ${fmtLong(nextUp)}. Rest is part of the method.`)
                                  : (de ? "Pausen sind Teil der Methode." : "Rest is part of the method.")}
                              </p>
                            </div>
                          ) : (
                            /* Due today */
                            <div>
                              <div className="flex items-baseline gap-2 mb-3.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-(--a-g2) shadow-[0_0_8px_color-mix(in_srgb,var(--a-g2)_50%,transparent)] self-center"></span>
                                <h2 className="text-base tracking-[-0.011em] text-ink-900 font-sans" style={{ fontWeight: 650 }}>{de ? "Heute fällig" : "Due today"}</h2>
                                {/* IA-2 — overdue is named, not flattened into "today" */}
                                {overdueCount > 0 && (
                                  <span className="text-xs text-ink-400 tnum" style={{ fontWeight: 550 }}>
                                    {de
                                      ? `${overdueCount} überfällig · ${dueItems.length - overdueCount} heute`
                                      : `${overdueCount} overdue · ${dueItems.length - overdueCount} today`}
                                  </span>
                                )}
                              </div>
                              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2.5">
                                {dueItems.map((review) => {
                                  let latestVideoUrl = review.raw.videoUrl;
                                  let videoHistory: { level: number; url: string; date?: string }[] = [];
                                  let latestVideoLevel = 0;
                                  if (latestVideoUrl && latestVideoUrl.startsWith("[")) {
                                    try {
                                      videoHistory = JSON.parse(latestVideoUrl);
                                      if (videoHistory.length > 0) {
                                        const lastVid = videoHistory[videoHistory.length - 1];
                                        latestVideoUrl = lastVid.url;
                                        latestVideoLevel = lastVid.level ?? 0;
                                      } else {
                                        latestVideoUrl = null;
                                      }
                                    } catch { /* malformed history JSON — treat as no videos */ }
                                  } else if (latestVideoUrl && latestVideoUrl.startsWith("http")) {
                                    videoHistory = [{ level: 0, url: latestVideoUrl }];
                                    latestVideoLevel = 0;
                                  }
                                  const isWaitingForNewVideo = latestVideoLevel < review.level;
                                  const archiveVideos = isWaitingForNewVideo ? videoHistory : videoHistory.slice(0, -1);
                                  const materialsOpen = expandedCards.has(review.id);
                                  // IA-2 — overdue cards say since when, quietly (text only, no new color)
                                  const overdueSince = overdueOf(review) ? new Date(review.raw.nextReviewDate) : null;

                                  return (
                                    <motion.div
                                      key={review.id}
                                      variants={riseChild}
                                      {...hoverLift}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        // Only when the CARD itself is focused — Enter on a nested
                                        // button must not also start the quiz (IS-2/AX-2).
                                        if (e.target !== e.currentTarget) return;
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          startQuiz(review);
                                        }
                                      }}
                                      onClick={() => startQuiz(review)}
                                      className="card-surface-elevated group cursor-pointer relative pl-6 pr-5 pt-4 pb-4"
                                    >
                                      {/* Amber thread — the due signal */}
                                      <span className="amber-thread absolute left-0 top-3.5 bottom-3.5 w-[3px]"></span>

                                      <div className="flex items-center gap-3 sm:gap-4">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-baseline gap-2 min-w-0">
                                            <div className="caps-label truncate">{review.subject}</div>
                                            {overdueSince && (
                                              <span className="text-[11px] text-ink-400 whitespace-nowrap shrink-0" style={{ fontWeight: 550 }}>
                                                {de ? `seit ${fmtDay(overdueSince)}` : `since ${fmtDay(overdueSince)}`}
                                              </span>
                                            )}
                                          </div>
                                          <Tip label={review.topic}>
                                            <div className="text-base font-semibold tracking-[-0.011em] text-ink-900 mt-1 max-sm:line-clamp-2 sm:truncate">{review.topic}</div>
                                          </Tip>
                                        </div>
                                        {review.level >= LIB_LEVEL_SHORT.length ? (
                                          /* MC-8: past level 7 the counter keeps climbing — celebrate mastery instead of "Level 8 von 7" */
                                          <MasteryBadge level={review.level} language={language} className="max-sm:hidden" />
                                        ) : (
                                          <span className="hidden sm:inline-block text-xs text-ink-600 border border-(--line-soft) rounded-full px-2.5 py-1 whitespace-nowrap tnum" style={{ fontWeight: 550 }}>
                                            Level&nbsp;{review.level + 1}&nbsp;{de ? "von" : "of"}&nbsp;7
                                          </span>
                                        )}
                                        {/* MO-9/AX-13 — the armed pills now exit on EASE_IN (no raw pop) and
                                            focus jumps into the first pill on arm so keyboard users don't lose
                                            their place. mode="wait" keeps the 32px slot from widening mid-swap. */}
                                        <AnimatePresence mode="wait" initial={false}>
                                        {snoozeArmedId === review.id ? (
                                          <motion.div
                                            key="snooze-armed"
                                            initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12, ease: EASE_IN } }}
                                            transition={springTactile}
                                            className="flex items-center gap-1"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {[1, 3, 7].map(days => (
                                              <Tip key={days} label={de ? `Um ${days} Tag${days > 1 ? "e" : ""} verschieben` : `Snooze by ${days} day${days > 1 ? "s" : ""}`}>
                                              <button
                                                ref={days === 1 ? focusOnArm : undefined}
                                                onClick={(e) => handleSnooze(e, review.id, days)}
                                                /* AX-19 — h-9 lifts these off the 28px sub-HIG floor: they appear under a 5s deadline and are the control most tapped mid-flow. */
                                                className="h-9 px-3 flex items-center rounded-full border border-(--line) bg-paper-1 hover:bg-paper-2 text-[11px] font-semibold text-ink-600 whitespace-nowrap cursor-pointer transition-colors"
                                              >
                                                +{days}{de ? " T" : " d"}
                                              </button>
                                              </Tip>
                                            ))}
                                          </motion.div>
                                        ) : (
                                          <Tip key="snooze-idle" label={de ? "Wiederholung verschieben" : "Snooze review"}>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setSnoozeArmedId(review.id); }}
                                            className="btn-ghost-icon w-8 h-8 flex items-center justify-center shrink-0 cursor-pointer"
                                          >
                                            <ClockIcon className="w-4 h-4" strokeWidth={1.6} />
                                          </button>
                                          </Tip>
                                        )}
                                        </AnimatePresence>
                                        <ChevronRightIcon className="w-4 h-4 text-ink-300 shrink-0" strokeWidth={1.8} />
                                      </div>

                                      {/* Footer: materials disclosure + quiet links + demoted delete */}
                                      <div className="border-t border-(--hairline) mt-3.5 pt-3" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex flex-wrap items-center gap-x-4.5 gap-y-2">
                                          <button
                                            onClick={() => {
                                              setExpandedCards(prev => {
                                                const next = new Set(prev);
                                                if (next.has(review.id)) { next.delete(review.id); } else { next.add(review.id); }
                                                return next;
                                              });
                                            }}
                                            aria-expanded={materialsOpen}
                                            className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-600 transition-colors cursor-pointer"
                                            style={{ fontWeight: 550 }}
                                          >
                                            <motion.span animate={{ rotate: materialsOpen ? 180 : 0 }} transition={springTactile} className="flex">
                                              <ChevronDownIcon className="w-3 h-3" strokeWidth={2} />
                                            </motion.span>
                                            {de ? "Materialien" : "Materials"}
                                          </button>
                                          {review.raw.lastFeedback && (
                                            <button
                                              onClick={() => openFeedbackItem(review.raw)}
                                              className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-600 transition-colors cursor-pointer"
                                              style={{ fontWeight: 550 }}
                                            >
                                              <DocumentTextIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                              {de ? "Letztes Feedback" : "Last feedback"}
                                            </button>
                                          )}
                                          {archiveVideos.length > 0 && (
                                            <button
                                              onClick={() => setArchiveModalData(archiveVideos)}
                                              className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-600 transition-colors cursor-pointer"
                                              style={{ fontWeight: 550 }}
                                            >
                                              <VideoCameraIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                              {de ? `Video-Archiv (${archiveVideos.length})` : `Video archive (${archiveVideos.length})`}
                                            </button>
                                          )}
                                          <span className="flex-1" />
                                          {/* MO-9/AX-13 — confirm chip exits on EASE_IN and takes focus on arm. */}
                                          <AnimatePresence mode="wait" initial={false}>
                                          {confirmingDeleteId === review.id ? (
                                            <motion.button
                                              key="delete-armed"
                                              ref={focusOnArm}
                                              initial={{ opacity: 0, scale: 0.92 }}
                                              animate={{ opacity: 1, scale: 1 }}
                                              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12, ease: EASE_IN } }}
                                              transition={springTactile}
                                              onClick={(e) => handleDeleteModule(e, review.id)}
                                              className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-[10px] bg-(--grade-fail-wash) text-(--grade-fail-text) text-xs font-semibold cursor-pointer"
                                            >
                                              <TrashIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                              {de ? "Wirklich löschen?" : "Really delete?"}
                                            </motion.button>
                                          ) : (
                                            <Tip key="delete-idle" label={de ? "Vorlesung löschen" : "Delete lecture"}>
                                            <button
                                              onClick={(e) => handleDeleteModule(e, review.id)}
                                              className="btn-ghost-icon w-8 h-8 flex items-center justify-center [@media(hover:hover)]:sm:opacity-0 [@media(hover:hover)]:sm:group-hover:opacity-100 focus-visible:opacity-100 sm:focus-visible:opacity-100 hover:!text-(--grade-fail-accent) cursor-pointer transition-opacity"
                                            >
                                              <TrashIcon className="w-4 h-4" strokeWidth={1.6} />
                                            </button>
                                            </Tip>
                                          )}
                                          </AnimatePresence>
                                        </div>

                                        <AnimatePresence initial={false}>
                                          {materialsOpen && (
                                            <motion.div
                                              key="materials"
                                              variants={accordion}
                                              initial="initial"
                                              animate="animate"
                                              exit="exit"
                                              style={{ overflow: "hidden" }}
                                            >
                                              <div className="flex flex-wrap gap-2 mt-2.5 pb-0.5">
                                                {review.raw.hasSource ? (
                                                  <a href={`/api/source/${review.id}`} target="_blank" rel="noopener noreferrer" className="chip">
                                                    <DocumentTextIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    {de ? "Vorlesungs-PDF" : "Lecture PDF"}
                                                  </a>
                                                ) : (
                                                  <span className="chip chip-dashed">{de ? "Kein Original" : "No source"}</span>
                                                )}
                                                {review.raw.prePodcastUrl && review.raw.prePodcastUrl.startsWith("http") ? (
                                                  <a href={review.raw.prePodcastUrl} target="_blank" rel="noopener noreferrer" className="chip">
                                                    <SpeakerWaveIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    {de ? "Audio · vorher" : "Audio · before"}
                                                  </a>
                                                ) : review.raw.prePodcastUrl ? (
                                                  <span className="chip chip-dashed">
                                                    <SpeakerWaveIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    {de ? "Audio · vorher — wird erstellt" : "Audio · before — generating"}
                                                  </span>
                                                ) : (
                                                  <span className="chip chip-dashed">
                                                    <SpeakerWaveIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    {de ? "Audio · vorher — keins" : "Audio · before — none"}
                                                  </span>
                                                )}
                                                {review.raw.postPodcastUrl && review.raw.postPodcastUrl.startsWith("http") ? (
                                                  <a href={review.raw.postPodcastUrl} target="_blank" rel="noopener noreferrer" className="chip">
                                                    <SpeakerWaveIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    {de ? "Audio · nachher" : "Audio · after"}
                                                  </a>
                                                ) : review.raw.postPodcastUrl ? (
                                                  <span className="chip chip-dashed">
                                                    <SpeakerWaveIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    {de ? "Audio · nachher — wird erstellt" : "Audio · after — generating"}
                                                  </span>
                                                ) : (
                                                  <span className="chip chip-dashed">
                                                    <SpeakerWaveIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    {de ? "Audio · nachher — keins" : "Audio · after — none"}
                                                  </span>
                                                )}
                                                {!isWaitingForNewVideo && latestVideoUrl && latestVideoUrl.startsWith("http") ? (
                                                  <a href={latestVideoUrl} target="_blank" rel="noopener noreferrer" className="chip">
                                                    <VideoCameraIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    Video
                                                  </a>
                                                ) : isWaitingForNewVideo ? (
                                                  <span className="chip chip-dashed">
                                                    <span className="ember-dot w-1 h-1 rounded-full bg-amber-500 shrink-0"></span>
                                                    {de ? "Video — wird erstellt" : "Video — rendering"}
                                                  </span>
                                                ) : (
                                                  <span className="chip chip-dashed">
                                                    <VideoCameraIcon className="w-[13px] h-[13px]" strokeWidth={1.6} />
                                                    {de ? "Video — nach Bewertung" : "Video — after grading"}
                                                  </span>
                                                )}
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </motion.div>
                            </div>
                          )}

                          {/* Upcoming */}
                          {!dashboardPending && scheduledItems.length > 0 && (
                            <div className="mt-10">
                              <div className="flex items-center justify-between mb-3.5">
                                <h2 className="text-base tracking-[-0.011em] text-ink-900 font-sans" style={{ fontWeight: 650 }}>{de ? "Demnächst" : "Upcoming"}</h2>
                                <button
                                  onClick={() => setShowCalendarModal(true)}
                                  className="inline-flex items-center gap-2 text-[13px] text-ink-600 hover:text-ink-900 transition-colors cursor-pointer"
                                  style={{ fontWeight: 550 }}
                                >
                                  <CalendarDaysIcon className="w-[15px] h-[15px]" strokeWidth={1.6} />
                                  {de ? "Mit Kalender synchronisieren" : "Sync to calendar"}
                                </button>
                              </div>
                              <div className="card-surface overflow-hidden">
                                {visibleScheduled.map((review, idx) => (
                                  <div key={review.id}>
                                    {idx > 0 && <div className="h-px bg-(--hairline) mx-5" />}
                                    {/* IA-15 — these look like read-only schedule rows but silently start a
                                        consequential early review (grading reschedules the interval shown). The
                                        aria-label names the action, and a trailing chevron + hover-revealed
                                        "Vorarbeiten" label make the affordance legible, matching the due cards. */}
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      aria-label={de ? `Jetzt vorarbeiten: ${review.topic}` : `Review ahead: ${review.topic}`}
                                      onKeyDown={(e) => {
                                        if (e.target !== e.currentTarget) return;
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          startQuiz(review);
                                        }
                                      }}
                                      onClick={() => startQuiz(review)}
                                      className="group grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 sm:gap-5 py-3.5 px-5 cursor-pointer hover:bg-(--paper-hover) transition-colors press-row"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-sm tracking-[-0.008em] text-ink-900 truncate" style={{ fontWeight: 550 }}>{review.topic}</div>
                                        <div className="text-xs text-ink-400 mt-0.5 truncate">{review.subject}</div>
                                      </div>
                                      {review.level >= LIB_LEVEL_SHORT.length ? (
                                        /* MC-8: mastered items show the library's Meister badge, not an uncapped level count */
                                        <MasteryBadge level={review.level} language={language} />
                                      ) : (
                                        <span className="text-xs text-ink-400 whitespace-nowrap">Level {review.level + 1}</span>
                                      )}
                                      <span className="text-[13px] text-ink-600 tnum w-[84px] text-right whitespace-nowrap" style={{ fontWeight: 550 }}>{fmtShort(new Date(review.raw.nextReviewDate))}</span>
                                      {/* Future lectures are deletable right here — before this, a single
                                          scheduled lecture could only be removed once it came due (or by
                                          deleting its whole module in the Library). Same two-step confirm
                                          and optimistic handler as the due cards. */}
                                      <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                        <AnimatePresence mode="wait" initial={false}>
                                        {confirmingDeleteId === review.id ? (
                                          <motion.button
                                            key="delete-armed"
                                            ref={focusOnArm}
                                            initial={{ opacity: 0, scale: 0.92 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12, ease: EASE_IN } }}
                                            transition={springTactile}
                                            onClick={(e) => handleDeleteModule(e, review.id)}
                                            className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-[10px] bg-(--grade-fail-wash) text-(--grade-fail-text) text-xs font-semibold cursor-pointer whitespace-nowrap"
                                          >
                                            <TrashIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                            {de ? "Wirklich löschen?" : "Really delete?"}
                                          </motion.button>
                                        ) : (
                                          <Tip key="delete-idle" label={de ? "Vorlesung löschen" : "Delete lecture"}>
                                          <button
                                            onClick={(e) => handleDeleteModule(e, review.id)}
                                            aria-label={de ? `Vorlesung löschen: ${review.topic}` : `Delete lecture: ${review.topic}`}
                                            className="btn-ghost-icon w-8 h-8 flex items-center justify-center [@media(hover:hover)]:sm:opacity-0 [@media(hover:hover)]:sm:group-hover:opacity-100 focus-visible:opacity-100 hover:!text-(--grade-fail-accent) cursor-pointer transition-opacity"
                                          >
                                            <TrashIcon className="w-4 h-4" strokeWidth={1.6} />
                                          </button>
                                          </Tip>
                                        )}
                                        </AnimatePresence>
                                      </span>
                                      <span className="flex items-center gap-1 text-ink-300 group-hover:text-ink-600 transition-colors">
                                        <span className="hidden sm:inline text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{de ? "Vorarbeiten" : "Review ahead"}</span>
                                        <ChevronRightIcon className="w-4 h-4 shrink-0" strokeWidth={2} />
                                      </span>
                                    </div>
                                  </div>
                                ))}
                                {scheduledItems.length > 6 && !showAllScheduled && (
                                  <button
                                    onClick={() => setShowAllScheduled(true)}
                                    className="w-full border-t border-(--hairline) flex items-center justify-center gap-2 py-3 text-[13px] text-ink-400 hover:text-ink-900 hover:bg-(--paper-hover) transition-colors cursor-pointer"
                                    style={{ fontWeight: 550 }}
                                  >
                                    <ChevronDownIcon className="w-[13px] h-[13px]" strokeWidth={2} />
                                    {de ? `Alle ${scheduledItems.length} anzeigen` : `Show all ${scheduledItems.length} upcoming`}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right rail — hidden on the empty state */}
                        {!isLoadingReviews && upcomingReviews.length > 0 && (
                          <div className="w-full xl:w-[288px] shrink-0 flex flex-col gap-4">
                            <div className="card-surface-elevated p-5">
                              <div className="w-[34px] h-[34px] rounded-[10px] bg-paper-2 flex items-center justify-center">
                                <CloudArrowUpIcon className="w-[18px] h-[18px] text-ink-600" strokeWidth={1.6} />
                              </div>
                              <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900 mt-3">{de ? "Material hinzufügen" : "Add material"}</div>
                              <p className="text-[13px] leading-relaxed text-ink-600 mt-1">
                                {de
                                  ? "Wirf eine Vorlesung hinein und ein Quiz-Set entsteht von selbst. Die erste Wiederholung kommt morgen."
                                  : "Drop in a lecture and a quiz set drafts itself. The first review lands tomorrow."}
                              </p>
                              <button
                                onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }}
                                className="mt-3.5 w-full h-[38px] rounded-xl border border-(--line) bg-transparent hover:bg-paper-2 text-ink-900 text-[13px] font-semibold cursor-pointer transition-colors"
                              >
                                {de ? "Vorlesung hochladen" : "Upload lecture"}
                              </button>
                            </div>

                            {passRate30 && passRate30.total > 0 && (
                              <div className="card-surface p-5">
                                <div className="caps-label">{de ? "Bestehensquote · 30 Tage" : "Pass rate · last 30 days"}</div>
                                <div className="font-display text-[34px] tracking-[-0.01em] text-ink-900 mt-2 leading-none tnum" style={{ fontWeight: 520 }}>
                                  {fmtPercent((passRate30.passed / passRate30.total) * 100, language)}
                                </div>
                                <div className="text-[13px] text-ink-600 mt-1.5">
                                  {de
                                    ? `${passRate30.passed} von ${passRate30.total} ${passRate30.total === 1 ? "Wiederholung" : "Wiederholungen"} bestanden`
                                    : `${passRate30.passed} of ${passRate30.total} ${passRate30.total === 1 ? "review" : "reviews"} passed`}
                                </div>
                                <div className="h-[3px] rounded-full bg-paper-2 mt-3.5 overflow-hidden">
                                  <div className="h-full rounded-full bg-(--grade-pass-accent)" style={{ width: `${Math.round((passRate30.passed / passRate30.total) * 100)}%` }}></div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    </>
                  );
                })()}
              </motion.div>
            )}

            {activeTab === "upload" && (
              <motion.div
                key="upload"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="max-w-3xl mx-auto"
              >
                <header className="mb-8 md:mb-10">
                  <p className="caps-label tracking-[0.14em] mb-3">{language === 'german' ? 'Neue Vorlesung' : 'New lecture'}</p>
                  <h1 className="font-display text-[34px] sm:text-[40px] tracking-[-0.02em] leading-[1.05] text-ink-900 mb-3" style={{ fontWeight: 470 }}>
                    {language === 'german' ? <>Aus einer Vorlesung wird ein <em className="italic">Quiz</em>.</> : <>Turn a lecture into a <em className="italic">quiz</em>.</>}
                  </h1>
                  <p className="text-ink-600 text-sm sm:text-[15px] leading-relaxed">{language === 'german' ? 'Lade dein Material hoch — Blueprint, Quiz und Tutor entstehen automatisch. Die erste Wiederholung kommt morgen.' : 'Upload your material — the blueprint, quiz and tutor draft themselves. The first review lands tomorrow.'}</p>
                </header>

                {isGenerating || generationDone ? (
                  <div className="card-surface-elevated px-8 py-12 md:py-14 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-[18px] bg-(--accent-wash-soft) border border-(--accent-border-soft) flex items-center justify-center mb-6">
                      {generationDone
                        ? <CheckIcon className="w-7 h-7 text-(--accent-text-strong)" strokeWidth={2} />
                        : <ArrowPathIcon className="w-7 h-7 text-(--accent-text-strong) animate-spin" strokeWidth={1.6} />}
                    </div>
                    <h3 className="font-display text-[26px] text-ink-900 mb-2" style={{ fontWeight: 470 }}>{generationDone ? (language === 'german' ? 'Deine Vorlesung ist fertig' : 'Your lecture is ready') : (language === 'german' ? 'Deine Vorlesung entsteht' : 'Building your lecture')}</h3>
                    <p className="text-ink-600 mb-9 text-sm">{progressMsg}</p>

                    <div className="progress-track w-full max-w-[460px] h-1 overflow-hidden">
                      <motion.div
                        className="progress-fill w-full"
                        style={{ transformOrigin: "left" }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.min(1, progressStep / 8) }}
                        transition={springSoft}
                      />
                    </div>
                    <div className="w-full max-w-[460px] mt-8 text-left space-y-3.5">
                      {[
                        // The REAL pipeline steps the backend emits (quiz-generator.ts),
                        // not the old fictional "Quiz Agent Level 1–5" labels. The app
                        // only generates Quiz 1 at upload; later levels are made one-by-one
                        // during grading. Step numbers match the backend's progress() calls.
                        { step: 1, label: language === "german" ? "Blueprint aus deinem Material" : "Blueprint from your material" },
                        { step: 2, label: language === "german" ? "Erstes Quiz geschrieben" : "First quiz written" },
                        { step: 3, label: language === "german" ? "Tutor-Brief & Audio-Skripte" : "Tutor brief & audio scripts" },
                        { step: 5, label: language === "german" ? "Notebook & Quellen einrichten" : "Notebook & source setup" },
                        { step: 6, label: language === "german" ? "In Drive gespeichert" : "Saved to Drive" },
                        { step: 7, label: language === "german" ? "Geplant — erste Wiederholung morgen" : "Scheduled — first review tomorrow" },
                      ].map(({ step, label }, i) => (
                        <motion.div
                          key={step}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.24, ease: EASE_OUT }}
                          className={`flex items-center gap-3.5 text-sm transition-colors duration-500 ${progressStep > step ? 'text-(--grade-pass-text)' : progressStep === step ? 'text-(--accent-text-strong) font-semibold' : 'text-ink-400'}`}
                        >
                          <AnimatePresence mode="wait">
                            {progressStep > step ? (
                              <motion.span key="done" {...STEP_NODE_MOTION} className="w-[22px] h-[22px] rounded-full bg-(--grade-pass-wash) shrink-0 flex items-center justify-center">
                                <CheckIcon className="w-3 h-3 text-(--grade-pass-accent)" strokeWidth={2.4} />
                              </motion.span>
                            ) : progressStep === step ? (
                              <motion.span key="active" {...STEP_NODE_MOTION} className="ember-dot w-[22px] h-[22px] rounded-full border-2 border-amber-500 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span></motion.span>
                            ) : (
                              <motion.div key="idle" {...STEP_NODE_MOTION} className="w-[22px] h-[22px] rounded-full border border-(--line) shrink-0" />
                            )}
                          </AnimatePresence>
                          <span>{label}</span>
                        </motion.div>
                      ))}
                    </div>
                    {/* IA-8 — explicit next-step fork replaces the 3s auto-navigate. "Next
                        lecture" keeps the module preselected (only topic/text/files clear) so
                        batch-uploading a day of lectures into one module is friction-free. */}
                    {generationDone && (
                      <div className="w-full max-w-[460px] mt-9 flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => {
                            setGenerationDone(false);
                            setIsGenerating(false);
                            setProgressStep(0);
                            setProgressMsg("");
                            setTextInput("");
                            setUploadedFiles([]);
                            // keep subjectInput (the module) for the next lecture
                          }}
                          className="btn-primary flex-1 h-12 text-sm flex items-center justify-center gap-2.5 cursor-pointer"
                        >
                          <CloudArrowUpIcon className="w-[18px] h-[18px]" strokeWidth={1.6} />
                          {language === "german" ? "Nächste Vorlesung hochladen" : "Upload next lecture"}
                        </button>
                        <button
                          onClick={() => {
                            setGenerationDone(false);
                            setIsGenerating(false);
                            setProgressStep(0);
                            setProgressMsg("");
                            setSubjectInput(modulePresets[0] ?? "");
                            setTextInput("");
                            setUploadedFiles([]);
                            setActiveTab("dashboard");
                          }}
                          className="btn-secondary flex-1 h-12 text-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {language === "german" ? "Zum Dashboard" : "Go to dashboard"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                  {/* EM-1 — persistent failure record: the 60s progress screen used to
                      snap back to the form with only a 5s toast as evidence. */}
                  {uploadError && (
                    <div className="mb-6 p-6 rounded-[18px] bg-(--grade-fail-wash) border border-(--grade-fail-border) text-sm flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-(--grade-fail-text) font-semibold">
                        <ExclamationTriangleIcon className="w-5 h-5" strokeWidth={1.6} />
                        <span>{language === "german" ? "Dein Modul wurde nicht erstellt." : "Your module wasn't created."}</span>
                      </div>
                      <pre tabIndex={0} role="region" aria-label={language === "german" ? "Fehlerdetails" : "Error details"} className="text-xs font-mono bg-paper-0 p-4 rounded-xl border border-(--hairline) whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto leading-relaxed text-left text-(--grade-fail-text)/80 custom-scrollbar">
                        {uploadError}
                      </pre>
                      <p className="text-xs text-ink-400 text-left leading-relaxed">
                        {language === "german"
                          ? "Deine Eingaben sind noch da — versuche es unten einfach erneut."
                          : "Your inputs are still here — just try submitting again below."}
                      </p>
                    </div>
                  )}
                  <div className="card-surface-elevated p-6 md:p-8 flex flex-col gap-7">
                    <div className="flex flex-col sm:flex-row gap-5">
                      <div className="flex-1 flex flex-col justify-end">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <label htmlFor="upload-module" className="caps-label leading-tight">{language === "german" ? `Modul (Semester ${currentSemester})` : `Module (Semester ${currentSemester})`}</label>
                          <button onClick={() => { setShowSettingsModal(true); }} className="text-xs text-(--accent-text) hover:text-(--accent-text-strong) transition-colors shrink-0 cursor-pointer" style={{ fontWeight: 550 }}>{language === "german" ? "Verwalten" : "Manage"}</button>
                        </div>
                        {modulePresets.length > 0 ? (
                          <select
                            id="upload-module"
                            value={subjectInput}
                            onChange={e => setSubjectInput(e.target.value)}
                            className="input-dark w-full h-12 pl-4 pr-10 appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M5%208l5%205%205-5%22%20stroke%3D%22%23A89D8B%22%20stroke-width%3D%222%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:right_1rem_center]"
                          >
                            {modulePresets.map(preset => (
                              <option key={preset} value={preset}>{preset}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="input-dark w-full px-4 py-3.5 text-ink-600 text-sm flex items-center justify-between gap-2">
                            {language === "german" ? `Keine Module für Semester ${currentSemester} definiert` : `No modules defined for Semester ${currentSemester}`}
                            <button onClick={() => { setShowSettingsModal(true); }} className="text-(--accent-text-strong) font-medium cursor-pointer shrink-0">{language === "german" ? "Hinzufügen" : "Add preset"}</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="upload-material" className="caps-label block mb-2.5">{language === "german" ? "Vorlesungsmaterial (Dateien oder Text)" : "Lecture material (files or text)"}</label>
                      <div
                        className={`w-full border-[1.5px] border-dashed rounded-[18px] p-6 md:p-10 mb-4 flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-(--accent-border-strong) bg-(--accent-wash-softer)' : 'border-[color-mix(in_srgb,var(--foreground)_16%,transparent)] bg-(--paper-hover)'}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={(e) => {
                          // dragleave also fires when moving onto the zone's own
                          // children — ignore those so the highlight doesn't flicker.
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            addUploadFiles(Array.from(e.dataTransfer.files));
                          }
                        }}
                      >
                        <div className="w-12 h-12 rounded-xl bg-(--accent-wash-softer) border border-(--accent-border-soft) flex items-center justify-center mb-4">
                          <CloudArrowUpIcon className="w-6 h-6 text-(--accent-text-strong)" />
                        </div>
                        <p className="text-ink-900 text-[15px] font-semibold text-center leading-snug">
                          {language === "german" ? "Zieh dein PDF, deine Folien oder Notizen hierher" : "Drop your PDF, slides, or notes here"}
                        </p>
                        <p className="text-ink-400 text-[13px] text-center mt-1.5 mb-4">
                          {language === "german" ? "PDF, DOCX, XLSX, CSV oder TXT · oder füge unten Text ein" : "PDF, DOCX, XLSX, CSV or TXT · or paste text below"}
                        </p>
                        {/* IS-6 — sr-only (not display:none) keeps the file input in the tab
                            order; the peer class drives the Browse label's focus ring. */}
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.xlsx,.csv,.docx,.txt"
                          className="sr-only peer"
                          id="file-upload"
                          onChange={(e) => {
                            // Snapshot the files BEFORE resetting value: React's state updater
                            // runs asynchronously, and `e.target.value = ""` synchronously clears
                            // e.target.files — so reading it inside the updater dropped the pick.
                            const picked = e.target.files ? Array.from(e.target.files) : [];
                            e.target.value = ""; // reset so re-picking the same file still fires onChange
                            if (picked.length > 0) {
                              addUploadFiles(picked);
                            }
                          }}
                        />
                        <label htmlFor="file-upload" className="btn-secondary px-4 py-2 text-sm cursor-pointer peer-focus-visible:border-(--accent-border-strong) peer-focus-visible:shadow-[0_0_0_3px_var(--accent-ring)]">
                          {language === "german" ? "Dateien durchsuchen" : "Browse files"}
                        </label>
                      </div>

                      {uploadedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {/* MO-15: chips pop in / out and survivors glide into place via layout */}
                          <AnimatePresence mode="popLayout">
                          {uploadedFiles.map((file, idx) => (
                            /* addUploadFiles dedupes by name, so file.name is a stable key */
                            <motion.div
                              key={file.name}
                              layout
                              initial={{ opacity: 0, scale: 0.92 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
                              transition={springTactile}
                              className="flex items-center gap-2 bg-(--accent-wash-soft) text-(--accent-text-strong) h-[30px] px-3 rounded-[10px] text-xs border border-(--accent-border-soft)"
                              style={{ fontWeight: 550 }}
                            >
                              <DocumentTextIcon className="w-4 h-4 text-(--accent-text-strong)" />
                              {file.name}
                              <Tip label={language === "german" ? "Datei entfernen" : "Remove file"}>
                                <button
                                  onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                                  aria-label={language === "german" ? `${file.name} entfernen` : `Remove ${file.name}`}
                                  className="ml-0.5 -mr-1.5 w-7 h-7 flex items-center justify-center rounded-full text-(--accent-text-strong)/60 hover:text-ink-900 cursor-pointer"
                                >
                                  <XMarkIcon className="w-4 h-4" />
                                </button>
                              </Tip>
                            </motion.div>
                          ))}
                          </AnimatePresence>
                        </div>
                      )}

                      <textarea
                        id="upload-material"
                        value={textInput}
                        onChange={e => setTextInput(e.target.value)}
                        placeholder={language === "german" ? "Oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein…" : "Or paste your lecture notes, transcript, or raw text here…"}
                        className="input-dark w-full px-4 py-3.5 h-[120px] resize-none text-base sm:text-sm leading-relaxed"
                      />
                    </div>
                    <div>
                      <button
                        onClick={handleGenerate}
                        disabled={isGenerating || (!textInput.trim() && uploadedFiles.length === 0) || !subjectInput.trim()}
                        className="btn-primary w-full h-14 sm:h-[52px] text-[15px] sm:text-sm flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                      >
                        <SparklesIcon className="w-[18px] h-[18px]" strokeWidth={1.6} />
                        {language === "german" ? "Erstelle mein Quiz-Set" : "Generate my quiz set"}
                      </button>
                      <p className="text-[13px] text-ink-400 text-center mt-4">
                        {language === "german"
                          ? "Sechs Schritte laufen automatisch — Blueprint, erstes Quiz, Tutor-Brief, Audio und Terminierung. Dauert etwa eine Minute."
                          : "Six steps run automatically — blueprint, first quiz, tutor brief, audio, and scheduling. Takes about a minute."}
                      </p>
                    </div>
                  </div>
                  </>
                )}
              </motion.div>
            )}

            {activeTab === "library" && (
              <motion.div
                key="library"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="max-w-5xl mx-auto"
              >
                {/* ── Library header ─────────────────────────────────────── */}
                <header className="mb-8 md:mb-10">
                  <p className="caps-label tracking-[0.14em] mb-3">{language === "german" ? "Archiv" : "Archive"}</p>
                  <h1 className="font-display text-[34px] sm:text-[40px] tracking-[-0.02em] leading-[1.05] text-ink-900 mb-3" style={{ fontWeight: 470 }}>
                    {language === "german" ? "Deine Bibliothek" : "Your library"}
                  </h1>
                  <p className="text-ink-600 text-sm sm:text-[15px]">
                    {language === "german"
                      ? "Alle Vorlesungen, Quizze und Lernmaterialien — nach Semester und Modul sortiert."
                      : "All lectures, quizzes, and study materials — sorted by semester and module."}
                  </p>
                </header>

                {/* ── Search ──────────────────────────────────────────────── */}
                {rawItems.length > 0 && (
                  <div className="relative mb-6">
                    <MagnifyingGlassIcon className="w-4 h-4 text-ink-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={librarySearchRef}
                      type="text"
                      value={librarySearch}
                      onChange={e => {
                        setLibrarySearch(e.target.value);
                        // Search force-expands every group — edit mode makes no sense there.
                        if (e.target.value.trim()) { setLibraryEditing(false); setConfirmingDeleteModuleKey(null); }
                      }}
                      placeholder={language === "german" ? "Modul oder Vorlesung suchen…" : "Search module or lecture…"}
                      aria-label={language === "german" ? "Modul oder Vorlesung suchen" : "Search module or lecture"}
                      className="input-dark w-full h-12 pl-11 pr-10 text-base sm:text-sm"
                    />
                    {!librarySearching && (
                      <span className="kbd absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex pointer-events-none">⌘K</span>
                    )}
                    {librarySearching && (
                      <Tip label={language === "german" ? "Suche löschen" : "Clear search"}>
                        <button
                          onClick={() => setLibrarySearch("")}
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-900 hover:bg-paper-2 transition-colors cursor-pointer"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </Tip>
                    )}
                  </div>
                )}

                {/* ── Controls: Edit mode + Collapse/Expand all (design 9a).
                    Hidden while searching — search force-expands every group. ── */}
                {rawItems.length > 0 && !librarySearching && (
                  <div className="flex items-center justify-end gap-1.5 mb-4 -mt-1">
                    <button
                      onClick={() => { setLibraryEditing(v => !v); setConfirmingDeleteModuleKey(null); }}
                      className={`text-[13px] font-semibold px-2.5 py-1.5 rounded-[10px] transition-colors cursor-pointer press-row ${libraryEditing ? "text-ink-900 bg-paper-2" : "text-ink-600 hover:text-ink-900"}`}
                    >
                      {libraryEditing
                        ? (language === "german" ? "Fertig" : "Done")
                        : (language === "german" ? "Bearbeiten" : "Edit")}
                    </button>
                    <button
                      onClick={toggleAllLibrary}
                      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-(--accent-text) hover:text-(--accent-text-strong) px-2.5 py-1.5 rounded-[10px] transition-colors cursor-pointer press-row"
                    >
                      <motion.span animate={{ rotate: anyLibraryOpen ? 0 : 180 }} transition={springTactile} className="inline-flex">
                        <ChevronUpIcon className="w-[13px] h-[13px]" strokeWidth={2.2} />
                      </motion.span>
                      {anyLibraryOpen
                        ? (language === "german" ? "Alle einklappen" : "Collapse all")
                        : (language === "german" ? "Alle ausklappen" : "Expand all")}
                    </button>
                  </div>
                )}

                {/* ── No search results ───────────────────────────────────── */}
                {librarySearching && libraryBySemester.size === 0 && rawItems.length > 0 && (
                  <div className="card-surface p-12 md:p-16 flex flex-col items-center text-center">
                    <div className="w-[52px] h-[52px] rounded-[14px] bg-paper-2 flex items-center justify-center mb-6">
                      <MagnifyingGlassIcon className="w-6 h-6 text-ink-400" strokeWidth={1.6} />
                    </div>
                    <p className="text-ink-600 text-sm">
                      {language === "german" ? <>Keine Treffer für „{librarySearch.trim()}“.</> : <>No results for “{librarySearch.trim()}”.</>}
                    </p>
                  </div>
                )}

                {/* ── Fetch-error state (distinct from empty) ─────────────── */}
                {rawItems.length === 0 && !isLoadingReviews && reviewsError && (
                  <div className="card-surface p-12 md:p-16 flex flex-col items-center text-center">
                    <div className="w-[52px] h-[52px] rounded-[14px] bg-paper-2 flex items-center justify-center mb-6">
                      <BookOpenIcon className="w-6 h-6 text-ink-400" strokeWidth={1.6} />
                    </div>
                    <h2 className="font-display text-[22px] text-ink-900 mb-2.5" style={{ fontWeight: 480 }}>
                      {language === "german" ? "Konnte nicht geladen werden" : "Couldn't load your library"}
                    </h2>
                    <p className="text-ink-600 text-sm leading-relaxed max-w-sm">
                      {language === "german"
                        ? "Beim Laden ist etwas schiefgelaufen. Prüfe deine Verbindung und versuche es erneut."
                        : "Something went wrong loading your data. Check your connection and try again."}
                    </p>
                    <button
                      onClick={() => { setIsLoadingReviews(true); fetchReviews(); }}
                      className="btn-primary h-11 px-6 text-sm mt-7 cursor-pointer"
                    >
                      {language === "german" ? "Erneut versuchen" : "Try again"}
                    </button>
                  </div>
                )}

                {/* ── Empty state ─────────────────────────────────────────── */}
                {rawItems.length === 0 && !isLoadingReviews && !reviewsError && (
                  <div className="card-surface p-12 md:p-16 flex flex-col items-center text-center">
                    <div className="w-[52px] h-[52px] rounded-[14px] bg-paper-2 flex items-center justify-center mb-6">
                      <BookOpenIcon className="w-6 h-6 text-ink-400" strokeWidth={1.6} />
                    </div>
                    <h2 className="font-display text-[22px] text-ink-900 mb-2.5" style={{ fontWeight: 480 }}>
                      {language === "german" ? "Noch nichts hier" : "Nothing here yet"}
                    </h2>
                    <p className="text-ink-600 text-sm leading-relaxed max-w-sm">
                      {language === "german"
                        ? "Aus deiner ersten Vorlesung wird in etwa einer Minute ein Quiz — und alles, was du erstellst, lebt hier."
                        : "Your first lecture becomes a quiz in about a minute — and everything you make lives here."}
                    </p>
                    <button
                      onClick={() => setActiveTab("upload")}
                      className="btn-primary h-11 px-6 text-sm mt-7 cursor-pointer"
                    >
                      {language === "german" ? "Lade deine erste Vorlesung hoch" : "Upload your first lecture"}
                    </button>
                  </div>
                )}

                {/* ── Semester accordion list ─────────────────────────────── */}
                {Array.from(libraryBySemester.entries()).map(([sem, modules]) => {
                  // During a search every group is force-expanded so matches are visible.
                  const semOpen = librarySearching || expandedLibrarySemesters.has(sem);
                  const totalLectures = Array.from(modules.values()).reduce((n, arr) => n + arr.length, 0);
                  const isCurrentSemester = sem === currentSemester;

                  return (
                    <div key={sem} className="mb-5">
                      {/* Semester header row */}
                      <button
                        onClick={() => setExpandedLibrarySemesters(prev => {
                          const next = new Set(prev);
                          if (next.has(sem)) next.delete(sem); else next.add(sem);
                          return next;
                        })}
                        aria-expanded={semOpen}
                        className="w-full flex items-center gap-3 py-2 group cursor-pointer press-row"
                      >
                        <motion.div animate={{ rotate: semOpen ? 90 : 0 }} transition={springTactile}>
                          <ChevronRightIcon className={`w-4 h-4 transition-colors shrink-0 ${semOpen ? "text-(--accent-text)" : "text-ink-300 group-hover:text-ink-600"}`} strokeWidth={2} />
                        </motion.div>
                        <span className="caps-label group-hover:text-ink-600 transition-colors whitespace-nowrap">
                          {language === "german" ? "Semester" : "Semester"}
                        </span>
                        <span className="font-display text-2xl font-medium leading-none text-ink-900 group-hover:text-(--accent-text-strong) transition-all">
                          {sem}
                        </span>
                        {isCurrentSemester && (
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-(--accent-wash-soft) border border-(--accent-border-soft) text-(--accent-text-strong)">
                            {language === "german" ? "Aktiv" : "Active"}
                          </span>
                        )}
                        <div className="flex-1 h-px bg-(--hairline) mx-1" />
                        <span className="text-[11px] text-ink-400 font-medium tnum whitespace-nowrap">
                          {modules.size} {language === "german" ? (modules.size === 1 ? "Modul" : "Module") : (modules.size === 1 ? "module" : "modules")} · {totalLectures} {language === "german" ? (totalLectures === 1 ? "Vorlesung" : "Vorlesungen") : (totalLectures === 1 ? "lecture" : "lectures")}
                        </span>
                      </button>

                      {/* Semester body */}
                      <AnimatePresence initial={false}>
                        {semOpen && (
                          <motion.div
                            key="sem-body"
                            variants={accordion}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            style={{ overflow: "hidden" }}
                          >
                            <div className="pt-2 space-y-2 pb-2">
                              {Array.from(modules.entries()).map(([moduleName, lectures]) => {
                                const modKey = `${sem}__${moduleName}`;
                                const modOpen = librarySearching || expandedLibraryModules.has(modKey);
                                const dueCount = lectures.reduce((n, l) => n + (isDueLocal(new Date(l.nextReviewDate), new Date()) ? 1 : 0), 0);

                                return (
                                  <div key={modKey} className="card-surface overflow-hidden">
                                    {/* Module header — AX-4: the expand/collapse toggle and the
                                        edit-mode delete control are SIBLING <button>s (no more
                                        role="button" spans nested inside a button). */}
                                    <div className="w-full flex items-center group press-row">
                                    <button
                                      onClick={() => setExpandedLibraryModules(prev => {
                                        const next = new Set(prev);
                                        if (next.has(modKey)) next.delete(modKey); else next.add(modKey);
                                        return next;
                                      })}
                                      aria-expanded={modOpen}
                                      className={`flex-1 min-w-0 flex items-center gap-3 pl-5 py-4 cursor-pointer text-left ${libraryEditing ? "pr-3" : "pr-5"}`}
                                    >
                                      <motion.div animate={{ rotate: modOpen ? 90 : 0 }} transition={springTactile}>
                                        <ChevronRightIcon className="w-3.5 h-3.5 text-ink-300 group-hover:text-ink-600 transition-colors shrink-0" />
                                      </motion.div>
                                      <FolderOpenIcon className="w-4 h-4 text-(--icon-folder) shrink-0" strokeWidth={1.6} />
                                      <span className="text-[15px] font-semibold text-ink-900 transition-colors flex-1 text-left truncate">
                                        {moduleName}
                                      </span>
                                      {/* Due pill — only while collapsed & not editing (design 9a).
                                          Below sm the pill collapses to a bare amber dot (round-1 open item: mobile due signal). */}
                                      {!modOpen && !libraryEditing && dueCount > 0 && (
                                        <>
                                          <span className="sm:hidden w-[7px] h-[7px] rounded-full bg-amber-500 shrink-0">
                                            <span className="sr-only">{dueCount} {language === "german" ? "fällig" : "due"}</span>
                                          </span>
                                          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full badge-due shrink-0">
                                            <span className="w-[5px] h-[5px] rounded-full bg-amber-500" />
                                            {dueCount} {language === "german" ? "fällig" : "due"}
                                          </span>
                                        </>
                                      )}
                                      {/* Meta (rating + count) hides in edit mode so the row reads as "removable" */}
                                      {!libraryEditing && (
                                        <>
                                          {/* Knowledge rating: Ø of the rated lectures' comprehension %; nothing until the first check */}
                                          {(() => {
                                            const rated = lectures.filter((l) => typeof l.comprehensionScore === "number");
                                            if (rated.length === 0) return null;
                                            const avg = Math.round(rated.reduce((s, l) => s + (l.comprehensionScore as number), 0) / rated.length);
                                            return (
                                              <Tip label={language === "german"
                                                ? `Wissens-Rating: Ø Verständnis aus ${rated.length} von ${lectures.length} Vorlesungen`
                                                : `Knowledge rating: avg comprehension of ${rated.length} of ${lectures.length} lectures`}>
                                                <span className="text-[11px] font-semibold text-ink-400 tnum shrink-0">Ø {fmtPercent(avg, language)}</span>
                                              </Tip>
                                            );
                                          })()}
                                          <span className="text-[11px] text-ink-400 font-medium tnum shrink-0">
                                            {lectures.length} {language === "german" ? (lectures.length === 1 ? "Vorlesung" : "Vorlesungen") : (lectures.length === 1 ? "lecture" : "lectures")}
                                          </span>
                                        </>
                                      )}
                                    </button>
                                    {/* Edit mode: circular remove → two-step confirm (the delete
                                        itself is optimistic — the row leaves on click).
                                        Real buttons, keyboard-reachable (AX-4). */}
                                    {libraryEditing && (
                                      <div className="pr-5 shrink-0 flex items-center">
                                        {confirmingDeleteModuleKey === modKey ? (
                                          <button
                                            type="button"
                                            onClick={(e) => handleDeleteLibraryModule(e, modKey, lectures)}
                                            className="inline-flex items-center h-[30px] px-3 rounded-full bg-(--grade-fail-wash) text-(--grade-fail-text) border border-(--grade-fail-border) text-xs font-semibold cursor-pointer shrink-0"
                                          >
                                            {language === "german"
                                              ? `${lectures.length} ${lectures.length === 1 ? "Vorlesung" : "Vorlesungen"} löschen?`
                                              : `Delete ${lectures.length} ${lectures.length === 1 ? "lecture" : "lectures"}?`}
                                          </button>
                                        ) : (
                                          <Tip label={language === "german" ? "Modul entfernen" : "Remove module"}>
                                            <button
                                              type="button"
                                              aria-label={language === "german" ? "Modul entfernen" : "Remove module"}
                                              onClick={(e) => handleDeleteLibraryModule(e, modKey, lectures)}
                                              className="w-[30px] h-[30px] rounded-full flex items-center justify-center bg-(--grade-fail-wash) hover:bg-(--grade-fail-border) text-(--grade-fail-text) transition-all cursor-pointer shrink-0 active:scale-90"
                                            >
                                              <MinusIcon className="w-[15px] h-[15px]" strokeWidth={2.2} />
                                            </button>
                                          </Tip>
                                        )}
                                      </div>
                                    )}
                                    </div>

                                    {/* Lecture rows */}
                                    <AnimatePresence initial={false}>
                                      {modOpen && (
                                        <motion.div
                                          key="mod-body"
                                          variants={accordion}
                                          initial="initial"
                                          animate="animate"
                                          exit="exit"
                                          style={{ overflow: "hidden" }}
                                        >
                                          <div className="border-t border-(--hairline-card)">
                                            {lectures.map((item, idx) => {
                                              const itemOpen = expandedLibraryItems.has(item.id);
                                              const isDue = isDueLocal(new Date(item.nextReviewDate), new Date());
                                              const hasStudyMaterials = !!(item.tutorPromptDocId || item.prePodcastPrompt || item.postPodcastPrompt || item.lastVideoPrompt1 || item.lastVideoPrompt2 || item.prePodcastUrl || item.postPodcastUrl);

                                              return (
                                                <div key={item.id} className={`${idx > 0 ? "border-t border-(--hairline-card)" : ""}`}>
                                                  {/* Collapsed lecture row */}
                                                  <button
                                                    onClick={() => setExpandedLibraryItems(prev => {
                                                      const next = new Set(prev);
                                                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                                      return next;
                                                    })}
                                                    aria-expanded={itemOpen}
                                                    className="w-full flex items-center gap-3 px-5 py-3.5 group cursor-pointer hover:bg-paper-0 transition-colors press-row"
                                                  >
                                                    <DocumentTextIcon className="w-3.5 h-3.5 text-ink-300 shrink-0 group-hover:text-ink-600 transition-colors" />
                                                    <Tip label={item.subjectSub}>
                                                      <span className="text-sm text-ink-900/80 group-hover:text-ink-900 transition-colors flex-1 text-left leading-snug">
                                                        {item.subjectSub}
                                                      </span>
                                                    </Tip>
                                                    {/* Verständnis-Rating — green/red by the last check's PASS/REPEAT */}
                                                    {typeof item.comprehensionScore === "number" && (
                                                      <Tip label={language === "german"
                                                        ? `Verständnis-Check: ${fmtPercent(item.comprehensionScore, language)} (${item.comprehensionPassed ? "bestanden" : "wiederholen"})`
                                                        : `Comprehension check: ${fmtPercent(item.comprehensionScore, language)} (${item.comprehensionPassed ? "passed" : "repeat"})`}>
                                                        <span className={`hidden sm:inline text-[11px] font-semibold tnum shrink-0 ${item.comprehensionPassed ? "text-(--grade-pass-text)" : "text-(--grade-fail-text)"}`}>
                                                          {fmtPercent(item.comprehensionScore, language)}
                                                        </span>
                                                      </Tip>
                                                    )}
                                                    {isDue && (
                                                      <>
                                                        {/* Below sm the badge collapses to a bare amber dot (round-1 open item: mobile due signal) */}
                                                        <span className="sm:hidden w-[7px] h-[7px] rounded-full bg-amber-500 shrink-0">
                                                          <span className="sr-only">{language === "german" ? "Fällig" : "Due"}</span>
                                                        </span>
                                                        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full badge-due shrink-0">
                                                          {language === "german" ? "Fällig" : "Due"}
                                                        </span>
                                                      </>
                                                    )}
                                                    {/* IA-9: the collapsed row keeps ONE level encoding — the compact
                                                        "L4" text. The 7-dot strip (a second encoding of the same value,
                                                        and hardcoded amber that diluted the "amber = due" signal next to
                                                        the Due badge) is reserved for the expanded interval stepper. */}
                                                    <span className="text-xs text-ink-400 font-medium tnum shrink-0 w-8 text-right">
                                                      L{item.currentLevel + 1}
                                                    </span>
                                                    {/* Attempt marker: ×2 = second try at the current level (after 1 fail) */}
                                                    {(() => {
                                                      const fails = item.failCounts?.[Math.min(item.currentLevel, 6)] ?? 0;
                                                      if (fails <= 0) return null;
                                                      return (
                                                        <Tip label={language === "german" ? `${fails + 1}. Versuch auf diesem Level` : `Attempt ${fails + 1} at this level`}>
                                                          <span className="text-[10px] font-semibold text-(--grade-fail-text) tnum shrink-0">×{fails + 1}</span>
                                                        </Tip>
                                                      );
                                                    })()}
                                                    <motion.div animate={{ rotate: itemOpen ? 180 : 0 }} transition={springTactile}>
                                                      <ChevronDownIcon className="w-3.5 h-3.5 text-ink-300 group-hover:text-ink-600 transition-colors shrink-0" />
                                                    </motion.div>
                                                  </button>

                                                  {/* Expanded lecture detail */}
                                                  <AnimatePresence initial={false}>
                                                    {itemOpen && (
                                                      <motion.div
                                                        key="item-body"
                                                        variants={accordion}
                                                        initial="initial"
                                                        animate="animate"
                                                        exit="exit"
                                                        style={{ overflow: "hidden" }}
                                                      >
                                                        <div className="px-5 pb-5 pt-1 bg-(--paper-hover) space-y-5">

                                                          {/* Progress — one unified level timeline (passed / current / mastery) with per-level repeat markers. Replaces the old duplicate "Level progress" + "Quiz generation" pair, incl. the misleading "N of 7 generated" counter that read empty quiz-URL columns. */}
                                                          {(() => {
                                                            const LEVELS = LIB_LEVEL_SHORT.length; // 7 SRS intervals T1…T365
                                                            const inMastery = item.currentLevel >= LEVELS; // all 7 cleared; now looping T365 (currentLevel is an uncapped mastery counter)
                                                            const totalRepeats = (item.failCounts ?? []).reduce((a, b) => a + (b || 0), 0);
                                                            return (
                                                              <div>
                                                                <div className="flex items-center justify-between mb-3">
                                                                  <p className="caps-label">
                                                                    {language === "german" ? "Fortschritt" : "Progress"}
                                                                  </p>
                                                                  {inMastery ? (
                                                                    /* MC-8: single source of truth — the same badge the due cards and quiz header reuse */
                                                                    <MasteryBadge level={item.currentLevel} language={language} />
                                                                  ) : (
                                                                    <span className="text-[10px] font-semibold text-ink-400 tnum">
                                                                      {language === "german" ? `Level ${item.currentLevel + 1} von 7` : `Level ${item.currentLevel + 1} of 7`}
                                                                    </span>
                                                                  )}
                                                                </div>

                                                                {/* Interval stepper: the 7 SRS intervals as nodes; the connecting track fills up to the level reached. */}
                                                                <div className="flex items-start">
                                                                  {LIB_LEVEL_SHORT.map((label, l) => {
                                                                    const passed = l < item.currentLevel;
                                                                    const current = l === item.currentLevel;
                                                                    const reached = l <= item.currentLevel;
                                                                    const fails = item.failCounts?.[l] ?? 0;
                                                                    const status = passed
                                                                      ? (language === "german" ? "Bestanden" : "Passed")
                                                                      : current
                                                                        ? (language === "german" ? "Aktuell" : "Current")
                                                                        : (language === "german" ? "Ausstehend" : "Locked");
                                                                    return (
                                                                      <Fragment key={l}>
                                                                        {l > 0 && (
                                                                          <div className={`flex-1 h-[2px] mt-2 rounded-full transition-colors ${reached ? "bg-amber-500" : "bg-(--hairline-card)"}`} />
                                                                        )}
                                                                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                                                                          <Tip label={`${label} (${libLevelFull(l, language)}): ${status}`}>
                                                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                                                                              passed
                                                                                ? "bg-amber-500"
                                                                                : current
                                                                                  ? "bg-(--paper-hover) border-2 border-amber-500 shadow-[0_0_8px_color-mix(in_srgb,var(--a-g2)_35%,transparent)]"
                                                                                  : "bg-(--paper-hover) border-2 border-(--hairline-card)"
                                                                            }`}>
                                                                              {passed && <CheckIcon className="w-3 h-3 text-(--accent-on)" strokeWidth={2.6} />}
                                                                              {current && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                                                            </div>
                                                                          </Tip>
                                                                          <span className={`w-7 text-center text-[9px] leading-none ${current ? "text-(--accent-text-strong) font-semibold" : passed ? "text-ink-600 font-medium" : "text-ink-300 font-medium"}`}>
                                                                            {label}
                                                                          </span>
                                                                          {fails > 0 ? (
                                                                            <Tip label={language === "german" ? `${fails}× auf diesem Level wiederholt` : `Repeated ${fails}× at this level`}>
                                                                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-(--grade-fail-text) tnum leading-none">
                                                                                <ArrowPathIcon className="w-2 h-2" strokeWidth={2.4} />{fails}
                                                                              </span>
                                                                            </Tip>
                                                                          ) : (
                                                                            <span className="h-2" aria-hidden="true" />
                                                                          )}
                                                                        </div>
                                                                      </Fragment>
                                                                    );
                                                                  })}
                                                                </div>

                                                                {/* Honest footnote — replaces the old, often-wrong "N of 7 quizzes generated" line. */}
                                                                <p className="text-[10px] text-ink-400 mt-3">
                                                                  {totalRepeats > 0
                                                                    ? (language === "german"
                                                                        ? `${totalRepeats} Wiederholung${totalRepeats === 1 ? "" : "en"} insgesamt${inMastery ? " · in der Meister-Schleife" : ""}`
                                                                        : `${totalRepeats} repeat${totalRepeats === 1 ? "" : "s"} total${inMastery ? " · now in the mastery loop" : ""}`)
                                                                    : inMastery
                                                                      ? (language === "german" ? "Alle Level ohne Wiederholung gemeistert." : "All levels mastered — no repeats.")
                                                                      : (language === "german" ? "Noch keine Wiederholung." : "No repeats yet.")}
                                                                </p>
                                                              </div>
                                                            );
                                                          })()}
                                                          {/* Verständnis-Check — on-demand weak-spot quiz; never touches the SRS schedule */}
                                                          <div>
                                                            <p className="caps-label mb-2">
                                                              {language === "german" ? "Verständnis-Check" : "Comprehension check"}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                              <button
                                                                onClick={(e) => { e.stopPropagation(); generateComprehension(item); }}
                                                                disabled={!!compGen}
                                                                className="chip chip-amber !cursor-pointer disabled:!cursor-wait disabled:opacity-60"
                                                              >
                                                                {/* IS-8 — the chip label stays fixed while loading (spinner swaps
                                                                    in for the icon); the streaming progress shows on a quiet line
                                                                    below so the button never resizes per NDJSON tick. */}
                                                                {compGen?.itemId === item.id ? (
                                                                  <>
                                                                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" strokeWidth={1.6} />
                                                                    {language === "german" ? "Startet…" : "Starting…"}
                                                                  </>
                                                                ) : (
                                                                  <>
                                                                    <SparklesIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                    {typeof item.comprehensionScore === "number"
                                                                      ? (language === "german" ? "Neuen Check starten" : "Start new check")
                                                                      : (language === "german" ? "Check starten" : "Start check")}
                                                                  </>
                                                                )}
                                                              </button>
                                                              {typeof item.comprehensionScore === "number" && (
                                                                <button
                                                                  onClick={(e) => { e.stopPropagation(); setCompFeedback(item); }}
                                                                  className="flex items-center gap-2.5 bg-paper-0 hover:bg-(--paper-hover) rounded-xl border border-(--hairline-card) px-3 py-1.5 transition-colors cursor-pointer group/cf"
                                                                >
                                                                  <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border shrink-0 ${item.comprehensionPassed ? "bg-(--grade-pass-wash) text-(--grade-pass-text) border-(--grade-pass-border)" : "bg-(--grade-fail-wash) text-(--grade-fail-text) border-(--grade-fail-border)"}`}>
                                                                    {item.comprehensionPassed ? (language === "german" ? "Bestanden" : "Passed") : (language === "german" ? "Wiederholen" : "Repeat")}
                                                                  </span>
                                                                  <span className={`text-xs font-semibold tnum shrink-0 ${item.comprehensionPassed ? "text-(--grade-pass-text)" : "text-(--grade-fail-text)"}`}>
                                                                    {fmtPercent(item.comprehensionScore, language)}
                                                                  </span>
                                                                  {item.comprehensionAt && (
                                                                    <span className="text-[11px] text-ink-400 tnum shrink-0">{new Date(item.comprehensionAt).toLocaleDateString(language === "german" ? "de-DE" : "en-GB")}</span>
                                                                  )}
                                                                  <ChevronRightIcon className="w-3.5 h-3.5 text-ink-300 group-hover/cf:text-ink-600 transition-colors shrink-0" strokeWidth={2} />
                                                                </button>
                                                              )}
                                                            </div>
                                                            {compGen?.itemId === item.id && compGen.message && (
                                                              <p className="text-[11px] text-ink-400 mt-2 leading-snug" aria-live="polite">{compGen.message}</p>
                                                            )}
                                                            <p className="text-[10px] text-ink-400 mt-2">
                                                              {language === "german"
                                                                ? "Misst dein tatsächliches Verständnis anhand deiner bisherigen Bewertungen — Zeitplan und Level bleiben unberührt. Jeder Lauf überschreibt das letzte Ergebnis."
                                                                : "Measures your actual understanding from your assessment history — schedule and levels stay untouched. Each run overwrites the last result."}
                                                            </p>
                                                          </div>

                                                          {/* Study materials */}
                                                          {hasStudyMaterials && (
                                                            <div>
                                                              <p className="caps-label mb-2">
                                                                {language === "german" ? "Lernmaterialien" : "Study Materials"}
                                                              </p>
                                                              <div className="flex flex-wrap gap-2">
                                                                {item.hasSource ? (
                                                                  <a
                                                                    href={`/api/source/${item.id}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="chip chip-amber"
                                                                  >
                                                                    <DocumentTextIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                    {language === "german" ? "Original-PDF" : "Original PDF"}
                                                                  </a>
                                                                ) : (
                                                                  <div className="chip chip-dashed">
                                                                    <DocumentTextIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                    {language === "german" ? "Keine PDF" : "No PDF"}
                                                                  </div>
                                                                )}
                                                                {item.tutorPromptDocId && (
                                                                  <a
                                                                    href={`/tutor/${item.tutorPromptDocId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="chip"
                                                                  >
                                                                    <AcademicCapIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                    {language === "german" ? "Tutor-Brief" : "Tutor brief"}
                                                                  </a>
                                                                )}
                                                                {/* Podcast links — show actual links when available, otherwise generation buttons */}
                                                                {item.prePodcastUrl && item.prePodcastUrl.startsWith("http") ? (
                                                                  <a
                                                                    href={item.prePodcastUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="chip"
                                                                  >
                                                                    <SpeakerWaveIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                    {language === "german" ? "Audio · vorher" : "Audio · before"}
                                                                  </a>
                                                                ) : item.prePodcastUrl ? (
                                                                  <span className="chip chip-dashed">
                                                                    <SpeakerWaveIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                    {language === "german" ? "Audio · vorher — wird erstellt" : "Audio · before — generating"}
                                                                  </span>
                                                                ) : null}
                                                                {item.postPodcastUrl && item.postPodcastUrl.startsWith("http") ? (
                                                                  <a
                                                                    href={item.postPodcastUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="chip"
                                                                  >
                                                                    <SpeakerWaveIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                    {language === "german" ? "Audio · nachher" : "Audio · after"}
                                                                  </a>
                                                                ) : item.postPodcastUrl ? (
                                                                  <span className="chip chip-dashed">
                                                                    <SpeakerWaveIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                    {language === "german" ? "Audio · nachher — wird erstellt" : "Audio · after — generating"}
                                                                  </span>
                                                                ) : null}
                                                                {(() => {
                                                                  const vurl = latestVideoUrlOf(item.videoUrl);
                                                                  return vurl ? (
                                                                    <a
                                                                      href={vurl}
                                                                      target="_blank"
                                                                      rel="noopener noreferrer"
                                                                      className="chip"
                                                                    >
                                                                      <VideoCameraIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                      Video
                                                                    </a>
                                                                  ) : (
                                                                    <div className="chip chip-dashed">
                                                                      <VideoCameraIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                      {language === "german" ? "Video — nach Bewertung" : "Video — after grading"}
                                                                    </div>
                                                                  );
                                                                })()}
                                                                {/* IA-11: older-level videos are reachable here (the library is the
                                                                    permanent home), not only from a due card's footer. Same modal. */}
                                                                {(() => {
                                                                  const archive = videoHistoryOf(item.videoUrl).slice(0, -1);
                                                                  if (archive.length === 0) return null;
                                                                  return (
                                                                    <button
                                                                      onClick={() => setArchiveModalData(archive)}
                                                                      className="chip cursor-pointer"
                                                                    >
                                                                      <VideoCameraIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                      {language === "german" ? `Video-Archiv (${archive.length})` : `Video archive (${archive.length})`}
                                                                    </button>
                                                                  );
                                                                })()}
                                                                {/* IA-17 — the prompt viewer is a debug tool (the modal says so). It
                                                                    doesn't belong at equal rank with the student's study materials, so
                                                                    it renders as a quiet ghost icon at the end of the row, not a peer chip. */}
                                                                {(item.prePodcastPrompt || item.postPodcastPrompt || item.lastVideoPrompt1 || item.lastVideoPrompt2) && (
                                                                  <Tip label={language === "german" ? "Prompts ansehen · zum Debuggen" : "View prompts · for debugging"}>
                                                                  <button
                                                                    onClick={() => setPromptsModal({
                                                                      title: item.subjectSub,
                                                                      prompts: [
                                                                        ...(item.prePodcastPrompt ? [{ label: language === "german" ? "Podcast-Prompt · vorher" : "Podcast prompt · pre", content: item.prePodcastPrompt }] : []),
                                                                        ...(item.postPodcastPrompt ? [{ label: language === "german" ? "Podcast-Prompt · nachher" : "Podcast prompt · post", content: item.postPodcastPrompt }] : []),
                                                                        ...(item.lastVideoPrompt1 ? [{ label: language === "german" ? "Video-Skript 1" : "Video script 1", content: item.lastVideoPrompt1 }] : []),
                                                                        ...(item.lastVideoPrompt2 ? [{ label: language === "german" ? "Video-Skript 2" : "Video script 2", content: item.lastVideoPrompt2 }] : []),
                                                                      ],
                                                                    })}
                                                                    aria-label={language === "german" ? "Prompts ansehen — zum Debuggen" : "View prompts — for debugging"}
                                                                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-ink-300 hover:text-ink-600 hover:bg-paper-2 transition-colors cursor-pointer"
                                                                  >
                                                                    <CodeBracketIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                                  </button>
                                                                  </Tip>
                                                                )}
                                                              </div>
                                                            </div>
                                                          )}

                                                          {/* Last feedback — parsed summary; opens the full brief (auto-translated) */}
                                                          {item.lastFeedback && (() => {
                                                            // Chem/math briefs: flatten $…$/```smiles markup BEFORE snipping —
                                                            // a 160-char slice through raw markup reads as line noise.
                                                            const summary = parseFeedbackSummary(stripChemForSpeech(item.lastFeedback, language));
                                                            return (
                                                              <div>
                                                                <p className="caps-label mb-2">
                                                                  {language === "german" ? "Letztes Feedback" : "Last feedback"}
                                                                </p>
                                                                <button
                                                                  onClick={() => openFeedbackItem(item)}
                                                                  className="w-full flex items-center gap-2.5 text-left bg-paper-0 hover:bg-(--paper-hover) rounded-xl border border-(--hairline-card) px-4 py-3 transition-colors cursor-pointer group/fb"
                                                                >
                                                                  {summary.decision && (
                                                                    <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border shrink-0 ${summary.decision === "PASS" ? "bg-(--grade-pass-wash) text-(--grade-pass-text) border-(--grade-pass-border)" : "bg-(--grade-fail-wash) text-(--grade-fail-text) border-(--grade-fail-border)"}`}>
                                                                      {summary.decision === "PASS" ? (language === "german" ? "Bestanden" : "Passed") : (language === "german" ? "Wiederholen" : "Repeat")}
                                                                    </span>
                                                                  )}
                                                                  {summary.mastery !== null && (
                                                                    <span className="text-xs font-semibold text-ink-600 tnum shrink-0">≈ {fmtPercent(summary.mastery, language)}</span>
                                                                  )}
                                                                  <span className="text-xs text-ink-400 flex-1 min-w-0 truncate">{summary.snippet}</span>
                                                                  <ChevronRightIcon className="w-3.5 h-3.5 text-ink-300 group-hover/fb:text-ink-600 transition-colors shrink-0" strokeWidth={2} />
                                                                </button>
                                                              </div>
                                                            );
                                                          })()}

                                                          {/* Meta row */}
                                                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-400 pt-1 border-t border-(--hairline-card)">
                                                            <span className="flex items-center gap-1.5">
                                                              <CalendarDaysIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                              {language === "german" ? "Erstellt: " : "Created: "}
                                                              <span className="text-ink-600">{new Date(item.createdAt).toLocaleDateString(language === "german" ? "de-DE" : "en-GB")}</span>
                                                            </span>
                                                            <span className="flex items-center gap-1.5">
                                                              <ClockIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                                                              {language === "german" ? "Nächste Wiederholung — " : "Next review — "}
                                                              <span className={isDue ? "text-(--accent-text-strong)" : "text-ink-600"} style={isDue ? { fontWeight: 550 } : undefined}>
                                                                {isDue
                                                                  ? (language === "german" ? "jetzt fällig" : "due now")
                                                                  : new Date(item.nextReviewDate).toLocaleDateString(language === "german" ? "de-DE" : "en-GB")}
                                                              </span>
                                                            </span>
                                                          </div>

                                                        </div>
                                                      </motion.div>
                                                    )}
                                                  </AnimatePresence>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {activeTab === "stats" && (
              <motion.div
                key="stats"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="max-w-5xl mx-auto"
              >
                <header className="mb-8 md:mb-10">
                  <p className="caps-label tracking-[0.14em] mb-3">{language === "german" ? "Fortschritt" : "Progress"}</p>
                  <h1 className="font-display text-[34px] sm:text-[40px] tracking-[-0.02em] leading-[1.05] text-ink-900 mb-3" style={{ fontWeight: 470 }}>
                    {language === "german" ? "Dein Fortschritt" : "Your progress"}
                  </h1>
                  <p className="text-ink-600 text-sm sm:text-[15px]">
                    {language === "german"
                      ? "Streak, Aktivität, Bestehensquoten und die Review-Last der nächsten zwei Wochen."
                      : "Streak, activity, pass rates and your review load for the next two weeks."}
                  </p>
                </header>
                <StatsPanel items={rawItems} language={language} />
              </motion.div>
            )}

            {activeTab === "quiz" && selectedReview && (
              <motion.div
                key="quiz"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className={showTutorPanel ? "max-w-3xl mx-auto xl:max-w-none xl:mr-[404px] xl:ml-0" : "max-w-3xl mx-auto"}
              >
                <button
                  onClick={() => {
                    setActiveTab(comprehensionMode ? "library" : "dashboard");
                    setSelectedReview(null);
                    setGradingResult(null);
                    setComprehensionMode(false);
                  }}
                  className="flex items-center gap-2 text-[13px] text-ink-600 hover:text-ink-900 mb-8 transition-colors cursor-pointer group"
                  style={{ fontWeight: 550 }}
                >
                  <ArrowLeftIcon className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.8} />
                  {comprehensionMode
                    ? (language === "german" ? "Bibliothek" : "Library")
                    : (language === "german" ? "Dashboard" : "Dashboard")}
                </button>

                <header className="mb-8 md:mb-10">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="caps-label truncate">{selectedReview.subject}</span>
                    <span className="text-ink-300">·</span>
                    {(() => {
                      /* On a revisit the card carries the CURRENT level — label the
                         replayed attempt with the level it was answered at instead. */
                      const headerLevel = gradingResult?.revisitedAt !== undefined && gradingResult.revisitLevel != null
                        ? gradingResult.revisitLevel
                        : selectedReview.level;
                      return !comprehensionMode && headerLevel >= LIB_LEVEL_SHORT.length ? (
                        /* MC-8: the quiz header inherits the uncapped mastery counter — show the Meister badge instead */
                        <MasteryBadge level={headerLevel} language={language} />
                      ) : (
                        <span className="caps-label whitespace-nowrap">
                          {comprehensionMode
                            ? (language === "german" ? "Verständnis-Check" : "Comprehension check")
                            : <>Level {headerLevel + 1}</>}
                        </span>
                      );
                    })()}
                    {interactive.active && (
                      <span className="inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-full bg-(--accent-wash) border border-(--accent-border-soft) text-(--accent-text-strong) text-[13px] font-semibold">
                        <MicrophoneIcon className="w-3.5 h-3.5" strokeWidth={2} />
                        {language === "german" ? "Freihändig" : "Hands-free"}
                      </span>
                    )}
                  </div>
                  {/* When the Tutor panel is open the column is narrow (~376px);
                      keep the header stacked so the title owns the full width and
                      never competes with the action buttons (which would squeeze
                      it to a few chars and wrap the display title mid-line). */}
                  <div className={`flex flex-col justify-between gap-4 ${showTutorPanel ? "" : "sm:flex-row sm:items-end sm:gap-6"}`}>
                    <div className="min-w-0">
                      <h1 className="font-display text-[26px] sm:text-3xl tracking-[-0.018em] leading-[1.1] text-balance text-ink-900" style={{ fontWeight: 470 }}>{selectedReview.topic}</h1>
                      {parsedTasks.length > 0 && (() => {
                        // "4 tasks · 8 points · untimed" — points summed from task labels ("TASK 1 - 2 POINTS")
                        const totalPoints = parsedTasks.reduce((sum, t) => {
                          const m = t.label.match(/(\d+)\s*(?:POINTS?|PUNKTE?)/i);
                          return sum + (m ? parseInt(m[1], 10) : 0);
                        }, 0);
                        return (
                          <p className="text-[13px] text-ink-400 mt-2 tnum">
                            {parsedTasks.length} {language === "german" ? (parsedTasks.length === 1 ? "Aufgabe" : "Aufgaben") : (parsedTasks.length === 1 ? "task" : "tasks")}
                            {totalPoints > 0 && <> · {totalPoints} {language === "german" ? "Punkte" : "points"}</>}
                            {" · "}{language === "german" ? "ohne Zeitlimit" : "untimed"}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Tip label={gradingResult
                        ? (language === "german" ? "Live Tutor: bespricht die Bewertung mit dir und erklärt Lösungen vollständig" : "Live tutor: debriefs the assessment with you and explains solutions in full")
                        : (language === "german" ? "Live Tutor: kennt deine Vorlesung, das Quiz und deine Entwürfe" : "Live tutor: knows your lecture, the quiz, and your drafts")}>
                      <motion.button
                        {...pressable}
                        onClick={() => { setFocusedTaskId(null); setShowTutorPanel(prev => !prev); }}
                        aria-pressed={showTutorPanel}
                        className={`flex items-center gap-2 h-9 px-4 text-[13px] font-semibold cursor-pointer rounded-xl transition-colors ${showTutorPanel ? "bg-paper-2 text-ink-900 border border-(--line) shadow-(--shadow-e1)" : "btn-secondary"}`}
                      >
                        <AcademicCapIcon className="w-4 h-4" strokeWidth={1.6} />
                        Tutor
                      </motion.button>
                      </Tip>
                      {/* EM-12 — only offer interactive mode where the browser can actually run it; otherwise it starts, reads the question, then dies on a mic error. */}
                      {parsedTasks.length > 0 && !interactive.active && interactive.supported && (
                        <Tip label={language === "german" ? "Interaktiver Modus: Fragen werden vorgelesen, Antworten diktiert" : "Interactive mode: questions read aloud, answers dictated"}>
                        <motion.button
                          {...pressable}
                          onClick={interactive.start}
                          className="btn-secondary flex items-center gap-2 h-9 px-4 text-[13px] font-semibold cursor-pointer"
                        >
                          <MicrophoneIcon className="w-4 h-4" strokeWidth={1.6} />
                          {language === "german" ? "Interaktiv" : "Interactive"}
                        </motion.button>
                        </Tip>
                      )}
                      {parsedTasks.length > 0 && (
                        <Tip label={language === "german" ? "Als Druckbogen exportieren" : "Export as print sheet"}>
                        <motion.button
                          {...pressable}
                          onClick={exportQuizForPrint}
                          className="btn-secondary flex items-center justify-center w-9 h-9 cursor-pointer"
                        >
                          <PrinterIcon className="w-4 h-4" strokeWidth={1.6} />
                        </motion.button>
                        </Tip>
                      )}
                    </div>
                  </div>
                </header>

                {/* Live Tutor — slide-over chat, portaled to <body> (same reason as the
                    interactive bar below). Knows the module's tutor prompt, the quiz
                    tasks and the current draft answers. */}
                <TutorPanel
                  open={showTutorPanel}
                  onClose={() => setShowTutorPanel(false)}
                  itemId={selectedReview.id}
                  subject={selectedReview.subject}
                  topic={selectedReview.topic}
                  language={language}
                  phase={gradingResult ? "assessment" : "quiz"}
                  quizContext={comprehensionMode
                    ? (gradingResult ? "comprehensionAnswered" : "comprehensionCurrent")
                    : (gradingResult ? "lastAnswered" : "current")}
                  tasks={parsedTasks}
                  getDraft={getInteractiveAnswer}
                  getSketch={(taskId) => answerSketches[taskId]}
                  getAssessment={(taskId) => taskReview.byTask.get(taskId)?.body}
                  focusedTaskId={focusedTaskId}
                />

                {/* Floating interactive control bar — portaled to <body> so `position:fixed`
                    escapes framer-motion's transformed ancestors and truly sticks to the
                    viewport (otherwise it anchors to the scrolling page and sits at the bottom). */}
                {/* MO-7 — the portal always mounts an AnimatePresence so the bar can
                    play its exit (opacity + slide down on EASE_IN) instead of blinking
                    out the frame interactive mode stops. */}
                {createPortal(
                  <AnimatePresence>
                  {interactive.active && (
                  <motion.div
                    key="interactive-bar"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16, transition: { duration: 0.16, ease: EASE_IN } }}
                    transition={springSoft}
                    className="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom))] md:bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 px-3 py-2 rounded-[18px] bg-paper-1 border border-(--hairline-card) shadow-(--shadow-e3)"
                  >
                    <span className="text-xs font-bold text-(--accent-text-strong) tnum px-1.5">{interactive.currentIndex + 1} / {interactive.total}</span>
                    <span className="text-[11px] text-ink-400 pr-1.5 min-w-[74px]">
                      {interactive.paused
                        ? (language === "german" ? "Pausiert" : "Paused")
                        : interactive.phase === "loading" ? (language === "german" ? "Lädt…" : "Loading…")
                        : interactive.phase === "speaking" ? (language === "german" ? "Liest vor…" : "Reading…")
                        : interactive.phase === "listening" ? (language === "german" ? "Hört zu…" : "Listening…")
                        : ""}
                    </span>
                    <div className="w-px h-6 bg-(--hairline-card)" />
                    <Tip label={language === "german" ? "Vorherige Aufgabe" : "Previous task"}>
                      <button onClick={interactive.previous} disabled={interactive.currentIndex <= 0} className="btn-ghost-icon w-10 h-10 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                        <BackwardIcon className="w-4 h-4" strokeWidth={1.6} />
                      </button>
                    </Tip>
                    <Tip label={interactive.paused ? (language === "german" ? "Fortsetzen — Leertaste" : "Resume — Space") : (language === "german" ? "Pause — Leertaste" : "Pause — Space")}>
                      <button onClick={interactive.togglePause} className="btn-primary w-12 h-12 flex items-center justify-center cursor-pointer !rounded-[14px]">
                        {interactive.paused ? <PlayIcon className="w-5 h-5" strokeWidth={1.8} /> : <PauseIcon className="w-5 h-5" strokeWidth={1.8} />}
                      </button>
                    </Tip>
                    <Tip label={language === "german" ? "Nächste Aufgabe" : "Next task"}>
                      <button onClick={interactive.next} className="btn-ghost-icon w-10 h-10 flex items-center justify-center cursor-pointer">
                        <ForwardIcon className="w-4 h-4" strokeWidth={1.6} />
                      </button>
                    </Tip>
                    <div className="w-px h-6 bg-(--hairline-card)" />
                    <Tip label={language === "german" ? "Beenden" : "Stop"}>
                      <button onClick={interactive.stop} className="btn-ghost-icon w-10 h-10 flex items-center justify-center hover:!text-(--grade-fail-accent) hover:!bg-(--grade-fail-wash) cursor-pointer">
                        <StopIcon className="w-4 h-4" strokeWidth={1.6} />
                      </button>
                    </Tip>
                  </motion.div>
                  )}
                  </AnimatePresence>,
                  document.body
                )}

                {gradingError && !isGrading && (
                  <div className="mb-6 p-6 rounded-[18px] bg-(--grade-fail-wash) border border-(--grade-fail-border) text-sm flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-(--grade-fail-text) font-semibold">
                      <ExclamationTriangleIcon className="w-5 h-5" strokeWidth={1.6} />
                      <span>{language === "german" ? "Die Bewertung wurde nicht abgeschlossen." : "Grading didn't complete."}</span>
                    </div>
                    <pre className="text-xs font-mono bg-paper-0 p-4 rounded-xl border border-(--hairline) whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto leading-relaxed text-left text-(--grade-fail-text)/80 custom-scrollbar">
                      {gradingError}
                    </pre>
                    <p className="text-xs text-ink-400 text-left leading-relaxed">
                      {language === "german"
                        ? "Deine Antworten sind noch da — versuch es einfach erneut. Wenn es wieder passiert, warte kurz und lade die Seite neu."
                        : "Your answers are still here — just submit again. If it happens again, wait a moment and reload the page."}
                    </p>
                  </div>
                )}

                {isGrading ? (
                  <div className="card-surface-elevated px-8 py-12 md:py-14 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-[18px] bg-(--accent-wash-soft) border border-(--accent-border-soft) flex items-center justify-center mb-6">
                      <ArrowPathIcon className="w-7 h-7 text-(--accent-text-strong) animate-spin" strokeWidth={1.6} />
                    </div>
                    <h3 className="font-display text-[26px] text-ink-900 mb-2" style={{ fontWeight: 470 }}>{language === "german" ? "Deine Antworten werden bewertet" : "Grading your answers"}</h3>
                    <p className="text-ink-600 mb-2 text-sm">{gradingMsg}</p>
                    <p className="text-ink-400 mb-9 text-xs">
                      {language === "german"
                        ? "Zwei Gutachter lesen unabhängig, dann führt ein Chef-Gutachter zusammen."
                        : "Two examiners read independently, then a head examiner reconciles them."}
                    </p>

                    <div className="progress-track w-full max-w-[460px] h-1 overflow-hidden">
                      <motion.div
                        className="progress-fill w-full"
                        style={{ transformOrigin: "left" }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.min(1, gradingStep / 4) }}
                        transition={springSoft}
                      />
                    </div>
                    <div className="w-full max-w-[460px] mt-8 text-left space-y-3.5">
                      {[1,2,3,4].map((step, i) => (
                        <motion.div
                          key={step}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.24, ease: EASE_OUT }}
                          className={`flex items-center gap-3.5 text-sm transition-colors duration-500 ${gradingStep > step ? 'text-(--grade-pass-text)' : gradingStep === step ? 'text-(--accent-text-strong) font-semibold' : 'text-ink-400'}`}
                        >
                          <AnimatePresence mode="wait">
                            {gradingStep > step ? (
                              <motion.span key="done" {...STEP_NODE_MOTION} className="w-[22px] h-[22px] rounded-full bg-(--grade-pass-wash) shrink-0 flex items-center justify-center">
                                <CheckIcon className="w-3 h-3 text-(--grade-pass-accent)" strokeWidth={2.4} />
                              </motion.span>
                            ) : gradingStep === step ? (
                              <motion.span key="active" {...STEP_NODE_MOTION} className="ember-dot w-[22px] h-[22px] rounded-full border-2 border-amber-500 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span></motion.span>
                            ) : (
                              <motion.div key="idle" {...STEP_NODE_MOTION} className="w-[22px] h-[22px] rounded-full border border-(--line) shrink-0" />
                            )}
                          </AnimatePresence>
                          {language === "german" ? (
                            step === 1 ? "Gutachter 1 & 2 · lesen parallel" :
                            step === 2 ? "Chef-Gutachter · konsolidiert das Urteil" :
                            step === 3 ? (comprehensionMode ? "Verständnis-Wert ermitteln" : "Nächstes Level & Video vorbereiten")
                                       : (comprehensionMode ? "Ergebnis speichern" : "Deine Bewertung speichern")
                          ) : (
                            step === 1 ? "Examiner 1 & 2 · read in parallel" :
                            step === 2 ? "Head examiner · consolidating the verdict" :
                            step === 3 ? (comprehensionMode ? "Extract the comprehension score" : "Prepare the next level & video")
                                       : (comprehensionMode ? "Save the result" : "Save your record")
                          )}
                        </motion.div>
                      ))}
                    </div>
                    <p className="text-xs text-ink-400 mt-9">
                      {language === "german"
                        ? "Du kannst diese Seite verlassen — das Ergebnis wartet auf dich."
                        : "You can leave this page — we'll have it ready when you're back."}
                    </p>
                  </div>
                ) : gradingResult ? (
                  /* MO-5 — the earned verdict rises in on a stagger (pill → card →
                     brief → buttons) instead of popping in raw; the pill also gets a
                     spring scale. The 1s amber thread stays the finale (delay 0.2). */
                  <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
                    <motion.div variants={riseChild} className="card-surface-elevated p-6 md:p-8 relative">
                      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
                        <div>
                          <motion.span
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ ...springTactile, delay: 0.12 }}
                            className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ${gradingResult.isPass ? 'bg-(--grade-pass-wash) text-(--grade-pass-text)' : 'bg-(--grade-fail-wash) text-(--grade-fail-text)'}`}
                          >
                            {gradingResult.isPass
                              ? (language === "german" ? "Bestanden" : "Passed")
                              : (language === "german" ? "Wiederholen" : "Repeat")}
                          </motion.span>
                          <h2 className="font-display text-[34px] sm:text-[40px] text-ink-900 mt-4 tracking-[-0.02em] leading-[1.05]" style={{ fontWeight: 470 }}>
                            {gradingResult.comprehension
                              ? <>
                                  <span className={`tnum ${gradingResult.isPass ? "text-(--grade-pass-text)" : "text-(--grade-fail-text)"}`}>
                                    {gradingResult.comprehensionScore !== null && gradingResult.comprehensionScore !== undefined
                                      ? fmtPercent(gradingResult.comprehensionScore, language)
                                      : language === "german" ? "—\u202F%" : "—%"}
                                  </span>{" "}
                                  <em className="italic">{language === "german" ? "Verständnis." : "comprehension."}</em>
                                </>
                              : gradingResult.revisitedAt !== undefined
                              ? (language === "german"
                                  ? <>Dein <em className="italic">letzter Versuch.</em></>
                                  : <>Your <em className="italic">last attempt.</em></>)
                              : gradingResult.isPass
                              ? (language === "german"
                                  ? <>Level {gradingResult.currentLevel !== null ? gradingResult.currentLevel + 1 : "—"}, <em className="italic">freigeschaltet.</em></>
                                  : <>Level {gradingResult.currentLevel !== null ? gradingResult.currentLevel + 1 : "—"}, <em className="italic">unlocked.</em></>)
                              : (language === "german"
                                  ? <>Schauen wir es uns <em className="italic">noch einmal</em> an.</>
                                  : <>Let&apos;s see this one <em className="italic">again.</em></>)}
                          </h2>
                          {gradingResult.revisitedAt !== undefined ? (
                            <p className="text-ink-600 mt-3 text-sm">
                              {(language === "german" ? "Beantwortet am " : "Answered on ")}
                              <strong className="text-ink-900 font-semibold tnum">
                                {gradingResult.revisitedAt
                                  ? new Date(gradingResult.revisitedAt).toLocaleDateString(language === "german" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                                  : "—"}
                              </strong>
                              {gradingResult.revisitPdfScan
                                ? (language === "german"
                                    ? " — als gescanntes PDF eingereicht. Der Scan selbst wird nicht gespeichert, nur die Bewertung."
                                    : " — submitted as a scanned PDF. The scan itself isn't stored, only the assessment.")
                                : (language === "german"
                                    ? " — Fragen, deine Antworten und die Bewertung, wie sie bewertet wurden."
                                    : " — questions, your answers and the assessment, exactly as graded.")}
                            </p>
                          ) : gradingResult.comprehension ? (
                            <p className="text-ink-600 mt-3 text-sm">
                              {language === "german"
                                ? "In der Bibliothek aktualisiert — Zeitplan und Level bleiben unberührt."
                                : "Updated in your library — schedule and levels stay untouched."}
                            </p>
                          ) : null}
                          {gradingResult.nextReviewDate && (
                            <p className="text-ink-600 mt-3 text-sm">
                              {gradingResult.isPass
                                ? (language === "german" ? "Nächste Wiederholung am " : "Next review on ")
                                : (language === "german" ? "Kommt zurück am " : "Comes back on ")}
                              <strong className="text-ink-900 font-semibold tnum">{new Date(gradingResult.nextReviewDate).toLocaleDateString(language === "german" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}</strong>
                              {!gradingResult.isPass && (language === "german" ? ". Wiederholen ist kein Rückschritt — das Intervall tut seine Arbeit." : ". Repeating isn't a setback — it's the interval doing its job.")}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* The earned moment: amber thread draws once under the pass header.
                          A revisit is a replay, not the moment — quiet hairline instead. */}
                      {gradingResult.isPass && gradingResult.revisitedAt === undefined ? (
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 1, ease: EASE_OUT, delay: 0.2 }}
                          className="amber-thread-h h-0.5 mt-7 origin-left"
                        />
                      ) : (
                        <div className="h-px mt-7 bg-(--hairline)" />
                      )}
                    </motion.div>

                    <motion.div variants={riseChild} className="card-surface-elevated">
                      <div className="overflow-hidden rounded-[inherit]">
                      <div className="border-b border-(--hairline) bg-(--paper-hover) px-6 py-4 flex items-center gap-2.5">
                        <DocumentTextIcon className={`w-4 h-4 ${gradingResult.isPass ? "text-(--accent-text-strong)" : "text-(--grade-fail-accent)"}`} strokeWidth={1.6} />
                        <h3 className="caps-label !text-ink-600">
                          {gradingResult.isPass
                            ? (language === "german" ? "Gutachter-Brief" : "Examiner's brief")
                            : (language === "german" ? "Worauf du achten solltest" : "What to focus on")}
                        </h3>
                      </div>
                      <div className="p-6 md:p-8">
                        {/* Revisit: overall assessment only — the remediation plan
                            belongs to the live result, the per-task text to the cards. */}
                        <FeedbackBody text={gradingResult.revisitedAt !== undefined
                          ? overallSection(taskReview.brief || gradingResult.feedback)
                          : (taskReview.brief || gradingResult.feedback)} />
                      </div>
                      </div>
                    </motion.div>

                    {/* Free-form quizzes have no task cards — on a revisit, still show
                        the submitted sheet (typed and/or scribbled) next to the brief.
                        Also shown when a legacy snapshot has no per-task answers but
                        the whole sheet survived in `free` — better one combined sheet
                        than task cards all claiming "Not answered". */}
                    {gradingResult.revisitedAt !== undefined &&
                      (parsedTasks.length === 0 || gradingResult.revisitAnswersUnavailable) &&
                      (studentAnswers.trim() || answerSketches[FREE_SKETCH_KEY]) && (
                      <motion.div variants={riseChild}>
                        <TaskReviewCard
                          number={1}
                          label={language === "german" ? "Dein Antwortblatt" : "Your answer sheet"}
                          assessment={null}
                          typedAnswer={studentAnswers}
                          sketch={answerSketches[FREE_SKETCH_KEY]}
                          sketchDropped={gradingResult.revisitSketchesDropped?.includes(FREE_SKETCH_KEY)}
                          language={language}
                        />
                      </motion.div>
                    )}

                    {/* Task-by-task assessment: a read-only replay of the quiz with
                        your submitted answers, per-task mastery, and the per-task
                        tutor. Off by default — the short brief above is the overview. */}
                    {taskReview.perTasks.length > 0 && (
                      <motion.div variants={riseChild} className="flex flex-col gap-4">
                        <button
                          onClick={() => setShowTaskReview((v) => !v)}
                          aria-expanded={showTaskReview}
                          className="btn-secondary h-11 px-5 text-sm flex items-center justify-center gap-2 cursor-pointer self-start"
                        >
                          {showTaskReview
                            ? (language === "german" ? "Aufgaben-Bewertung ausblenden" : "Hide task-by-task")
                            : (language === "german" ? "Aufgabe für Aufgabe ansehen" : "Review task by task")}
                          <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${showTaskReview ? "rotate-180" : ""}`} strokeWidth={2} />
                        </button>
                        <AnimatePresence initial={false}>
                          {showTaskReview && (
                            <motion.div key="task-review" variants={accordion} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                              <div className="flex flex-col gap-4">
                                {parsedTasks.map((task, i) => (
                                  <TaskReviewCard
                                    key={task.id}
                                    number={i + 1}
                                    label={task.label}
                                    questionText={task.questionText}
                                    assessment={taskReview.byTask.get(task.id) ?? null}
                                    /* Snapshot without per-task answers (PDF scan / legacy):
                                       undefined = answer section hidden, not "Not answered". */
                                    typedAnswer={gradingResult.revisitAnswersUnavailable ? undefined : individualAnswers[task.id] ?? ""}
                                    sketch={answerSketches[task.id]}
                                    sketchDropped={gradingResult.revisitSketchesDropped?.includes(task.id)}
                                    tutorActive={showTutorPanel && focusedTaskId === task.id}
                                    onTutor={() => { setFocusedTaskId(task.id); setShowTutorPanel(true); }}
                                    language={language}
                                  />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}

                    <motion.div variants={riseChild} className="flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={() => {
                          setActiveTab(gradingResult.comprehension ? "library" : "dashboard");
                          setSelectedReview(null);
                          setGradingResult(null);
                          setComprehensionMode(false);
                        }}
                        className={`${gradingResult.isPass ? "btn-primary" : "btn-ink"} h-11 px-6 text-sm cursor-pointer`}
                      >
                        {gradingResult.comprehension
                          ? (language === "german" ? "Zurück zur Bibliothek" : "Back to library")
                          : (language === "german" ? "Zurück zum Dashboard" : "Back to dashboard")}
                      </button>
                      {!gradingResult.isPass && selectedReview.raw.prePodcastUrl?.startsWith("http") && (
                        <a href={selectedReview.raw.prePodcastUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary h-11 px-5 text-sm inline-flex items-center gap-2">
                          <SpeakerWaveIcon className="w-4 h-4 text-ink-600" strokeWidth={1.6} />
                          {language === "german" ? "Audio · vorher abspielen" : "Play pre-lecture audio"}
                        </a>
                      )}
                    </motion.div>
                  </motion.div>
                ) : (
                  /* Quiz taking UI */
                  <div className="flex flex-col gap-6 pb-24">
                    {parsedTasks.length > 0 ? (
                      <div className="space-y-4">
                        {parsedTasks.map((task, idx) => {
                          const isMC = /^[A-D]\)\s/m.test(task.questionText);
                          return (
                            <motion.div
                              key={task.id}
                              id={`iq-${idx}`}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(idx, 8) * 0.03, duration: DUR.base, ease: EASE_OUT }}
                              className={`card-surface-elevated p-6 md:p-8 transition-[opacity,border-color] duration-[240ms] ${
                                interactive.active && interactive.currentIndex === idx
                                  ? "!border-(--accent-border-strong)"
                                  : interactive.active
                                  ? "opacity-50"
                                  : ""
                              }`}
                            >
                              {/* MO-4 — pre-rendered focus ring + deep shadow; only opacity
                                  animates (no box-shadow interpolation, per the motion law) */}
                              <div
                                aria-hidden="true"
                                className="absolute -inset-px rounded-[inherit] pointer-events-none transition-opacity duration-[240ms]"
                                style={{
                                  boxShadow: "0 0 0 3px var(--accent-wash), 0 20px 48px -20px color-mix(in srgb, var(--a-g3) 28%, transparent)",
                                  opacity: interactive.active && interactive.currentIndex === idx ? 1 : 0,
                                }}
                              />
                              <div className="flex items-center gap-3 mb-4">
                                <span className={`font-display text-xl italic leading-none ${interactive.active && interactive.currentIndex === idx ? "text-(--accent-text-strong)" : "text-ink-300"}`}>{String(idx + 1).padStart(2, "0")}</span>
                                <h3 className="caps-label !text-ink-600">{task.label}</h3>
                              </div>
                              {interactive.active && interactive.currentIndex === idx && (
                                <div className="flex items-center gap-2 mb-4 text-[11px] font-semibold">
                                  {interactive.paused ? (
                                    <span className="flex items-center gap-1.5 text-ink-400"><PauseIcon className="w-4 h-4" strokeWidth={1.6} />{language === "german" ? "Pausiert" : "Paused"}</span>
                                  ) : interactive.phase === "speaking" ? (
                                    <span className="flex items-center gap-1.5 text-(--accent-text-strong)"><SpeakerWaveIcon className="w-4 h-4" strokeWidth={1.6} />{language === "german" ? "Wird vorgelesen…" : "Reading aloud…"}</span>
                                  ) : interactive.phase === "listening" ? (
                                    <span className="flex items-center gap-2 text-(--grade-pass-text)">
                                      <span className="flex items-end gap-0.5 h-3.5" aria-hidden="true">
                                        <span className="eq-bar h-full" style={{ animationDelay: "0ms" }} />
                                        <span className="eq-bar h-full" style={{ animationDelay: "150ms" }} />
                                        <span className="eq-bar h-full" style={{ animationDelay: "300ms" }} />
                                        <span className="eq-bar h-full" style={{ animationDelay: "450ms" }} />
                                      </span>
                                      {language === "german" ? "Höre zu" : "Listening"}
                                      <span className="text-ink-400 font-medium">{language === "german" ? "· sag „nächste Aufgabe“ zum Weitergehen" : "· say “next task” to move on"}</span>
                                    </span>
                                  ) : interactive.phase === "loading" ? (
                                    <span className="flex items-center gap-1.5 text-ink-600"><span className="w-3.5 h-3.5 border-2 border-(--accent-border) border-t-amber-500 rounded-full animate-spin" />{language === "german" ? "Audio lädt…" : "Loading audio…"}</span>
                                  ) : null}
                                </div>
                              )}
                              <div className="text-[15px] text-ink-900 whitespace-pre-wrap leading-[1.65] mb-5">
                                <ChemText text={task.questionText} />
                              </div>

                              <div className="border-t border-(--hairline) pt-5">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="caps-label">{language === "german" ? "Deine Antwort" : "Your answer"}</span>
                                  <div className="flex items-center gap-1.5">
                                    {/* Per-task tutor: opens the chat with THIS task pinned at the top. */}
                                    <button
                                      type="button"
                                      onClick={() => { setFocusedTaskId(task.id); setShowTutorPanel(true); }}
                                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                                        showTutorPanel && focusedTaskId === task.id
                                          ? "bg-(--accent-wash) text-(--accent-text-strong)"
                                          : "bg-paper-2 text-ink-600 hover:text-ink-900"
                                      }`}
                                    >
                                      <AcademicCapIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
                                      Tutor
                                    </button>
                                    {scribbleEnabled && (
                                      <button
                                        type="button"
                                        onClick={() => setOpenScribbles(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                                          openScribbles[task.id] || answerSketches[task.id]
                                            ? "bg-(--accent-wash) text-(--accent-text-strong)"
                                            : "bg-paper-2 text-ink-600 hover:text-ink-900"
                                        }`}
                                      >
                                        <PencilIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
                                        {openScribbles[task.id]
                                          ? (language === "german" ? "Scribble schließen" : "Close scribble")
                                          : answerSketches[task.id]
                                          ? (language === "german" ? "Scribble bearbeiten" : "Edit scribble")
                                          : "Scribble"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {!isMC && (
                                  <div className="mb-1.5">
                                    <SymbolBar
                                      categories={symbolCategories}
                                      category={symbolCategory}
                                      onCategory={chooseSymbolCategory}
                                      expanded={symbolBarOpen}
                                      onExpandedChange={setSymbolOpen}
                                      recents={[]}
                                      onInsert={(t) => insertSymbol(t, task.id)}
                                      language={language}
                                    />
                                  </div>
                                )}
                                <AutoGrowTextarea
                                  value={individualAnswers[task.id] || ""}
                                  aria-label={`${task.label} — ${language === "german" ? "Deine Antwort" : "Your answer"}`}
                                  onFocus={e => {
                                    answerElsRef.current[task.id] = e.currentTarget;
                                    lastAnswerTaskRef.current = task.id;
                                  }}
                                  onChange={e => {
                                    answerElsRef.current[task.id] = e.currentTarget;
                                    lastAnswerTaskRef.current = task.id;
                                    setIndividualAnswers(prev => ({
                                      ...prev,
                                      [task.id]: e.target.value
                                    }));
                                  }}
                                  placeholder={language === "german"
                                    ? (isMC ? "Tippe A, B, C oder D…" : "Antworte in eigenen Worten — oder diktiere im interaktiven Modus.")
                                    : (isMC ? "Type A, B, C, or D…" : "Answer in your own words — or dictate it in interactive mode.")}
                                  className={`input-inset w-full px-4 py-3 text-base sm:text-sm leading-[1.6] resize-none overflow-hidden ${isMC ? "min-h-[3rem]" : "min-h-[88px]"}`}
                                />
                                {/* Scribble pad (allowlist feature): a WIDER canvas breaks out of the
                                    card padding so formulas/structures have room to breathe. */}
                                {/* MO-8 — the pad opens/closes on the shared accordion (like the
                                    materials disclosure) instead of slamming 340px in/out. The -mx
                                    breakout lives on the overflow-clipped wrapper so the wider canvas
                                    isn't clipped horizontally. */}
                                <AnimatePresence initial={false}>
                                {scribbleEnabled && openScribbles[task.id] && (
                                  <motion.div
                                    key="scribble-task"
                                    variants={accordion}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="-mx-3 md:-mx-4"
                                    style={{ overflow: "hidden" }}
                                  >
                                    <div className="mt-3">
                                    <ScribbleCanvas
                                      initialDataUrl={answerSketches[task.id] || null}
                                      language={language}
                                      onChange={(dataUrl) => setAnswerSketches(prev => {
                                        const next = { ...prev };
                                        if (dataUrl) next[task.id] = dataUrl; else delete next[task.id];
                                        return next;
                                      })}
                                    />
                                    </div>
                                  </motion.div>
                                )}
                                </AnimatePresence>
                                {scribbleEnabled && !openScribbles[task.id] && answerSketches[task.id] && (
                                  <button
                                    type="button"
                                    onClick={() => setOpenScribbles(prev => ({ ...prev, [task.id]: true }))}
                                    className="mt-3 flex items-center gap-3 w-full text-left cursor-pointer group"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                                    <img
                                      src={answerSketches[task.id]}
                                      alt={language === "german" ? "Gescribbelte Antwort (angehängt)" : "Scribbled answer (attached)"}
                                      className="h-16 w-auto max-w-[240px] object-contain rounded-[10px] border border-(--hairline) bg-[#fffefb]"
                                    />
                                    <span className="text-[11px] text-ink-400 group-hover:text-ink-600 transition-colors">
                                      {language === "german"
                                        ? "Scribble wird mit eingereicht — tippen zum Bearbeiten."
                                        : "Scribble will be submitted — tap to edit."}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}

                        <div className="pt-3">
                          {/* IA-6 — orientation cue at the point of no return: how many tasks are
                              actually answered (a typed draft or a scribble counts). A long quiz can
                              span several screens; the submit button looks identical whether 1 or all
                              are done, and a blank answer costs a real SRS interval. */}
                          {(() => {
                            const answeredCount = parsedTasks.filter(task => (individualAnswers[task.id] || "").trim().length > 0 || !!answerSketches[task.id]).length;
                            const allAnswered = answeredCount === parsedTasks.length;
                            return (
                              <div className="flex items-center justify-center gap-1.5 mb-3 text-xs">
                                <span className={`tnum font-semibold ${allAnswered ? "text-(--grade-pass-text)" : "text-ink-900"}`}>{answeredCount}</span>
                                <span className="text-ink-400">{language === "german" ? `von ${parsedTasks.length} beantwortet` : `of ${parsedTasks.length} answered`}</span>
                              </div>
                            );
                          })()}
                          <motion.button
                            {...pressable}
                            onClick={handleGrade}
                            disabled={isGrading || !parsedTasks.some(task => (individualAnswers[task.id] || "").trim().length > 0 || !!answerSketches[task.id])}
                            className="btn-primary w-full h-14 sm:h-12 text-[15px] sm:text-sm flex items-center justify-center gap-2.5 cursor-pointer"
                          >
                            <SparklesIcon className="w-[18px] h-[18px]" strokeWidth={1.6} />
                            {language === "german" ? "Zur Bewertung einreichen" : "Submit for grading"}
                          </motion.button>
                          <p className="text-center text-xs text-ink-400 mt-3">
                            {/* Comprehension checks are draft-free (see startQuiz) — don't promise a saved draft there. */}
                            {comprehensionMode
                              ? (language === "german"
                                  ? "Die Bewertung dauert etwa eine Minute. Verständnis-Check-Antworten werden nicht als Entwurf gespeichert."
                                  : "Grading takes about a minute. Comprehension-check answers aren't saved as a draft.")
                              : (language === "german"
                                  ? "Die Bewertung dauert etwa eine Minute. Dein Entwurf ist auf diesem Gerät gespeichert."
                                  : "Grading takes about a minute. Your draft is saved on this device.")}
                            <span className="hidden md:inline"> · </span>
                            <span className="hidden md:inline-flex items-center gap-1 whitespace-nowrap"><span className="kbd">⌘</span><span className="kbd">↵</span> {language === "german" ? "zum Abschicken" : "to submit"}</span>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="card-surface-elevated p-6 md:p-8 flex flex-col">
                        <div className="bg-paper-0 border border-(--hairline) rounded-[14px] p-6 font-sans whitespace-pre-wrap text-ink-900/80 text-sm leading-relaxed mb-6">
                          {/* Server-computed, level-correct quiz text (slim payload) */}
                          <ChemText text={activeQuizText} />
                        </div>

                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="caps-label">{language === "german" ? "Deine Antwort" : "Your answer"}</span>
                          {scribbleEnabled && (
                            <button
                              type="button"
                              onClick={() => setOpenScribbles(prev => ({ ...prev, [FREE_SKETCH_KEY]: !prev[FREE_SKETCH_KEY] }))}
                              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                                openScribbles[FREE_SKETCH_KEY] || answerSketches[FREE_SKETCH_KEY]
                                  ? "bg-(--accent-wash) text-(--accent-text-strong)"
                                  : "bg-paper-2 text-ink-600 hover:text-ink-900"
                              }`}
                            >
                              <PencilIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
                              {openScribbles[FREE_SKETCH_KEY]
                                ? (language === "german" ? "Scribble schließen" : "Close scribble")
                                : answerSketches[FREE_SKETCH_KEY]
                                ? (language === "german" ? "Scribble bearbeiten" : "Edit scribble")
                                : "Scribble"}
                            </button>
                          )}
                        </div>
                        <textarea
                          value={studentAnswers}
                          aria-label={language === "german" ? "Deine Antwort" : "Your answer"}
                          onChange={e => setStudentAnswers(e.target.value)}
                          placeholder={language === "german" ? "Schreibe deine Antworten hier…" : "Write your answers here…"}
                          className="input-inset flex-1 w-full p-5 text-base sm:text-sm leading-relaxed resize-none min-h-[300px] mb-5"
                        />
                        {/* MO-8 — free-answer pad opens on the shared accordion. */}
                        <AnimatePresence initial={false}>
                        {scribbleEnabled && openScribbles[FREE_SKETCH_KEY] && (
                          <motion.div
                            key="scribble-free"
                            variants={accordion}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            style={{ overflow: "hidden" }}
                          >
                            <div className="mb-5">
                            <ScribbleCanvas
                              initialDataUrl={answerSketches[FREE_SKETCH_KEY] || null}
                              language={language}
                              heightPx={420}
                              onChange={(dataUrl) => setAnswerSketches(prev => {
                                const next = { ...prev };
                                if (dataUrl) next[FREE_SKETCH_KEY] = dataUrl; else delete next[FREE_SKETCH_KEY];
                                return next;
                              })}
                            />
                            </div>
                          </motion.div>
                        )}
                        </AnimatePresence>
                        <motion.button
                          {...pressable}
                          onClick={handleGrade}
                          disabled={isGrading || (!studentAnswers.trim() && !answerSketches[FREE_SKETCH_KEY])}
                          className="btn-primary w-full h-14 sm:h-12 text-[15px] sm:text-sm flex items-center justify-center gap-2.5 cursor-pointer"
                        >
                          <SparklesIcon className="w-[18px] h-[18px]" strokeWidth={1.6} />
                          {language === "german" ? "Zur Bewertung einreichen" : "Submit for grading"}
                        </motion.button>
                        <p className="text-center text-xs text-ink-400 mt-3">
                          {/* Comprehension checks are draft-free (see startQuiz) — don't promise a saved draft there. */}
                          {comprehensionMode
                            ? (language === "german"
                                ? "Die Bewertung dauert etwa eine Minute. Verständnis-Check-Antworten werden nicht als Entwurf gespeichert."
                                : "Grading takes about a minute. Comprehension-check answers aren't saved as a draft.")
                            : (language === "german"
                                ? "Die Bewertung dauert etwa eine Minute. Dein Entwurf ist auf diesem Gerät gespeichert."
                                : "Grading takes about a minute. Your draft is saved on this device.")}
                          <span className="hidden md:inline"> · </span>
                          <span className="hidden md:inline-flex items-center gap-1 whitespace-nowrap"><span className="kbd">⌘</span><span className="kbd">↵</span> {language === "german" ? "zum Abschicken" : "to submit"}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Archive Modal */}
          <AnimatePresence>
            {archiveModalData && (
              <motion.div
                {...overlayMotion}
                key="archive-overlay"
                className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-(--overlay) backdrop-blur-[3px]"
                onClick={() => setArchiveModalData(null)}
              >
                <ModalDialog
                  labelledBy="archive-modal-title"
                  onClick={(e) => e.stopPropagation()}
                  className="card-glass w-full max-w-lg overflow-hidden flex flex-col max-h-[85dvh] border border-(--line-soft)"
                >
                  <div className="px-6 py-5 border-b border-(--hairline-card) flex justify-between items-center">
                    <h3 id="archive-modal-title" className="font-display text-xl tracking-[-0.015em] text-ink-900" style={{ fontWeight: 480 }}>{language === "german" ? "Video-Archiv" : "Video archive"}</h3>
                    <Tip label={language === "german" ? "Schließen — Esc" : "Close — Esc"}>
                      <button
                        onClick={() => setArchiveModalData(null)}
                        className="w-8 h-8 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-900 hover:bg-(--hairline) transition-colors cursor-pointer shrink-0"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </Tip>
                  </div>
                  <div className="p-6 md:p-8 space-y-3 overflow-y-auto overscroll-contain custom-scrollbar">
                    {archiveModalData.map((item, idx) => (
                      <div key={idx} className="card-surface p-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-ink-900 text-sm font-semibold">Level {item.level + 1} Video</h4>
                          {item.date && <p className="text-xs text-ink-600 mt-0.5">{new Date(item.date).toLocaleDateString(language === "german" ? "de-DE" : "en-GB")}</p>}
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary px-4 py-2 text-xs flex items-center gap-2"
                        >
                          <VideoCameraIcon className="w-4 h-4 text-ink-600" />
                          {language === "german" ? "Ansehen" : "Watch"}
                        </a>
                      </div>
                    ))}
                  </div>
                </ModalDialog>
              </motion.div>
            )}
          </AnimatePresence>

        </main>

        {/* Historical Feedback Modal */}
        <AnimatePresence>
          {activeFeedbackItem && (
            <motion.div
              {...overlayMotion}
              key="feedback-overlay"
              className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-(--overlay) backdrop-blur-[3px]"
              onClick={() => setActiveFeedbackItem(null)}
            >
              <ModalDialog
                labelledBy="feedback-modal-title"
                onClick={(e) => e.stopPropagation()}
                className="card-glass w-full max-w-4xl overflow-hidden flex flex-col max-h-[85dvh] border border-(--line-soft)"
              >
                {/* Header */}
                <div className="px-6 py-5 border-b border-(--hairline-card) flex justify-between items-center">
                  <div>
                    <h3 id="feedback-modal-title" className="font-display text-xl tracking-[-0.015em] text-ink-900" style={{ fontWeight: 480 }}>{activeFeedbackItem.subjectSub}</h3>
                    <p className="text-xs text-ink-600 mt-1">{activeFeedbackItem.subjectMain} — Level {activeFeedbackItem.currentLevel + 1}</p>
                  </div>
                  <Tip label={language === "german" ? "Schließen — Esc" : "Close — Esc"}>
                    <button
                      onClick={() => setActiveFeedbackItem(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-900 hover:bg-(--hairline) transition-colors cursor-pointer shrink-0"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </Tip>
                </div>

                {/* Header/Title */}
                <div className="border-b border-(--hairline-card) bg-paper-0 px-6 py-3.5 flex items-center gap-2.5">
                  <DocumentTextIcon className="w-4 h-4 text-ink-400" />
                  <p className="caps-label !text-ink-600">{language === "german" ? "Gutachter-Brief" : "Examiner's brief"}</p>
                  <span className="flex-1" />
                  {feedbackTranslating ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-400">
                      <ArrowPathIcon className="w-3 h-3 animate-spin" />
                      {language === "german" ? "Übersetze…" : "Translating…"}
                    </span>
                  ) : feedbackTranslation ? (
                    <button
                      onClick={() => setShowFeedbackOriginal(prev => !prev)}
                      className="text-[11px] text-ink-400 hover:text-ink-600 transition-colors cursor-pointer"
                      style={{ fontWeight: 550 }}
                    >
                      {showFeedbackOriginal
                        ? (language === "german" ? "Übersetzung anzeigen" : "Show translation")
                        : (language === "german" ? "Automatisch übersetzt · Original anzeigen" : "Auto-translated · show original")}
                    </button>
                  ) : null}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-6 md:p-8 custom-scrollbar">
                  {/* Revisit the last attempt WITH the stored answers: the quiz page,
                      your answers and the assessment side by side, per-task tutor
                      included. Attempts graded before snapshots existed toast instead. */}
                  {activeFeedbackItem.lastFeedback && (
                    <button
                      onClick={() => openRevisit(activeFeedbackItem, false)}
                      disabled={revisitLoading === activeFeedbackItem.id}
                      className="w-full mb-6 btn-secondary h-11 px-5 text-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-wait disabled:opacity-60"
                    >
                      {revisitLoading === activeFeedbackItem.id
                        ? <ArrowPathIcon className="w-4 h-4 animate-spin" strokeWidth={1.6} />
                        : <AcademicCapIcon className="w-4 h-4" strokeWidth={1.6} />}
                      {language === "german" ? "Letzten Versuch mit deinen Antworten ansehen" : "Revisit last attempt with your answers"}
                    </button>
                  )}
                  {(() => {
                    const histText = feedbackTranslation && !showFeedbackOriginal ? feedbackTranslation : (activeFeedbackItem.lastFeedback ?? "");
                    const { brief: histBrief, perTasks: histPerTasks } = splitFeedback(histText);
                    return (
                      <>
                        <FeedbackBody text={histBrief || histText} />
                        {histPerTasks.length > 0 && (
                          <div className="mt-6 flex flex-col gap-4">
                            <button
                              onClick={() => setShowHistTaskReview((v) => !v)}
                              aria-expanded={showHistTaskReview}
                              className="btn-secondary h-10 px-4 text-xs flex items-center justify-center gap-2 cursor-pointer self-start"
                            >
                              {showHistTaskReview
                                ? (language === "german" ? "Aufgaben-Bewertung ausblenden" : "Hide task-by-task")
                                : (language === "german" ? "Aufgabe für Aufgabe ansehen" : "Review task by task")}
                              <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${showHistTaskReview ? "rotate-180" : ""}`} strokeWidth={2} />
                            </button>
                            <AnimatePresence initial={false}>
                              {showHistTaskReview && (
                                <motion.div key="hist-review" variants={accordion} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                                  <div className="flex flex-col gap-4">
                                    {histPerTasks.map((a) => (
                                      <TaskReviewCard
                                        key={a.index}
                                        number={a.index}
                                        label={a.heading}
                                        assessment={a}
                                        language={language}
                                      />
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Review history: every graded attempt of this module (ReviewLog) */}
                  <div className="mt-8 pt-6 border-t border-(--hairline-card)">
                    <h4 className="caps-label mb-4 flex items-center gap-2">
                      <ClockIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                      {language === "german" ? "Bewertungs-Verlauf" : "Review history"}
                    </h4>

                    {historyLoading ? (
                      <div className="flex items-center gap-2 text-ink-400 text-xs py-2">
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                        {language === "german" ? "Verlauf wird geladen…" : "Loading history…"}
                      </div>
                    ) : !feedbackHistory || feedbackHistory.length === 0 ? (
                      <p className="text-ink-300 text-xs">
                        {language === "german" ? "Noch keine abgeschlossenen Bewertungen." : "No completed reviews yet."}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {feedbackHistory.map(entry => {
                          const isOpen = expandedHistoryIds.has(entry.id);
                          return (
                            <div key={entry.id} className="card-surface overflow-hidden">
                              <button
                                onClick={() => setExpandedHistoryIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
                                  return next;
                                })}
                                aria-expanded={entry.feedback ? isOpen : undefined}
                                disabled={!entry.feedback}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${entry.feedback ? "cursor-pointer hover:bg-paper-0" : "cursor-default"} press-row`}
                              >
                                <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border shrink-0 ${entry.passed ? "bg-(--grade-pass-wash) text-(--grade-pass-text) border-(--grade-pass-border)" : "bg-(--grade-fail-wash) text-(--grade-fail-text) border-(--grade-fail-border)"}`}>
                                  {entry.passed ? (language === "german" ? "Bestanden" : "Passed") : (language === "german" ? "Wiederholen" : "Repeat")}
                                </span>
                                <span className="text-[10px] font-semibold text-ink-600 bg-paper-2 px-2 py-0.5 rounded-full border border-(--hairline-card) shrink-0">
                                  Level {entry.level + 1}
                                </span>
                                <span className="text-xs text-ink-600 tnum flex-1 truncate">
                                  {new Date(entry.completedAt).toLocaleDateString(language === "german" ? "de-DE" : "en-GB")}{" "}
                                  <span className="text-ink-300">
                                    {new Date(entry.completedAt).toLocaleTimeString(language === "german" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </span>
                                {entry.feedback ? (
                                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={springTactile} className="shrink-0 text-ink-300">
                                    <ChevronDownIcon className="w-3.5 h-3.5" />
                                  </motion.span>
                                ) : (
                                  <span className="text-[9px] text-ink-400 shrink-0">{language === "german" ? "kein Brief" : "no brief"}</span>
                                )}
                              </button>
                              <AnimatePresence initial={false}>
                                {isOpen && entry.feedback && (
                                  <motion.div
                                    key="hist-body"
                                    variants={accordion}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    style={{ overflow: "hidden" }}
                                  >
                                    <div className="px-4 pb-4 pt-2.5 border-t border-(--hairline-card)">
                                      {(() => {
                                        const target = language === "german" ? "german" : "english";
                                        const trKey = `${entry.id}:${target}`;
                                        const translated = historyTranslations[trKey];
                                        const busy = historyTranslating[trKey];
                                        return (
                                          <>
                                            {busy && (
                                              <div className="flex items-center gap-1.5 text-[10px] text-ink-400 mb-2">
                                                <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                                {language === "german" ? "Übersetze…" : "Translating…"}
                                              </div>
                                            )}
                                            {translated && !showFeedbackOriginal && (
                                              <p className="text-[10px] text-ink-400 mb-2">
                                                {language === "german" ? "Automatisch übersetzt" : "Auto-translated"}
                                              </p>
                                            )}
                                            <div tabIndex={0} role="region" aria-label={language === "german" ? "Gutachter-Brief" : "Examiner's brief"} className="max-h-64 overflow-y-auto custom-scrollbar">
                                              {(() => {
                                                const entryText = translated && !showFeedbackOriginal ? translated : (entry.feedback ?? "");
                                                const { brief: eBrief, perTasks: ePerTasks } = splitFeedback(entryText);
                                                const openTasks = openReviewTasks.has(entry.id);
                                                return (
                                                  <>
                                                    <FeedbackBody text={eBrief || entryText} size="sm" />
                                                    {ePerTasks.length > 0 && (
                                                      <div className="mt-3">
                                                        <button
                                                          onClick={() => setOpenReviewTasks((prev) => { const n = new Set(prev); if (n.has(entry.id)) n.delete(entry.id); else n.add(entry.id); return n; })}
                                                          aria-expanded={openTasks}
                                                          className="inline-flex items-center gap-1.5 caps-label !text-(--accent-text-strong) cursor-pointer"
                                                        >
                                                          <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform duration-200 ${openTasks ? "rotate-180" : ""}`} strokeWidth={2} />
                                                          {language === "german" ? "Aufgabe für Aufgabe" : "Task by task"}
                                                        </button>
                                                        <AnimatePresence initial={false}>
                                                          {openTasks && (
                                                            <motion.div key="entry-tasks" variants={accordion} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                                                              <div className="flex flex-col gap-3 pt-3">
                                                                {ePerTasks.map((a) => (
                                                                  <TaskReviewCard key={a.index} number={a.index} label={a.heading} assessment={a} language={language} />
                                                                ))}
                                                              </div>
                                                            </motion.div>
                                                          )}
                                                        </AnimatePresence>
                                                      </div>
                                                    )}
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-ink-400 pt-1">
                          {language === "german"
                            ? "Einträge ohne Brief stammen aus der Zeit vor den gespeicherten Gutachter-Briefen."
                            : "Entries without a brief predate stored examiner's briefs."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </ModalDialog>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calendar Subscription Modal */}
        <AnimatePresence>
          {showCalendarModal && (
            <motion.div
              {...overlayMotion}
              className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-(--overlay) backdrop-blur-[3px]"
              onClick={() => setShowCalendarModal(false)}
            >
              <ModalDialog
                labelledBy="calendar-modal-title"
                className="card-glass p-6 md:p-8 max-w-[560px] w-full border border-(--line-soft) max-h-[85dvh] overflow-y-auto overscroll-contain custom-scrollbar"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 id="calendar-modal-title" className="font-display text-xl text-ink-900 tracking-[-0.015em]" style={{ fontWeight: 480 }}>
                    {language === "german" ? "Kalender-Sync" : "Calendar sync"}
                  </h3>
                  <Tip label={language === "german" ? "Schließen — Esc" : "Close — Esc"}>
                    <button onClick={() => setShowCalendarModal(false)} className="w-8 h-8 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-900 hover:bg-(--hairline) transition-colors cursor-pointer shrink-0">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </Tip>
                </div>

                <p className="text-sm text-ink-600 mb-7 leading-relaxed">
                  {language === "german"
                    ? "Einmal abonnieren — alle zukünftigen Wiederholungen erscheinen automatisch in deinem Kalender."
                    : "Subscribe once — all future reviews will automatically appear in your calendar."}
                </p>

                {/* Apple Calendar */}
                <div className="mb-5">
                  <h3 className="caps-label mb-2.5">Apple Calendar (Mac/iPhone)</h3>
                  <a
                    href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar?lang=${language}${calTokenAnd}`}
                    className="btn-secondary flex items-center justify-center gap-2 w-full py-3.5 text-sm"
                  >
                    <CalendarDaysIcon className="w-4 h-4 text-ink-600" />
                    {language === "german" ? "In Apple Kalender abonnieren" : "Subscribe in Apple Calendar"}
                  </a>

                </div>

                {/* Google Calendar */}
                <div className="mb-5">
                  <h3 className="caps-label mb-2.5">Google Calendar</h3>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/calendar?lang=${language}${calTokenAnd}`}
                      className="input-dark flex-1 px-4 py-2.5 text-xs font-mono truncate"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/calendar?lang=${language}${calTokenAnd}`)
                          .catch(() => addToast("error", language === "german" ? "Kopieren fehlgeschlagen." : "Copy failed."));
                        setCalendarUrlCopied(true);
                        setTimeout(() => setCalendarUrlCopied(false), 2000);
                      }}
                      className="btn-secondary px-4 py-2.5 text-xs font-medium flex items-center gap-2 cursor-pointer shrink-0"
                    >
                      {calendarUrlCopied ? <CheckIcon className="w-4 h-4 text-(--grade-pass-text)" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                      {calendarUrlCopied
                        ? (language === "german" ? "Kopiert!" : "Copied!")
                        : (language === "german" ? "Kopieren" : "Copy")}
                    </button>
                  </div>
                  <p className="text-xs text-ink-400 mt-2.5 ml-1 leading-relaxed">
                    {language === "german"
                      ? "Google Kalender → Weitere Kalender (+) → Per URL → URL oben einfügen."
                      : "Google Calendar → Other calendars (+) → From URL → Paste the URL above."}
                  </p>
                </div>

                {/* Done Calendar */}
                <div className="mb-5">
                  <h3 className="caps-label mb-2.5">
                    {language === "german" ? "Erledigt-Kalender (optional)" : "Done calendar (optional)"}
                  </h3>
                  <a
                    href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar/done${calTokenOnly}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-(--grade-pass-wash) hover:bg-(--grade-pass-wash) rounded-xl text-xs font-medium text-(--grade-pass-text) transition-all border border-(--grade-pass-border)"
                  >
                    <CalendarDaysIcon className="w-4 h-4" />
                    {language === "german" ? "Erledigt-Kalender abonnieren" : "Subscribe to done calendar"}
                  </a>
                  <p className="text-[10px] text-ink-400 mt-2.5 ml-1 leading-relaxed">
                    {language === "german"
                      ? "Deine erledigten Wiederholungen erscheinen als Kalendereinträge."
                      : "Your completed reviews appear as calendar entries."}
                  </p>
                </div>

                {/* One-time download fallback */}
                <div className="pt-5 border-t border-(--hairline-card)">
                  <a
                    href={`/api/calendar${calTokenOnly}`}
                    download="srs-reviews.ics"
                    className="flex items-center justify-center gap-1.5 w-full py-1 text-xs text-ink-400 hover:text-ink-600 transition-colors"
                    style={{ fontWeight: 550 }}
                  >
                    <DocumentTextIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                    {language === "german" ? ".ics-Datei herunterladen (Einmal-Import)" : "Download .ics file (one-time import)"}
                  </a>
                </div>
              </ModalDialog>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Settings / Semester Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            key="settings-overlay"
            {...overlayMotion}
            className="fixed inset-0 z-[80] bg-(--overlay) backdrop-blur-[3px] flex items-stretch justify-center sm:items-center sm:p-4"
            onClick={closeSettingsModal}
          >
            <ModalDialog
              labelledBy="settings-modal-title"
              className="card-glass w-full flex flex-col overflow-hidden border border-(--line-soft) max-sm:!rounded-none max-sm:h-full sm:max-w-[560px] sm:max-h-[85dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Pinned header — the body scrolls beneath it, so Close is always in
                  reach on the full-height mobile sheet. Safe-area top inset on mobile. */}
              <div className="shrink-0 flex justify-between items-start gap-3 px-5 sm:px-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:pt-8 short:!pt-4 pb-3 sm:pb-4 short:!pb-2">
                <div>
                  <h3 id="settings-modal-title" className="font-display text-xl text-ink-900 tracking-[-0.015em]" style={{ fontWeight: 480 }}>
                    {language === "german" ? "Einstellungen" : "Settings"}
                  </h3>
                  {/* Subtitle is nice-to-have; hidden on short (landscape-phone) screens
                      so the header doesn't dominate the centered card. */}
                  <p className="text-[13px] text-ink-600 mt-1.5 short:hidden">
                    {language === "german" ? "Semester, Module, Sprache und Stimme." : "Semester, modules, language, and voice."}
                  </p>
                </div>
                <Tip label={language === "german" ? "Schließen — Esc" : "Close — Esc"}>
                  <button
                    onClick={closeSettingsModal}
                    className="w-8 h-8 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-900 hover:bg-(--hairline) transition-colors cursor-pointer shrink-0"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </Tip>
              </div>

              {/* Pinned tab bar — four quiet pages instead of one long scroll. */}
              <div className="shrink-0 px-5 sm:px-8 pb-4 short:!pb-3 border-b border-(--hairline-card) overflow-x-auto">
                <div className="segmented" role="tablist" aria-label={language === "german" ? "Einstellungs-Bereiche" : "Settings sections"}>
                  {([
                    ["study", language === "german" ? "Studium" : "Study"],
                    ["appearance", language === "german" ? "Darstellung" : "Appearance"],
                    ["sync", "Sync"],
                    ["advanced", language === "german" ? "Erweitert" : "Advanced"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={settingsTab === id}
                      data-active={settingsTab === id}
                      onClick={() => {
                        setSettingsTab(id);
                        // Each tab starts at its own top — carried-over scroll reads as a glitch.
                        settingsBodyRef.current?.scrollTo({ top: 0, behavior: "instant" });
                      }}
                      className="segmented-item whitespace-nowrap"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable body — one tab panel visible at a time; the hidden ones
                  stay MOUNTED so toggles/fetch effects keep their state. */}
              <div ref={settingsBodyRef} className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-5 sm:px-8 py-6 sm:py-7 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
                {/* ── Appearance tab — theme & accent (APPEARANCE.md · 7a) ── */}
                <section role="tabpanel" className={settingsTab === "appearance" ? "space-y-6" : "hidden"}>
                <div>
                  <h5 className="caps-label mb-3">Theme</h5>
                  <p className="text-xs text-ink-600 mb-4">
                    {language === "german" ? "Wie dein Lernraum beleuchtet ist — speichert sich von selbst." : "How your study space is lit — it saves itself."}
                  </p>
                  <div className="flex gap-2.5">
                    {([
                      { mode: "paper" as const, label: "Paper", sub: language === "german" ? "Warm & hell" : "Warm & light" },
                      { mode: "ink" as const, label: "Ink", sub: language === "german" ? "Sanft um 23 Uhr" : "Kind at 11pm" },
                      { mode: "auto" as const, label: "Auto", sub: language === "german" ? "Folgt deinem System" : "Follows your system" },
                    ]).map(({ mode, label, sub }) => {
                      const selected = appearance.mode === mode;
                      const dot = ACCENT_PREVIEW_DOT[appearance.accent];
                      return (
                        <motion.button
                          key={mode}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => updateAppearance({ mode })}
                          aria-pressed={selected}
                          className="flex-1 min-w-0 text-left bg-paper-1 rounded-[14px] p-2 pb-3 cursor-pointer shadow-(--shadow-e1)"
                          style={{ border: `1px solid ${selected ? "var(--a-g2)" : "var(--hairline-card)"}`, transition: "border-color 300ms cubic-bezier(0.16,1,0.3,1), background-color 400ms cubic-bezier(0.16,1,0.3,1)" }}
                        >
                          {/* Mini previews DEPICT each theme — literal palette on purpose */}
                          {mode === "paper" && (
                            <div className="h-[62px] rounded-[8px] relative overflow-hidden" style={{ background: "#F6F3EC", border: "1px solid rgba(33,27,18,0.1)" }}>
                              <div className="absolute rounded-t-lg" style={{ left: 12, top: 13, right: 30, bottom: -6, background: "#FFFEFB", border: "1px solid rgba(33,27,18,0.09)", padding: "9px 10px 0 10px" }}>
                                <span className="block w-2 h-2 rounded-full" style={{ background: dot.paper, transition: "background-color 400ms cubic-bezier(0.16,1,0.3,1)" }} />
                                <span className="block h-[3px] w-[72%] rounded-full mt-2" style={{ background: "#E4DCCB" }} />
                                <span className="block h-[3px] w-[48%] rounded-full mt-[5px]" style={{ background: "#E4DCCB" }} />
                              </div>
                            </div>
                          )}
                          {mode === "ink" && (
                            <div className="h-[62px] rounded-[8px] relative overflow-hidden" style={{ background: "#1B1713", border: "1px solid rgba(33,27,18,0.16)" }}>
                              <div className="absolute rounded-t-lg" style={{ left: 12, top: 13, right: 30, bottom: -6, background: "#252019", border: "1px solid rgba(241,235,223,0.1)", padding: "9px 10px 0 10px" }}>
                                <span className="block w-2 h-2 rounded-full" style={{ background: dot.ink, transition: "background-color 400ms cubic-bezier(0.16,1,0.3,1)" }} />
                                <span className="block h-[3px] w-[72%] rounded-full mt-2" style={{ background: "#3E372D" }} />
                                <span className="block h-[3px] w-[48%] rounded-full mt-[5px]" style={{ background: "#3E372D" }} />
                              </div>
                            </div>
                          )}
                          {mode === "auto" && (
                            <div className="h-[62px] rounded-[8px] relative overflow-hidden flex" style={{ border: "1px solid rgba(33,27,18,0.12)" }}>
                              <div className="flex-1" style={{ background: "#F6F3EC", padding: "13px 0 0 12px" }}>
                                <span className="block w-2 h-2 rounded-full" style={{ background: dot.paper, transition: "background-color 400ms cubic-bezier(0.16,1,0.3,1)" }} />
                                <span className="block h-[3px] w-[26px] rounded-full mt-2" style={{ background: "#E4DCCB" }} />
                              </div>
                              <div className="flex-1" style={{ background: "#1B1713", padding: "13px 12px 0 10px" }}>
                                <span className="block h-[3px] w-[26px] rounded-full mt-4" style={{ background: "#3E372D" }} />
                                <span className="block h-[3px] w-[18px] rounded-full mt-[5px]" style={{ background: "#3E372D" }} />
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-2.5 mx-[5px]">
                            <span className="text-[13px] font-semibold text-ink-900">{label}</span>
                            <CheckIcon className="w-3 h-3 text-(--accent-text) shrink-0" strokeWidth={2.4} style={{ opacity: selected ? 1 : 0, transition: "opacity 250ms cubic-bezier(0.16,1,0.3,1)" }} />
                          </div>
                          <div className="text-[11px] text-ink-400 mt-1 mx-[5px]">{sub}</div>
                        </motion.button>
                      );
                    })}
                  </div>

                  <h5 className="caps-label mt-6 mb-3">{language === "german" ? "Akzent" : "Accent"}</h5>
                  <div className="flex items-center gap-4">
                    {APPEARANCE_ACCENTS.map((accent) => {
                      const sw = ACCENT_SWATCH[accent];
                      const [g1, g2, g3] = resolvedTheme === "ink" ? sw.ink : sw.paper;
                      const on = resolvedTheme === "ink" ? sw.onInk : sw.onPaper;
                      const selected = appearance.accent === accent;
                      return (
                        <Tip key={accent} label={ACCENT_COPY[accent].name}>
                        <motion.button
                          whileHover={{ scale: 1.09 }}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => updateAppearance({ accent })}
                          aria-pressed={selected}
                          aria-label={ACCENT_COPY[accent].name}
                          className="relative w-10 h-10 rounded-full cursor-pointer flex items-center justify-center shrink-0"
                          style={{
                            background: `linear-gradient(165deg, ${g1} 0%, ${g2} 58%, ${g3} 100%)`,
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,${accent === "graphite" && resolvedTheme === "paper" ? 0.25 : 0.35})`,
                          }}
                        >
                          {/* EL-14: selection ring as a compositor-only overlay (opacity + scale), not an animated box-shadow. The 3px paper gap shows the modal surface behind the transparent core. */}
                          <span
                            aria-hidden
                            className="absolute inset-[-5.5px] rounded-full pointer-events-none"
                            style={{
                              border: `2.5px solid ${g2}`,
                              opacity: selected ? 1 : 0,
                              transform: `scale(${selected ? 1 : 0.9})`,
                              transition: "opacity 200ms cubic-bezier(0.16,1,0.3,1), transform 300ms cubic-bezier(0.34,1.56,0.64,1)",
                            }}
                          />
                          <CheckIcon
                            className="w-[15px] h-[15px]"
                            strokeWidth={2.6}
                            style={{ color: on, opacity: selected ? 1 : 0, transform: `scale(${selected ? 1 : 0.4})`, transition: "opacity 200ms cubic-bezier(0.16,1,0.3,1), transform 300ms cubic-bezier(0.34,1.56,0.64,1)" }}
                          />
                        </motion.button>
                        </Tip>
                      );
                    })}
                  </div>
                  <p className="text-[13px] leading-[1.5] text-ink-600 mt-3.5 min-h-5">
                    <span className="text-ink-900" style={{ fontWeight: 650 }}>{ACCENT_COPY[appearance.accent].name}</span>{" "}
                    {language === "german" ? ACCENT_COPY[appearance.accent].de : ACCENT_COPY[appearance.accent].en}
                  </p>
                  <p className="text-xs text-ink-400 mt-2">
                    {language === "german" ? "Bestanden bleibt Salbei, Wiederholen bleibt Ton — Noten behalten ihre Farben in jedem Theme." : "Passed stays sage, repeat stays clay — grades keep their colours in every theme."}
                  </p>
                </div>
                </section>

                <section role="tabpanel" className={settingsTab === "study" ? "space-y-6" : "hidden"}>
                <div>
                  <h5 className="caps-label mb-3">{language === "german" ? "Aktuelles Semester" : "Current semester"}</h5>
                  <div className="bg-paper-0 border border-(--hairline) rounded-[14px] px-4 py-4 flex items-center justify-between">
                    <div>
                      <div className="font-display text-2xl font-medium text-ink-900">Semester {currentSemester}</div>
                      <div className="text-[13px] text-ink-600 mt-1">
                        {language === "german" ? "Aktiver Studienzeitraum" : "Active study period"}
                        {modulePresets.length > 0 && <> · {modulePresets.length} {language === "german" ? (modulePresets.length === 1 ? "Modul" : "Module") : (modulePresets.length === 1 ? "module" : "modules")}</>}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="caps-label mb-3">{language === "german" ? "Modul-Voreinstellungen" : "Module presets"}</h5>
                  <div className="space-y-2 mb-3">
                    {modulePresets.length === 0 ? (
                      <div className="text-ink-400 text-sm italic py-2">{language === "german" ? "Noch keine Module definiert." : "No modules defined yet."}</div>
                    ) : (
                      modulePresets.map((preset, idx) => (
                        <div key={idx} className="flex items-center justify-between h-11 bg-paper-0 border border-(--hairline) rounded-xl px-4">
                          <span className="text-ink-900 text-sm">{preset}</span>
                          <Tip label={language === "german" ? "Voreinstellung entfernen" : "Remove preset"}>
                            <button
                              onClick={() => {
                                const newPresets = modulePresets.filter((_, i) => i !== idx);
                                const prevSubject = subjectInput;
                                savePresets(newPresets, {
                                  onApply: () => { if (prevSubject === preset) setSubjectInput(newPresets[0] || ""); },
                                  onRollback: () => setSubjectInput(prevSubject),
                                });
                              }}
                              aria-label={language === "german" ? `${preset} entfernen` : `Remove ${preset}`}
                              className="w-8 h-8 -mr-2 flex items-center justify-center rounded-full text-ink-400 hover:text-(--grade-fail-text) transition-colors cursor-pointer"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </Tip>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPresetInput}
                      onChange={e => setNewPresetInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newPresetInput.trim()) {
                          const trimmed = newPresetInput.trim();
                          const prevSubject = subjectInput;
                          savePresets([...modulePresets, trimmed], {
                            onApply: () => { if (!prevSubject) setSubjectInput(trimmed); setNewPresetInput(""); },
                            // Put the typed name back so a failed save costs no retyping.
                            onRollback: () => { setSubjectInput(prevSubject); setNewPresetInput(trimmed); },
                          });
                        }
                      }}
                      placeholder={language === "german" ? "z.B. Lineare Algebra" : "e.g. Linear Algebra"}
                      className="input-dark flex-1 px-4 py-2.5 text-base sm:text-sm"
                    />
                    <button
                      onClick={() => {
                        if (newPresetInput.trim()) {
                          const trimmed = newPresetInput.trim();
                          const prevSubject = subjectInput;
                          savePresets([...modulePresets, trimmed], {
                            onApply: () => { if (!prevSubject) setSubjectInput(trimmed); setNewPresetInput(""); },
                            // Put the typed name back so a failed save costs no retyping.
                            onRollback: () => { setSubjectInput(prevSubject); setNewPresetInput(trimmed); },
                          });
                        }
                      }}
                      className="btn-secondary px-4 py-2.5 text-sm cursor-pointer"
                    >
                      {language === "german" ? "Hinzufügen" : "Add"}
                    </button>
                  </div>
                </div>

                <div>
                  <h5 className="caps-label mb-3">{language === "german" ? "Sprache" : "Language"}</h5>
                  <div className="segmented">
                    <button
                      onClick={() => {
                        // IS-7 — switch the UI language optimistically, revert on failure.
                        const prev = language;
                        setLanguage('german');
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_language', language: 'german' })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            setLanguage(prev);
                            addToast("error", `${prev === "german" ? "Fehler" : "Error"}: ${data.error}`);
                            return;
                          }
                          if (data.language) setLanguage(data.language);
                        }).catch(err => {
                          console.error(err);
                          setLanguage(prev);
                          addToast("error", prev === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
                        });
                      }}
                      className="segmented-item"
                      data-active={language === 'german'}
                      aria-pressed={language === 'german'}
                    >
                      Deutsch
                    </button>
                    <button
                      onClick={() => {
                        const prev = language;
                        setLanguage('english');
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_language', language: 'english' })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            setLanguage(prev);
                            addToast("error", `${prev === "german" ? "Fehler" : "Error"}: ${data.error}`);
                            return;
                          }
                          if (data.language) setLanguage(data.language);
                        }).catch(err => {
                          console.error(err);
                          setLanguage(prev);
                          addToast("error", prev === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
                        });
                      }}
                      className="segmented-item"
                      data-active={language === 'english'}
                      aria-pressed={language === 'english'}
                    >
                      English
                    </button>
                  </div>
                </div>

                </section>

                <section role="tabpanel" className={settingsTab === "sync" ? "space-y-6" : "hidden"}>
                {/* IA-12 — notifications live in Settings now (they were the only
                    non-navigating "nav item"). The iOS add-to-home-screen guidance,
                    previously only a transient error toast, is stated inline. */}
                <div>
                  <h5 className="caps-label mb-3">{language === "german" ? "Mitteilungen" : "Notifications"}</h5>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {pushPermission === "granted" && pushSubscribed ? (
                        <BellIcon className="w-[18px] h-[18px] shrink-0 text-ink-400" strokeWidth={1.6} />
                      ) : (
                        <BellSlashIcon className="w-[18px] h-[18px] shrink-0 text-ink-400" strokeWidth={1.6} />
                      )}
                      <span className="text-sm text-ink-900 font-medium">
                        {pushBusy
                          ? language === "german" ? "Einen Moment…" : "One moment…"
                          : pushPermission === "granted" && pushSubscribed
                          ? language === "german" ? "Mitteilungen an" : "Notifications on"
                          : pushPermission === "denied"
                          ? language === "german" ? "Mitteilungen blockiert" : "Notifications blocked"
                          : language === "german" ? "Mitteilungen aus" : "Notifications off"}
                      </span>
                    </div>
                    <button
                      onClick={togglePush}
                      role="switch"
                      aria-checked={pushPermission === "granted" && pushSubscribed}
                      aria-busy={pushBusy}
                      disabled={pushBusy}
                      aria-label={language === "german" ? "Mitteilungen umschalten" : "Toggle notifications"}
                      className="shrink-0 cursor-pointer disabled:cursor-wait p-2 -m-2"
                    >
                      <span className={`w-9 h-[22px] rounded-full relative inline-block transition-colors ${pushPermission === "granted" && pushSubscribed ? "bg-ink-900" : "bg-[color-mix(in_srgb,var(--foreground)_18%,transparent)]"}`}>
                        {/* IS-12 — knob pulses in place while the async subscribe/unsubscribe is in flight. */}
                        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-paper-1 transition-transform ${pushBusy ? "animate-pulse" : ""} ${pushPermission === "granted" && pushSubscribed ? "right-[3px]" : "left-[3px]"}`}></span>
                      </span>
                    </button>
                  </div>
                  <p className="text-xs text-ink-600 mt-3 leading-relaxed">
                    {language === "german"
                      ? "Wir erinnern dich, wenn Wiederholungen fällig sind. Auf dem iPhone/iPad zuerst über Teilen → Zum Home-Bildschirm hinzufügen, dann hier aktivieren."
                      : "We'll remind you when reviews are due. On iPhone/iPad, first add the app via Share → Add to Home Screen, then enable it here."}
                  </p>
                  {pushPermission === "denied" && (
                    <p className="text-xs text-(--grade-fail-text) mt-2 leading-relaxed">
                      {language === "german"
                        ? "In den Browser- oder Systemeinstellungen sind Mitteilungen für diese Seite blockiert."
                        : "Notifications are blocked for this site in your browser or system settings."}
                    </p>
                  )}
                </div>

                {/* IA-14 — a stable home for calendar sync. Its only other entry point lives
                    inside the dashboard's "Upcoming" section, so a brand-new or fully-caught-up
                    user (no scheduled items) otherwise has no path to it — and no way back to
                    unsubscribe or re-copy the URL. */}
                <div>
                  <h5 className="caps-label mb-3">{language === "german" ? "Kalender" : "Calendar"}</h5>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <CalendarDaysIcon className="w-[18px] h-[18px] shrink-0 text-ink-400" strokeWidth={1.6} />
                      <span className="text-sm text-ink-900 font-medium">
                        {language === "german" ? "Wiederholungen im Kalender" : "Reviews in your calendar"}
                      </span>
                    </div>
                    <button
                      onClick={() => { closeSettingsModal(); setShowCalendarModal(true); }}
                      className="shrink-0 text-[13px] font-semibold text-(--accent-text) hover:text-(--accent-text-strong) transition-colors cursor-pointer"
                    >
                      {language === "german" ? "Synchronisieren" : "Sync"}
                    </button>
                  </div>
                  <p className="text-xs text-ink-600 mt-3 leading-relaxed">
                    {language === "german"
                      ? "Abonniere deine fälligen Wiederholungen einmal — sie erscheinen dann automatisch in deinem Kalender."
                      : "Subscribe to your due reviews once — they then appear in your calendar automatically."}
                  </p>
                </div>

                </section>

                {/* IA-13/LIVE-9 — dictation, AI connection and PDF delivery are
                    developer plumbing; they used to hide behind an "Erweitert"
                    disclosure and now live on their own tab instead. The first
                    child drops its divider — the tab bar already separates. */}
                <section role="tabpanel" className={settingsTab === "advanced" ? "" : "hidden"}>
                        <div className="space-y-7 [&>div:first-child]:!border-t-0 [&>div:first-child]:!pt-0">

                <div className="pt-6 border-t border-(--hairline-card)">
                  <h5 className="caps-label mb-3">{language === "german" ? "Interaktiver Modus · Diktat" : "Interactive mode · dictation"}</h5>
                  <p className="text-xs text-ink-600 mb-4 leading-relaxed">
                    {language === "german"
                      ? "Hybrid (empfohlen): Die Browser-Diktierfunktion schreibt sofort mit — sagst du „nächste Aufgabe“, ersetzt die KI-Transkription deine Antwort automatisch in besserer Qualität. Gemini: nur KI (verzögert, aber zuverlässig auf dem iPhone). Standard: nur Browser (sofort, ohne KI-Korrektur)."
                      : "Hybrid (recommended): browser dictation types instantly — when you say “next task”, the AI transcription automatically replaces your answer with a higher-quality version. Gemini: AI only (delayed, but reliable on iPhone). Standard: browser only (instant, no AI polish)."}
                  </p>
                  <div className="segmented">
                    <button
                      onClick={() => updateDictationMode("hybrid")}
                      className="segmented-item whitespace-nowrap"
                      data-active={dictationMode === 'hybrid'}
                      aria-pressed={dictationMode === 'hybrid'}
                    >
                      Hybrid
                    </button>
                    <button
                      onClick={() => updateDictationMode("gemini")}
                      className="segmented-item whitespace-nowrap"
                      data-active={dictationMode === 'gemini'}
                      aria-pressed={dictationMode === 'gemini'}
                    >
                      Gemini
                    </button>
                    <button
                      onClick={() => updateDictationMode("browser")}
                      className="segmented-item whitespace-nowrap"
                      data-active={dictationMode === 'browser'}
                      aria-pressed={dictationMode === 'browser'}
                    >
                      Browser
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-(--hairline-card)">
                  <h5 className="caps-label mb-3">{language === "german" ? "KI-Modell" : "AI model"}</h5>
                  <p className="text-xs text-ink-600 mb-4 leading-relaxed">
                    {language === "german"
                      ? "Standard-Modell für alle KI-Schritte. Modell und Wrapper einzelner Schritte kannst du im Popup pro Schritt überschreiben."
                      : "Default model for every AI step. Override the model and the wrapper of individual steps in the popup."}
                  </p>
                  <div className="segmented">
                    {MODEL_OPTIONS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => updateAiModel(m.id)}
                        className="segmented-item whitespace-nowrap"
                        data-active={aiModel === m.id}
                        aria-pressed={aiModel === m.id}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowStepCustomize(true)}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-(--line) bg-paper-1 hover:bg-paper-2 text-[13px] font-semibold text-ink-900 transition-colors cursor-pointer"
                    >
                      {language === "german" ? "Pro KI-Schritt anpassen" : "Customise per step"}
                      <ChevronDownIcon className="w-3.5 h-3.5 -rotate-90 text-ink-400" strokeWidth={2} />
                    </button>
                    <a
                      href="https://aistudio-api-150434442017.europe-west1.run.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-(--accent-text) hover:text-(--accent-text-strong) transition-colors cursor-pointer"
                      style={{ fontWeight: 550 }}
                    >
                      {language === "german" ? "Proxy-Admin öffnen" : "Open proxy admin"}
                      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div className="pt-6 border-t border-(--hairline-card)">
                  <h5 className="caps-label mb-3">{language === "german" ? "Proxy: PDF-Übertragung" : "Proxy: PDF delivery"}</h5>
                  <p className="text-xs text-ink-600 mb-4 leading-relaxed">
                    {language === "german"
                      ? "Gilt nur für den Gemini Proxy — die offizielle Gemini API nutzt immer ihren nativen File-Upload. Inline schickt PDFs als Base64 direkt in der Proxy-Anfrage mit (zuverlässig bis ~14 MB, unabhängig vom Proxy-Konto). File-Upload lädt die Datei einmal über den Upload-Proxy hoch und verweist nur noch darauf — spart Bandbreite bei mehreren Schritten, hängt aber am Proxy-Konto, das die Datei hochgeladen hat."
                      : "Applies only to the Gemini proxy — the official Gemini API always uses its native file upload. Inline embeds PDFs as base64 in the proxy request itself (reliable up to ~14 MB, independent of the proxy account). File upload pushes the file once through the upload proxy and references it — saves bandwidth across steps, but is tied to the proxy account that uploaded it."}
                  </p>
                  {(isGenerating || isGrading) && (
                    <div className="mb-4 text-xs font-semibold text-ink-600 flex items-center gap-2">
                      <LockClosedIcon className="w-3.5 h-3.5" />
                      {language === "german" ? "Einstellungen gesperrt, während eine KI-Aktion läuft." : "Settings locked while an AI task is running."}
                    </div>
                  )}
                  <div className="segmented">
                    <button
                      disabled={isGenerating || isGrading}
                      onClick={() => updateFileTransport("inline")}
                      className={`segmented-item ${(isGenerating || isGrading) ? 'opacity-50 !cursor-not-allowed' : ''}`}
                      data-active={fileTransport === "inline"}
                      aria-pressed={fileTransport === "inline"}
                    >
                      {language === "german" ? "Inline (Base64)" : "Inline (base64)"}
                    </button>
                    <button
                      disabled={isGenerating || isGrading}
                      onClick={() => updateFileTransport("file_api")}
                      className={`segmented-item ${(isGenerating || isGrading) ? 'opacity-50 !cursor-not-allowed' : ''}`}
                      data-active={fileTransport === "file_api"}
                      aria-pressed={fileTransport === "file_api"}
                    >
                      {language === "german" ? "File-Upload" : "File upload"}
                    </button>
                  </div>
                </div>

                        </div>
                </section>

                {/* Danger zone — rendered on the Study tab (it changes semester
                    state), below the study sections. */}
                <div className={settingsTab === "study" ? "pt-8 border-t border-(--grade-fail-border)" : "hidden"}>
                  <h4 className="caps-label !text-(--grade-fail-text) mb-2">{language === "german" ? "Semesterwechsel" : "Semester change"}</h4>
                  <p className="text-ink-600 text-xs mb-4 leading-relaxed">{language === "german" ? "Der Start eines neuen Semesters erhöht den Semesterzähler und löscht deine aktuellen Modul-Voreinstellungen." : "Starting a new semester will increment your semester counter and wipe your current module presets so you can start fresh."}</p>
                  <button
                    onClick={() => {
                      // Two-step confirmation instead of a blocking confirm().
                      if (!confirmingNewSemester) {
                        setConfirmingNewSemester(true);
                        setConfirmingResetSemester(false);
                        return;
                      }
                      setConfirmingNewSemester(false);
                      runSemesterAction('new_semester');
                    }}
                    disabled={isSemesterActionBusy}
                    className={`w-full py-3.5 text-(--grade-fail-text) border rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2 cursor-pointer disabled:opacity-50 disabled:cursor-wait ${confirmingNewSemester ? 'bg-(--grade-fail-wash-strong) border-(--grade-fail-border)' : 'bg-(--grade-fail-wash) hover:bg-(--grade-fail-wash-strong) border-(--grade-fail-border) hover:border-(--grade-fail-border)'}`}
                  >
                    {isSemesterActionBusy ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <ExclamationTriangleIcon className="w-4 h-4" />
                    )}
                    {confirmingNewSemester
                      ? (language === "german" ? "Wirklich? Erneut klicken zum Bestätigen" : "Are you sure? Click again to confirm")
                      : (language === "german" ? `Neues Semester starten (Semester ${currentSemester + 1})` : `Start New Semester (Semester ${currentSemester + 1})`)}
                  </button>
                  <button
                    onClick={() => {
                      // Two-step confirmation instead of a blocking confirm().
                      if (!confirmingResetSemester) {
                        setConfirmingResetSemester(true);
                        setConfirmingNewSemester(false);
                        return;
                      }
                      setConfirmingResetSemester(false);
                      runSemesterAction('reset_semester');
                    }}
                    disabled={isSemesterActionBusy}
                    className={`w-full py-2.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-wait ${confirmingResetSemester ? 'bg-(--grade-fail-wash-strong) text-(--grade-fail-text) border border-(--grade-fail-border)' : 'bg-transparent hover:bg-(--grade-fail-wash) text-ink-600 hover:text-(--grade-fail-text) border border-transparent hover:border-(--grade-fail-border)'}`}
                  >
                    {confirmingResetSemester
                      ? (language === "german" ? "Wirklich auf Semester 1 zurücksetzen? Erneut klicken" : "Really reset to Semester 1? Click again")
                      : (language === "german" ? "Auf Semester 1 zurücksetzen" : "Reset to Semester 1")}
                  </button>
                </div>
              </div>
            </ModalDialog>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Per-step Customise popup: wrapper on/off + model per Gemini step */}
      <AnimatePresence>
        {showStepCustomize && (
          <motion.div
            key="step-customize-overlay"
            {...overlayMotion}
            className="fixed inset-0 z-[85] bg-(--overlay) backdrop-blur-[3px] flex items-stretch justify-center sm:items-center sm:p-4"
            onClick={() => setShowStepCustomize(false)}
          >
            <ModalDialog
              labelledBy="step-customize-title"
              className="card-glass w-full flex flex-col overflow-hidden border border-(--line-soft) max-sm:!rounded-none max-sm:h-full sm:max-w-[600px] sm:max-h-[85dvh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 flex justify-between items-start gap-3 px-5 sm:px-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:pt-8 pb-4 border-b border-(--hairline-card)">
                <div>
                  <h3 id="step-customize-title" className="font-display text-xl text-ink-900 tracking-[-0.015em]" style={{ fontWeight: 480 }}>
                    {language === "german" ? "Pro KI-Schritt" : "Per AI step"}
                  </h3>
                  <p className="text-[13px] text-ink-600 mt-1.5">
                    {language === "german" ? "Wrapper und Modell je Gemini-Schritt. „Standard“ = Standard-Modell." : "Wrapper and model per Gemini step. “Default” = the default model."}
                  </p>
                </div>
                <Tip label={language === "german" ? "Schließen — Esc" : "Close — Esc"}>
                  <button onClick={() => setShowStepCustomize(false)} className="w-8 h-8 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-900 hover:bg-(--hairline) transition-colors cursor-pointer shrink-0">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </Tip>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-5 sm:px-8 py-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
                {(isGenerating || isGrading) && (
                  <div className="mb-4 text-xs font-semibold text-ink-600 flex items-center gap-2">
                    <LockClosedIcon className="w-3.5 h-3.5" />
                    {language === "german" ? "Gesperrt, während eine KI-Aktion läuft." : "Locked while an AI task is running."}
                  </div>
                )}
                <div className="flex items-center gap-3 px-3 pb-1.5">
                  <span className="flex-1 caps-label !text-ink-400">{language === "german" ? "Schritt" : "Step"}</span>
                  <span className="w-16 text-center caps-label !text-ink-400">Wrapper</span>
                  <span className="w-[128px] caps-label !text-ink-400">{language === "german" ? "Modell" : "Model"}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {WRAPPER_STEPS.map(step => {
                    const on = !!wrapperModules[step.key];
                    const model = stepModels[step.key] || "default";
                    const locked = isGenerating || isGrading;
                    return (
                      <div key={step.key} className="flex items-center gap-3 px-3 h-12 rounded-xl border border-(--hairline-card) bg-paper-1">
                        <span className="flex-1 text-[13px] font-medium text-ink-900 truncate">{language === "german" ? step.de : step.en}</span>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => toggleWrapperModule(step.key)}
                          aria-pressed={on}
                          aria-label={`Wrapper ${language === "german" ? step.de : step.en}`}
                          className={`w-16 flex justify-center ${locked ? "opacity-50 !cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${on ? "bg-(--a-g2) border-transparent" : "border-(--line)"}`}>
                            {on && <CheckIcon className="w-3.5 h-3.5 text-(--accent-on)" strokeWidth={2.5} />}
                          </span>
                        </button>
                        <select
                          disabled={locked}
                          value={model}
                          onChange={(e) => updateStepModel(step.key, e.target.value)}
                          aria-label={`${language === "german" ? "Modell" : "Model"} ${language === "german" ? step.de : step.en}`}
                          className="input-dark w-[128px] h-9 px-2 text-[13px] shrink-0 disabled:opacity-50"
                        >
                          <option value="default">{language === "german" ? "Standard" : "Default"}</option>
                          {MODEL_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ModalDialog>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AX-5 — one polite live region: grading progress and the verdict (the
          app's earned moment) are announced to screen readers. */}
      <div className="sr-only" role="status" aria-live="polite">
        {(() => {
          const de = language === "german";
          if (isGrading) return gradingMsg || (de ? "Bewertung läuft…" : "Grading in progress…");
          if (gradingResult) {
            const when = gradingResult.nextReviewDate
              ? new Date(gradingResult.nextReviewDate).toLocaleDateString(de ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long" })
              : null;
            if (gradingResult.comprehension) {
              const score = gradingResult.comprehensionScore !== null && gradingResult.comprehensionScore !== undefined
                ? fmtPercent(gradingResult.comprehensionScore, language)
                : null;
              return de
                ? `Verständnis-Check abgeschlossen${score ? ` — ${score}` : ""}.`
                : `Comprehension check finished${score ? ` — ${score}` : ""}.`;
            }
            const level = gradingResult.currentLevel !== null ? gradingResult.currentLevel + 1 : null;
            return gradingResult.isPass
              ? (de
                  ? `Bestanden${level ? ` — Level ${level} freigeschaltet` : ""}.${when ? ` Nächste Wiederholung am ${when}.` : ""}`
                  : `Passed${level ? ` — level ${level} unlocked` : ""}.${when ? ` Next review on ${when}.` : ""}`)
              : (de
                  ? `Wiederholen.${when ? ` Kommt zurück am ${when}.` : ""}`
                  : `Repeat.${when ? ` Comes back on ${when}.` : ""}`);
          }
          if (isGenerating) return progressMsg;
          return "";
        })()}
      </div>

      {/* Toast notifications (non-blocking alert replacement) */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} language={language} />

      {/* Prompts list — one quiet entry point for a lecture's debug prompts */}
      <AnimatePresence>
        {promptsModal && (
          <motion.div
            {...overlayMotion}
            key="prompts-list-backdrop"
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-(--overlay) backdrop-blur-[3px]"
            onClick={() => setPromptsModal(null)}
          >
            <ModalDialog
              key="prompts-list-modal"
              labelledBy="prompts-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="card-glass border border-(--line-soft) w-full max-w-md max-h-[85dvh] flex flex-col overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-(--hairline-card)">
                <div className="min-w-0">
                  <p className="caps-label mb-1">Prompts</p>
                  <h3 id="prompts-modal-title" className="text-[15px] font-semibold text-ink-900 truncate">{promptsModal.title}</h3>
                </div>
                <Tip label={language === "german" ? "Schließen — Esc" : "Close — Esc"}>
                  <button
                    onClick={() => setPromptsModal(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-900 hover:bg-(--hairline) transition-colors cursor-pointer shrink-0"
                  >
                    <XMarkIcon className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                </Tip>
              </div>
              <div className="p-6 md:p-8 flex flex-col gap-2 overflow-y-auto overscroll-contain custom-scrollbar">
                {promptsModal.prompts.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPromptModal({ title: `${p.label} — ${promptsModal.title}`, content: p.content })}
                    className="w-full flex items-center gap-3 bg-paper-0 hover:bg-(--paper-hover) border border-(--hairline-card) rounded-xl px-4 py-3 text-left transition-colors cursor-pointer group/pr press-row"
                  >
                    <DocumentTextIcon className="w-4 h-4 text-ink-400 shrink-0" strokeWidth={1.6} />
                    <span className="flex-1 text-[13px] font-medium text-ink-900">{p.label}</span>
                    <ChevronRightIcon className="w-3.5 h-3.5 text-ink-300 group-hover/pr:text-ink-600 transition-colors shrink-0" strokeWidth={2} />
                  </button>
                ))}
                <p className="text-[11px] text-ink-400 px-1 pt-1.5">
                  {language === "german" ? "Zum Debuggen — öffnet den Prompt-Viewer." : "For debugging — opens the prompt viewer."}
                </p>
              </div>
            </ModalDialog>
          </motion.div>
        )}

        {/* Verständnis-Check feedback viewer — latest run only (overwritten per run) */}
        {compFeedback && (
          <motion.div
            {...overlayMotion}
            key="comp-feedback-backdrop"
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-(--overlay) backdrop-blur-[3px]"
            onClick={() => setCompFeedback(null)}
          >
            <ModalDialog
              key="comp-feedback-modal"
              labelledBy="comp-feedback-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="card-glass border border-(--line-soft) w-full max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-(--hairline-card)">
                <div className="min-w-0">
                  <p className="caps-label mb-1">{language === "german" ? "Verständnis-Check" : "Comprehension check"}</p>
                  <h3 id="comp-feedback-modal-title" className="text-[15px] font-semibold text-ink-900 truncate">{compFeedback.subjectSub}</h3>
                  <div className="flex items-center gap-2.5 mt-2">
                    <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border shrink-0 ${compFeedback.comprehensionPassed ? "bg-(--grade-pass-wash) text-(--grade-pass-text) border-(--grade-pass-border)" : "bg-(--grade-fail-wash) text-(--grade-fail-text) border-(--grade-fail-border)"}`}>
                      {compFeedback.comprehensionPassed ? (language === "german" ? "Bestanden" : "Passed") : (language === "german" ? "Wiederholen" : "Repeat")}
                    </span>
                    {typeof compFeedback.comprehensionScore === "number" && (
                      <span className={`text-xs font-semibold tnum ${compFeedback.comprehensionPassed ? "text-(--grade-pass-text)" : "text-(--grade-fail-text)"}`}>
                        {fmtPercent(compFeedback.comprehensionScore, language)}
                      </span>
                    )}
                    {compFeedback.comprehensionAt && (
                      <span className="text-[11px] text-ink-400 tnum">{new Date(compFeedback.comprehensionAt).toLocaleDateString(language === "german" ? "de-DE" : "en-GB")}</span>
                    )}
                  </div>
                </div>
                <Tip label={language === "german" ? "Schließen — Esc" : "Close — Esc"}>
                  <button
                    onClick={() => setCompFeedback(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-900 hover:bg-(--hairline) transition-colors cursor-pointer shrink-0"
                  >
                    <XMarkIcon className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                </Tip>
              </div>
              <div className="p-6 md:p-8 overflow-y-auto overscroll-contain custom-scrollbar">
                {/* Revisit the answered check: questions, your answers and the
                    assessment side by side, per-task tutor included. */}
                <button
                  onClick={() => openRevisit(compFeedback, true)}
                  disabled={revisitLoading === compFeedback.id}
                  className="w-full mb-6 btn-secondary h-10 px-4 text-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-wait disabled:opacity-60"
                >
                  {revisitLoading === compFeedback.id
                    ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" strokeWidth={1.6} />
                    : <AcademicCapIcon className="w-3.5 h-3.5" strokeWidth={1.6} />}
                  {language === "german" ? "Check mit deinen Antworten ansehen" : "Revisit check with your answers"}
                </button>
                {compFeedback.comprehensionFeedback ? (
                  <FeedbackBody text={compFeedback.comprehensionFeedback} size="sm" />
                ) : (
                  <p className="text-sm text-ink-400">
                    {language === "german" ? "Kein Feedback gespeichert." : "No feedback stored."}
                  </p>
                )}
              </div>
            </ModalDialog>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prompt viewer modal — podcast prompts & video scripts */}
      <AnimatePresence>
        {promptModal && (
          <motion.div
            {...overlayMotion}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-(--overlay) backdrop-blur-[3px]"
            onClick={() => setPromptModal(null)}
          >
            <ModalDialog
              labelledBy="prompt-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="card-glass border border-(--line-soft) w-full max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-(--hairline-card)">
                <div className="min-w-0">
                  <p className="eyebrow mb-1">{language === "german" ? "Prompt" : "Prompt"}</p>
                  <h3 id="prompt-modal-title" className="font-display text-base font-medium text-ink-900 truncate">{promptModal.title}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(promptModal.content)
                        .then(() => addToast("success", language === "german" ? "Kopiert!" : "Copied!"))
                        .catch(() => addToast("error", language === "german" ? "Kopieren fehlgeschlagen." : "Copy failed."));
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-400/[0.1] hover:bg-(--accent-wash) border border-(--accent-border-soft) hover:border-(--accent-border) text-(--accent-text-strong) transition-all cursor-pointer"
                  >
                    {language === "german" ? "Kopieren" : "Copy"}
                  </button>
                  <Tip label={language === "german" ? "Schließen — Esc" : "Close — Esc"}>
                    <button
                      onClick={() => setPromptModal(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-[10px] text-ink-400 hover:text-ink-900 hover:bg-(--hairline) transition-colors cursor-pointer shrink-0"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </Tip>
                </div>
              </div>
              {/* Body — AX-15: tabIndex/role make this multi-page prompt reachable by
                  arrow/PageDown keys in Safari/Firefox (Chrome makes it focusable heuristically). */}
              <div tabIndex={0} role="region" aria-label={promptModal.title} className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-6 md:p-8">
                <pre className="text-sm text-ink-900/80 leading-relaxed whitespace-pre-wrap font-sans">{promptModal.content}</pre>
              </div>
            </ModalDialog>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
    </MotionConfig>
  );
}
