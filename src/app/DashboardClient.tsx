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
  EASE_OUT,
  DUR,
  springSoft,
  springTactile,
} from "@/lib/motion";
import {
  CpuChipIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  SparklesIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  ArrowLeftIcon,
  XMarkIcon,
  Bars3Icon,
  AcademicCapIcon,
  ChevronDownIcon,
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
} from "@heroicons/react/24/outline";

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from "react";

import { useToasts, ToastStack } from "./components/Toast";

const LIB_LEVEL_SHORT = ["T1", "T3", "T7", "T21", "T60", "T180", "T365"] as const;
const LIB_LEVEL_FULL  = ["Tag 1", "Tag 3", "Tag 7", "Tag 21", "Tag 60", "Tag 180", "Tag 365"] as const;

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
}

/** Display wrapper around a RawReviewItem produced by formatItems(). */
interface ReviewCard {
  id: string;
  subject: string;
  topic: string;
  level: number;
  dueDate: string;
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
}

interface NdjsonEvent {
  event: "progress" | "done" | "error";
  data: {
    step?: number;
    message?: string;
    success?: boolean;
    isPass?: boolean;
    feedback?: string;
    srsItem?: RawReviewItem;
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
  const chunks = studentQuizText.split(/(?=Aufgabe \d+)/i);
  const tasks: { id: string; header: string; label: string; questionText: string }[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith("Aufgabe") || /^[a-zA-Z]+ \d+/i.test(trimmed)) {
      const lines = trimmed.split("\n");
      const headerLine = lines[0];
      const taskNameMatch = headerLine.match(/Aufgabe \d+/i);
      const taskName = taskNameMatch ? taskNameMatch[0] : "Aufgabe";
      const label = headerLine.replace(/:\s*$/, "").trim();

      let cleanQuestionText = trimmed;
      if (cleanQuestionText.startsWith(headerLine)) {
        cleanQuestionText = cleanQuestionText.substring(headerLine.length).trim();
      }

      tasks.push({
        // Suffix with the position so tasks that don't match "Aufgabe N" (and
        // fall back to the literal "Aufgabe") can't collide on the same id — a
        // collision made their answer fields mirror each other and produced
        // duplicate React keys. Ids are internal (keys + answer map), never shown.
        id: `${taskName.toLowerCase().replace(/\s+/g, "")}-${tasks.length}`,
        header: taskName + ":",
        label: label,
        questionText: cleanQuestionText
      });
    }
  }
  return tasks;
};

const formatItems = (data: RawReviewItem[]): ReviewCard[] => {
  if (!Array.isArray(data)) return [];

  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const formatted = data.map(item => {
    const dueDate = new Date(item.nextReviewDate);
    const itemDateUTC = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()));
    const isDue = itemDateUTC <= todayUTC;

    const formattedDate = `${dueDate.getUTCDate().toString().padStart(2, '0')}.${(dueDate.getUTCMonth() + 1).toString().padStart(2, '0')}.${dueDate.getUTCFullYear()}`;

    return {
      id: item.id,
      subject: item.subjectMain,
      topic: item.subjectSub,
      level: item.currentLevel,
      dueDate: isDue ? "Due Now" : formattedDate,
      isDue,
      semester: item.semester || 1,
      raw: item
    };
  });

  // Sort logic: Due items first, then group by module, then by urgency
  formatted.sort((a, b) => {
    if (a.isDue && !b.isDue) return -1;
    if (!a.isDue && b.isDue) return 1;

    const subjectCompare = a.subject.localeCompare(b.subject);
    if (subjectCompare !== 0) return subjectCompare;

    return new Date(a.raw.nextReviewDate).getTime() - new Date(b.raw.nextReviewDate).getTime();
  });

  return formatted;
};

export default function DashboardClient({ initialItems, vapidPublicKey }: { initialItems: RawReviewItem[]; vapidPublicKey?: string | null }) {
  // `startTransition` marks background refetch state updates as non-urgent so
  // React never interrupts an ongoing animation to apply them — no more blink.
  const [, startTransition] = useTransition();

  const [upcomingReviews, setUpcomingReviews] = useState<ReviewCard[]>(initialItems ? formatItems(initialItems) : []);
  /** Full raw items — kept in sync with every fetchReviews() so the Library always shows live data. */
  const [rawItems, setRawItems] = useState<RawReviewItem[]>(initialItems ?? []);
  /** True only on first mount when we have no SSR items — shows skeleton cards while the first API fetch runs. */
  const [isLoadingReviews, setIsLoadingReviews] = useState(initialItems.length === 0);
  /** Cards whose study-materials section is expanded. */
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  // Toasts (non-blocking replacement for alert())
  const { toasts, addToast, dismissToast } = useToasts();

  const [subjectInput, setSubjectInput] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Semester & Settings State
  const [currentSemester, setCurrentSemester] = useState<number>(1);
  const [modulePresets, setModulePresets] = useState<string[]>([]);
  const [language, setLanguage] = useState<string>("german");
  const [wrapperMode, setWrapperMode] = useState<string>("all");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [newPresetInput, setNewPresetInput] = useState("");

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setCurrentSemester(data.currentSemester);
          if (data.modulePresets) setModulePresets(data.modulePresets);
          if (data.language) setLanguage(data.language);
          if (data.wrapperMode) setWrapperMode(data.wrapperMode);
          if (data.modulePresets && data.modulePresets.length > 0) {
            setSubjectInput(data.modulePresets[0]);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Quiz taking state
  const [selectedReview, setSelectedReview] = useState<ReviewCard | null>(null);
  const [studentAnswers, setStudentAnswers] = useState("");
  const [parsedTasks, setParsedTasks] = useState<ReturnType<typeof parseQuizTasks>>([]);
  const [individualAnswers, setIndividualAnswers] = useState<Record<string, string>>({});
  const [isGrading, setIsGrading] = useState(false);
  const [showAllScheduled, setShowAllScheduled] = useState(false);
  const [gradingStep, setGradingStep] = useState(0);
  const [gradingMsg, setGradingMsg] = useState("");
  const [gradingError, setGradingError] = useState("");
  const [gradingResult, setGradingResult] = useState<GradingOutcome | null>(null);

  // Inline delete confirmation (two-step button) + per-item busy state
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});

  // Two-step confirmation state for the semester danger-zone buttons
  const [confirmingNewSemester, setConfirmingNewSemester] = useState(false);
  const [confirmingResetSemester, setConfirmingResetSemester] = useState(false);
  const [isSemesterActionBusy, setIsSemesterActionBusy] = useState(false);

  // Historical feedback modal
  const [activeFeedbackItem, setActiveFeedbackItem] = useState<RawReviewItem | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarUrlCopied, setCalendarUrlCopied] = useState(false);
  const [archiveModalData, setArchiveModalData] = useState<{level: number, url: string, date?: string}[] | null>(null);

  // Podcast State
  const [generatingPodcasts, setGeneratingPodcasts] = useState<Record<string, boolean>>({});

  // Prompt viewer modal (podcast prompts + video scripts)
  const [promptModal, setPromptModal] = useState<{ title: string; content: string } | null>(null);

  // Library tab — accordion state (populated reactively by the rawItems useEffect below)
  const [expandedLibrarySemesters, setExpandedLibrarySemesters] = useState<Set<number>>(new Set());
  const [expandedLibraryModules, setExpandedLibraryModules] = useState<Set<string>>(new Set());
  const [expandedLibraryItems, setExpandedLibraryItems] = useState<Set<string>>(new Set());

  // Push notification state
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);

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

      const reg = await navigator.serviceWorker.ready;
      // Read at runtime from the server prop (works on Cloud Run without needing
      // the var inlined at build time, which is the usual cause of this error).
      const vapidKey = vapidPublicKey;
      if (!vapidKey) { addToast("error", "VAPID key not configured."); return; }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // iOS requires a Uint8Array here, not the raw base64 string.
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      const subJson = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      setPushSubscribed(true);
      addToast("success", language === "german" ? "Mitteilungen aktiviert." : "Notifications enabled.");
    } catch (err) {
      console.error("Push subscribe error:", err);
      addToast("error", language === "german" ? "Mitteilungen konnten nicht aktiviert werden." : "Couldn't enable notifications.");
    }
  }, [addToast, language, vapidPublicKey]);

  const togglePush = useCallback(async () => {
    if (pushSubscribed) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint }),
          });
        }
        setPushSubscribed(false);
        addToast("success", language === "german" ? "Mitteilungen deaktiviert." : "Notifications disabled.");
      } catch (err) {
        console.error("Push unsubscribe error:", err);
        addToast("error", language === "german" ? "Mitteilungen konnten nicht deaktiviert werden." : "Couldn't disable notifications.");
      }
    } else {
      subscribeToPush();
    }
  }, [pushSubscribed, subscribeToPush, addToast, language]);

  // Guards against overlapping refetches (mount + focus + interval can race).
  const fetchInFlightRef = useRef(false);

  // Ensures the ?quizId= deep-link is consumed exactly once — not on every
  // subsequent upcomingReviews update (focus-refetch, post-grade refresh, etc).
  const processedQuizIdRef = useRef(false);

  const fetchReviews = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        startTransition(() => {
          setUpcomingReviews(formatItems(data));
          setRawItems(data);
        });
      }
    } catch (err) {
      // Background resync — stay quiet, the next focus/interval retries.
      console.error("Failed to refresh reviews:", err);
    } finally {
      fetchInFlightRef.current = false;
      setIsLoadingReviews(false);
    }
  }, [startTransition]);

  // Always refetch on mount and whenever the tab regains focus/visibility.
  useEffect(() => {
    fetchReviews();
    const onFocus = () => fetchReviews();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchReviews();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchReviews]);

  /** Library: items grouped by semester → module → lecture, always derived from latest fetch. */
  const libraryBySemester = useMemo(() => {
    const result = new Map<number, Map<string, RawReviewItem[]>>();
    const sorted = [...rawItems].sort((a, b) => {
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
  }, [rawItems]);

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
  const isPendingUrl = (url: string | null) => !url || !url.startsWith("http");
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

  // Global Escape key — closes whichever modal is currently on top.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (promptModal) { setPromptModal(null); return; }
      if (showCalendarModal) { setShowCalendarModal(false); return; }
      if (showSettingsModal) { setShowSettingsModal(false); return; }
      if (activeFeedbackItem) { setActiveFeedbackItem(null); return; }
      if (archiveModalData) { setArchiveModalData(null); return; }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [promptModal, showCalendarModal, showSettingsModal, activeFeedbackItem, archiveModalData]);

  // The inline "Wirklich löschen?" prompt resets itself if not confirmed.
  useEffect(() => {
    if (!confirmingDeleteId) return;
    const timeoutId = window.setTimeout(() => setConfirmingDeleteId(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [confirmingDeleteId]);

  const handleDeleteModule = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deletingIds[id]) return;
    // Two-step confirmation: first click arms the button, second click deletes.
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }
    setConfirmingDeleteId(null);
    setDeletingIds(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        // 404 = already gone on the server — remove it locally either way.
        setUpcomingReviews(prev => prev.filter(r => r.id !== id));
        setRawItems(prev => prev.filter(r => r.id !== id));
        addToast("success", language === "german" ? "Modul gelöscht." : "Module deleted.");
      } else {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err) {
      console.error(err);
      addToast("error", language === "german" ? "Fehler beim Löschen des Moduls." : "Failed to delete the module.");
    } finally {
      setDeletingIds(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleGeneratePodcast = async (e: React.MouseEvent, reviewId: string, podcastType: "pre" | "post") => {
    e.stopPropagation();
    const stateKey = `${reviewId}-${podcastType}`;
    if (generatingPodcasts[stateKey]) return;
    setGeneratingPodcasts(prev => ({ ...prev, [stateKey]: true }));
    try {
      const res = await fetch("/api/podcast/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: reviewId, podcastType })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to start generation");
      }
      addToast("success", language === "german"
        ? "Podcast-Generierung gestartet (ca. 3–5 Minuten). Der Link erscheint automatisch in der Liste."
        : "Podcast generation started (about 3-5 minutes). The link will appear in the list automatically.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start generation";
      addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${msg}`);
    } finally {
      // Always re-enable the button. On success the 60s poll swaps it for the
      // audio link once the URL lands; the short delay keeps the "Gestartet…"
      // confirmation visible. Previously this only reset on error, so a
      // successful start left the button stuck on "Gestartet…" until reload.
      setTimeout(() => setGeneratingPodcasts(prev => ({ ...prev, [stateKey]: false })), 5000);
    }
  };

  /** Persist module presets; shared by add/remove handlers in the settings modal. */
  const savePresets = (newPresets: string[], onSuccess?: (saved: string[]) => void) => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_presets', presets: newPresets })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
          return;
        }
        setModulePresets(data.modulePresets || []);
        onSuccess?.(data.modulePresets || []);
      })
      .catch(err => {
        console.error(err);
        addToast("error", language === "german" ? "Einstellungen konnten nicht gespeichert werden." : "Failed to save settings.");
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

  // Reset armed danger-zone confirmations when they expire or the modal closes.
  useEffect(() => {
    if (!confirmingNewSemester && !confirmingResetSemester) return;
    const timeoutId = window.setTimeout(() => {
      setConfirmingNewSemester(false);
      setConfirmingResetSemester(false);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [confirmingNewSemester, confirmingResetSemester]);

  useEffect(() => {
    if (!showSettingsModal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient confirm state when the modal closes
      setConfirmingNewSemester(false);
      setConfirmingResetSemester(false);
    }
  }, [showSettingsModal]);

  const startQuiz = (review: ReviewCard) => {
    setSelectedReview(review);

    // The server already resolved the level-correct quiz text (incl. quiz-1
    // fallback and the level>=6 quiz-7 rollover) into `currentQuizText`.
    const quizText = review.raw.currentQuizText || "";

    // Only display/process student questions
    const studentQuizOnly = extractStudentQuiz(quizText);

    // Generate a template for answers based strictly on actual questions
    const taskMatches = studentQuizOnly.match(/Aufgabe \d+/g) || [];
    let answerTemplate = "";
    if (taskMatches.length > 0) {
      answerTemplate = taskMatches.map((task: string) => `${task}:\n\n`).join("\n");
    } else {
      answerTemplate = "Aufgabe 1:\n\nAufgabe 2:\n\n";
    }

    setStudentAnswers(answerTemplate);

    // Parse individual tasks for structured answer sheet
    const tasks = parseQuizTasks(studentQuizOnly);
    setParsedTasks(tasks);

    const initialAnswers: Record<string, string> = {};
    tasks.forEach(t => {
      initialAnswers[t.id] = "";
    });
    setIndividualAnswers(initialAnswers);

    setGradingResult(null);
    setGradingError("");
    setActiveTab("quiz");
    setShowMobileMenu(false); // close the mobile menu if open
    // Always start at the top so the quiz header is immediately visible.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (processedQuizIdRef.current) return;
    if (upcomingReviews.length > 0 && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const quizId = params.get("quizId");
      if (quizId) {
        const review = upcomingReviews.find(r => r.id === quizId);
        if (review) {
          processedQuizIdRef.current = true;
          window.history.replaceState({}, document.title, window.location.pathname);
          // eslint-disable-next-line react-hooks/set-state-in-effect -- runs once (guarded by processedQuizIdRef); opens the ?quizId= deep link
          startQuiz(review);
        }
      } else {
        processedQuizIdRef.current = true;
      }
    }
  }, [upcomingReviews]);

  const exportQuizForPrint = () => {
    if (!selectedReview || parsedTasks.length === 0) return;
    window.print();
  };

  const handleGenerate = async () => {
    if ((!textInput && uploadedFiles.length === 0) || !subjectInput) return;
    if (isGenerating) return; // double-submit guard
    setIsGenerating(true);
    setProgressStep(0);
    setProgressMsg(language === "german" ? "Starte KI-Pipeline…" : "Starting AI pipeline…");

    // Hard timeout so a hung connection can't leave the spinner on forever.
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);
    let sawDone = false;

    try {
      const formData = new FormData();
      formData.append("subjectMain", subjectInput.trim());
      formData.append("subjectSub", topicInput.trim() || (language === "german" ? "Modul" : "Module"));
      formData.append("language", language);
      if (textInput) formData.append("content", textInput);
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
          setTimeout(() => {
            setIsGenerating(false);
            setActiveTab("dashboard");
            setTopicInput("");
            setSubjectInput(modulePresets[0] ?? "");
            setTextInput("");
            setUploadedFiles([]);
          }, 3000);
        } else if (evt.event === "error") {
          const msg = evt.data.message ?? "Unbekannter Fehler";
          setProgressMsg(msg);
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
        addToast("error", disconnectMsg);
        fetchReviews();
      }
    } catch (e) {
      console.error(e);
      const message = e instanceof DOMException && e.name === "AbortError"
        ? (language === "german" ? "Zeitüberschreitung — Verbindung unterbrochen. Status wird neu geladen…" : "Timeout — connection lost. Reloading status…")
        : e instanceof Error && e.message ? e.message : (language === "german" ? "Verbindung zum Server fehlgeschlagen." : "Failed to connect to server.");
      setProgressMsg(message);
      addToast("error", message);
      fetchReviews();
    } finally {
      window.clearTimeout(timeoutId);
      // Always clear the busy state. After `done`, the success screen stays
      // visible for 3s and its own timer above clears it.
      if (!sawDone) setIsGenerating(false);
    }
  };

  const handleGrade = async () => {
    if (!selectedReview || isGrading) return;

    let payloadAnswers = studentAnswers;
    if (parsedTasks.length > 0) {
      payloadAnswers = parsedTasks.map(task => {
        const answer = individualAnswers[task.id] || "";
        return `${task.header}\n${answer.trim()}`;
      }).join("\n\n");
    }

    if (!payloadAnswers.trim()) return;

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
          language: language
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
          setGradingMsg(language === "german" ? "Bewertung abgeschlossen! Zeitplan aktualisiert." : "Grading finished! Scheduling updated.");
          // `srsItem` is the FULL updated row — keep only what the result
          // screen needs and resync the slim list via refetch.
          const nrd = evt.data.srsItem?.nextReviewDate;
          setGradingResult({
            isPass: !!evt.data.isPass,
            feedback: evt.data.feedback ?? evt.data.srsItem?.lastFeedback ?? "",
            nextReviewDate: nrd ? new Date(nrd).toISOString() : null,
            currentLevel: typeof evt.data.srsItem?.currentLevel === "number" ? evt.data.srsItem.currentLevel : null,
          });
          fetchReviews();
        } else if (evt.event === "error") {
          const msg = evt.data.message ?? "Unbekannter Fehler";
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
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-[100dvh] bg-transparent flex font-sans">

      {/* Print-Only Wrapper */}
      {activeTab === "quiz" && selectedReview && parsedTasks.length > 0 && (
        <div className="hidden print:block p-4 md:p-8 w-full bg-white text-black">
          <div className="max-w-3xl mx-auto">
            <div className="border-b-2 border-zinc-200 pb-6 mb-8">
              <h1 className="text-2xl font-bold font-sans text-zinc-900 mb-2">{selectedReview.topic}</h1>
              <p className="text-xs text-zinc-500 font-medium">
                <span className="bg-zinc-900 text-zinc-100 px-2 py-0.5 rounded mr-2 font-bold uppercase tracking-wider">Level {selectedReview.level + 1}</span>
                {selectedReview.subject}
              </p>
              <div className="flex justify-between mt-4 pt-4 border-t border-zinc-200 text-xs text-zinc-500">
                <p>Name: ___________________________</p>
                <p>Datum: _______________</p>
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
                    <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-2">{task.label}</h2>
                    <div className="text-sm text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg p-4 mb-4 whitespace-pre-wrap leading-relaxed">
                      {task.questionText}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Antwort:</p>
                      {Array.from({ length: lineCount }).map((_, i) => (
                        <div key={i} className="border-b border-zinc-300 h-8 w-full"></div>
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

        {/* Mobile Top Bar */}
        <div className="md:hidden flex items-center justify-between px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-white/[0.07] bg-[#0e0c0a]/90 backdrop-blur-xl fixed top-0 left-0 right-0 z-50">
          <button onClick={() => { setActiveTab("dashboard"); setShowMobileMenu(false); }} className="flex items-center gap-3 cursor-pointer text-left transition-opacity hover:opacity-80">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_4px_16px_-4px_rgba(245,158,11,0.6)]">
              <CpuChipIcon className="text-stone-950 w-4.5 h-4.5" strokeWidth={2} />
            </div>
            <h1 className="font-display text-xl font-medium tracking-tight text-white">SRS<span className="text-gradient italic">Master</span></h1>
          </button>
          <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="p-2 text-white/50 hover:text-white cursor-pointer">
            {showMobileMenu ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
          </button>
        </div>

        {/* Spacer for fixed Mobile Top Bar */}
        <div className="md:hidden px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] opacity-0 pointer-events-none">
          <div className="h-9"></div>
        </div>

        {/* Sidebar */}
        <motion.aside
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className={`${showMobileMenu ? 'flex' : 'hidden'} app-shell-sidebar md:flex w-full md:w-[268px] sidebar-gradient border-r border-white/[0.07] flex-col px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:sticky md:top-0 min-h-[calc(100dvh_-_69px)] md:min-h-0 md:h-[100dvh] z-40 overflow-y-auto custom-scrollbar`}
        >
          <button onClick={() => { setActiveTab("dashboard"); setShowMobileMenu(false); }} className="hidden md:flex items-center gap-3.5 mb-10 px-1 cursor-pointer text-left transition-opacity hover:opacity-80">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_6px_20px_-6px_rgba(245,158,11,0.65)] ring-1 ring-amber-200/40">
              <CpuChipIcon className="text-stone-950 w-5 h-5" strokeWidth={2} />
            </div>
            <div className="flex flex-col">
              <h1 className="font-display text-[22px] font-medium tracking-tight leading-none text-white">SRS<span className="text-gradient italic">Master</span></h1>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/70 bg-amber-400/[0.08] px-2.5 py-1 rounded-full border border-amber-400/15 self-start">
                Semester {currentSemester}
              </div>
            </div>
          </button>

          <nav className="flex flex-col gap-1.5">
            <button onClick={() => { setActiveTab("dashboard"); setShowMobileMenu(false); }} className={`flex items-center gap-3.5 px-4 py-3 transition-all duration-200 cursor-pointer ${activeTab === 'dashboard' ? 'nav-item-active' : 'nav-item-idle'}`}>
              <CalendarDaysIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">Dashboard</span>
            </button>
            <button onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }} className={`flex items-center gap-3.5 px-4 py-3 transition-all duration-200 cursor-pointer ${activeTab === 'upload' ? 'nav-item-active' : 'nav-item-idle'}`}>
              <CloudArrowUpIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">{language === 'german' ? 'Material hochladen' : 'Upload Material'}</span>
            </button>
            <button onClick={() => { setActiveTab("library"); setShowMobileMenu(false); }} className={`flex items-center gap-3.5 px-4 py-3 transition-all duration-200 cursor-pointer ${activeTab === 'library' ? 'nav-item-active' : 'nav-item-idle'}`}>
              <BookOpenIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">{language === 'german' ? 'Bibliothek' : 'Library'}</span>
            </button>
            <button onClick={() => { setShowSettingsModal(true); }} className="flex items-center gap-3.5 px-4 py-3 transition-all duration-200 cursor-pointer nav-item-idle">
              <Cog8ToothIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">{language === 'german' ? 'Einstellungen' : 'Settings'}</span>
            </button>
          </nav>

          <div className="mt-auto flex flex-col gap-4 pt-8">
            {/* Push Notification Toggle */}
            <button
              onClick={togglePush}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer border ${
                pushPermission === "granted" && pushSubscribed
                  ? "bg-emerald-400/[0.08] text-emerald-300 border-emerald-400/20"
                  : "nav-item-idle border-white/[0.07]"
              }`}
            >
              {pushPermission === "granted" && pushSubscribed ? (
                <BellIcon className="w-5 h-5 shrink-0" />
              ) : (
                <BellSlashIcon className="w-5 h-5 shrink-0" />
              )}
              <span className="font-medium text-sm whitespace-nowrap">
                {pushPermission === "granted" && pushSubscribed
                  ? language === "german" ? "Mitteilungen an" : "Notifications On"
                  : pushPermission === "denied"
                  ? language === "german" ? "Blockiert" : "Notifications Blocked"
                  : language === "german" ? "Mitteilungen erlauben" : "Enable Notifications"}
              </span>
            </button>

            <div className="gradient-border rounded-2xl bg-gradient-to-b from-amber-400/[0.07] via-transparent to-transparent p-5 relative overflow-hidden">
              <SparklesIcon className="w-5 h-5 text-amber-300 mb-3" />
              <h3 className="font-display text-base font-medium text-white mb-1.5">Live Tutor Pro</h3>
              <p className="text-xs text-white/40 leading-relaxed mb-4">{language === "german" ? "Optimiere dein Lernen mit Sprach-KI." : "Upgrade your learning with voice AI."}</p>
              <button className="w-full py-2.5 bg-white/[0.04] rounded-lg text-xs font-medium border border-white/[0.08] text-white/30 cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                <LockClosedIcon className="w-3.5 h-3.5" />
                {language === "german" ? "Freischalten (Phase 2)" : "Unlock (Phase 2)"}
              </button>
            </div>
          </div>
        </motion.aside>

        {/* Main Content */}
        {/* Mobile: page scrolls naturally (URL bar can collapse, native momentum).
            md+: fixed app-shell — sidebar stays put, main scrolls internally. */}
        <main className={`${showMobileMenu ? "hidden" : "block"} app-shell-main md:block flex-1 relative px-4 md:px-8 lg:px-12 pt-8 md:pt-12 pb-[max(2rem,env(safe-area-inset-bottom))] md:pb-[max(3rem,env(safe-area-inset-bottom))] md:h-[100dvh] md:overflow-y-auto`}>
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
                <motion.header variants={riseChild} className="mb-8 md:mb-14 flex justify-between items-end">
                  <div>
                    <p className="eyebrow mb-3">{language === 'german' ? 'Willkommen zurück' : 'Welcome back'}</p>
                    <h1 className="font-display text-3xl sm:text-[2.75rem] font-medium tracking-tight text-white leading-[1.08] mb-3">
                      {language === 'german'
                        ? <>Bereit für das <em className="text-gradient not-italic font-display italic">nächste Level</em>?</>
                        : <>Ready to <em className="text-gradient not-italic font-display italic">level up</em>?</>}
                    </h1>
                    <p className="text-white/45 text-sm sm:text-base">
                      {language === 'german'
                        ? <>Du hast <span className="text-gradient font-semibold">{upcomingReviews.filter(r => r.isDue).length}</span> Wiederholungen heute.</>
                        : <>You have <span className="text-gradient font-semibold">{upcomingReviews.filter(r => r.isDue).length}</span> reviews due today.</>}
                    </p>
                  </div>
                </motion.header>

                <motion.div variants={riseChild} className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-8">
                  {/* Reviews List */}
                  <div className="lg:col-span-2 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
                      <h3 className="font-display text-xl sm:text-2xl font-medium text-white flex items-center gap-2.5">
                        <ClockIcon className="w-5 h-5 text-amber-300" />
                        {language === 'german' ? 'Anstehende Wiederholungen' : 'Upcoming Reviews'}
                      </h3>
                      <button
                        onClick={() => setShowCalendarModal(true)}
                        className="btn-secondary flex items-center justify-center gap-2 px-4 py-2.5 text-xs cursor-pointer w-full sm:w-auto"
                      >
                        <CalendarDaysIcon className="w-4 h-4 text-amber-300" />
                        {language === 'german' ? 'Kalender synchronisieren' : 'Sync to Calendar'}
                      </button>
                    </div>

                    {(() => {
                      const dueItems = upcomingReviews.filter(r => r.isDue);
                      const scheduledItems = upcomingReviews.filter(r => !r.isDue);
                      const itemsToRender = [
                        ...dueItems,
                        ...(showAllScheduled ? scheduledItems : scheduledItems.slice(0, 12))
                      ];

                      if (itemsToRender.length === 0) {
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            transition={{ duration: DUR.base, ease: EASE_OUT }}
                            className="card-surface p-8 md:p-14 text-center text-white/40 text-sm leading-relaxed"
                          >
                            {language === 'german' ? 'Keine Wiederholungen gefunden. Lade Vorlesungsmaterial hoch, um dein erstes Quiz zu erstellen!' : 'No reviews found. Upload lecture material to generate your first quiz!'}
                          </motion.div>
                        );
                      }

                      return (
                        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
                          {itemsToRender.map((review) => (
                            <motion.div
                              key={review.id}
                              variants={riseChild}
                              whileHover={{ y: -4 }}
                              transition={springSoft}
                              onClick={() => startQuiz(review)}
                              className={`card-surface-elevated p-5 sm:p-6 group cursor-pointer relative overflow-hidden ${review.isDue ? 'border-amber-400/30 hover:border-amber-300/50 shadow-[0_0_28px_-8px_rgba(245,158,11,0.3)] hover:shadow-[0_0_48px_-8px_rgba(245,158,11,0.5)]' : 'hover:shadow-[0_8px_32px_-12px_rgba(255,250,240,0.07)]'}`}
                            >
                              {/* Ember spine — lit when due, faint on hover otherwise */}
                              <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-opacity duration-300 ${review.isDue ? 'bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 opacity-100' : 'bg-white/30 opacity-0 group-hover:opacity-50'}`}></div>

                              <div className="flex justify-between items-start pl-2.5">
                                <div className="flex-1 min-w-0 pr-4">
                                  <div className="flex flex-wrap items-center gap-2 mb-3">
                                    <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md ${review.isDue ? 'badge-due' : 'badge-level'}`}>Level {review.level + 1}</span>
                                    <span className="text-[10px] font-semibold text-white/45 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/[0.08]">
                                      Sem {review.semester}
                                    </span>
                                    <div className="text-right">
                                      {review.isDue ? (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-400/10 text-amber-200 border border-amber-400/25 text-[10px] font-bold uppercase tracking-[0.12em]">
                                          <span className="ember-dot w-1.5 h-1.5 rounded-full bg-amber-300 mr-2"></span>
                                          {language === 'german' ? 'JETZT FÄLLIG' : 'DUE NOW'}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-white/35">{language === 'german' ? `Geplant: ${review.dueDate}` : `Scheduled: ${review.dueDate}`}</span>
                                      )}
                                    </div>
                                  </div>
                                  <h4 className="font-display text-xl font-medium text-white truncate tracking-tight">{review.subject}</h4>
                                  <p className="text-sm text-white/40 truncate mt-0.5">{review.topic}</p>

                                  {review.raw.lastFeedback && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveFeedbackItem(review.raw);
                                      }}
                                      className="mt-4 text-xs bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.09] hover:border-white/[0.16] text-white/55 hover:text-white/80 px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                                    >
                                      <DocumentTextIcon className="w-4 h-4 text-amber-300/80" />
                                      {language === "german" ? "Feedback ansehen" : "View Remediation Brief"}
                                    </button>
                                  )}

                                  {(() => {
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

                                    return (
                                      <>
                                        {archiveVideos.length > 0 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setArchiveModalData(archiveVideos);
                                            }}
                                            className="mt-2 text-xs bg-indigo-400/[0.07] hover:bg-indigo-400/[0.14] border border-indigo-400/20 text-indigo-300 px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                                          >
                                            <ClockIcon className="w-4 h-4" />
                                            {language === "german" ? `Video-Archiv ansehen (${archiveVideos.length})` : `View Video Archive (${archiveVideos.length})`}
                                          </button>
                                        )}

                                        <div className="mt-5">
                                          {/* Collapsible toggle */}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedCards(prev => {
                                                const next = new Set(prev);
                                                if (next.has(review.id)) { next.delete(review.id); } else { next.add(review.id); }
                                                return next;
                                              });
                                            }}
                                            className="flex items-center gap-2 text-[10px] font-bold text-white/30 hover:text-white/55 uppercase tracking-[0.2em] transition-colors cursor-pointer group mb-0"
                                          >
                                            <motion.span
                                              animate={{ rotate: expandedCards.has(review.id) ? 180 : 0 }}
                                              transition={springTactile}
                                              className="text-white/25 group-hover:text-white/45"
                                            >
                                              <ChevronDownIcon className="w-3.5 h-3.5" />
                                            </motion.span>
                                            {language === 'german' ? 'Lernmaterialien' : 'Study Materials'}
                                          </button>

                                          <AnimatePresence initial={false}>
                                            {expandedCards.has(review.id) && (
                                              <motion.div
                                                key="materials"
                                                variants={accordion}
                                                initial="initial"
                                                animate="animate"
                                                exit="exit"
                                                style={{ overflow: "hidden" }}
                                              >
                                                {review.raw.hasSource && (
                                                  <a
                                                    href={`/api/source/${review.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="mb-2.5 text-xs font-medium bg-white/[0.04] hover:bg-amber-400/[0.1] border border-white/[0.09] hover:border-amber-400/30 text-white/55 hover:text-amber-200 px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-2 w-full text-center transition-all cursor-pointer"
                                                  >
                                                    <DocumentTextIcon className="w-4 h-4 shrink-0 text-amber-400/70" />
                                                    {language === "german" ? "Original-PDF öffnen / herunterladen" : "Open / download original PDF"}
                                                  </a>
                                                )}
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-black/30 rounded-2xl border border-white/[0.05] mt-2.5">
                                                  {/* PRE-PODCAST */}
                                                  <div className="flex-1 min-w-0">
                                                    <h5 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.14em] mb-2 truncate">{language === "german" ? "Vorbereitung" : "Pre-Lecture"}</h5>
                                                    {review.raw.prePodcastUrl && review.raw.prePodcastUrl.startsWith("http") ? (
                                                      <a
                                                        href={review.raw.prePodcastUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-[10px] font-medium bg-white/[0.04] hover:bg-amber-400/[0.1] border border-white/[0.09] hover:border-amber-400/30 text-white/50 hover:text-amber-200 px-2 py-2.5 rounded-lg flex items-center justify-center gap-2 w-full text-center transition-all cursor-pointer truncate"
                                                      >
                                                        <SpeakerWaveIcon className="w-3.5 h-3.5 shrink-0 text-amber-400/60" />
                                                        Audio 1
                                                      </a>
                                                    ) : (
                                                      <button
                                                        onClick={(e) => handleGeneratePodcast(e, review.id, "pre")}
                                                        disabled={!!generatingPodcasts[`${review.id}-pre`]}
                                                        className="text-[10px] font-medium bg-white/[0.02] hover:bg-amber-400/[0.08] border border-white/[0.08] hover:border-amber-400/25 text-white/35 hover:text-amber-200/80 disabled:hover:bg-white/[0.02] disabled:hover:text-white/35 disabled:cursor-wait px-2 py-2.5 rounded-lg flex items-center gap-2 w-full justify-center text-center transition-all cursor-pointer"
                                                      >
                                                        <span className="ember-dot w-1 h-1 rounded-full bg-amber-400/60 shrink-0"></span>
                                                        {generatingPodcasts[`${review.id}-pre`]
                                                          ? (language === 'german' ? 'Gestartet…' : 'Started…')
                                                          : (language === 'german' ? 'Wird generiert – antippen zum Starten' : 'Generating – tap to (re)start')}
                                                      </button>
                                                    )}
                                                  </div>

                                                  {/* POST-PODCAST */}
                                                  <div className="flex-1 min-w-0">
                                                    <h5 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.14em] mb-2 truncate">{language === "german" ? "Nachbereitung" : "Post-Lecture"}</h5>
                                                    {review.raw.postPodcastUrl && review.raw.postPodcastUrl.startsWith("http") ? (
                                                      <a
                                                        href={review.raw.postPodcastUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-[10px] font-medium bg-white/[0.04] hover:bg-amber-400/[0.1] border border-white/[0.09] hover:border-amber-400/30 text-white/50 hover:text-amber-200 px-2 py-2.5 rounded-lg flex items-center justify-center gap-2 w-full text-center transition-all cursor-pointer truncate"
                                                      >
                                                        <SpeakerWaveIcon className="w-3.5 h-3.5 shrink-0 text-amber-400/60" />
                                                        Audio 2
                                                      </a>
                                                    ) : (
                                                      <button
                                                        onClick={(e) => handleGeneratePodcast(e, review.id, "post")}
                                                        disabled={!!generatingPodcasts[`${review.id}-post`]}
                                                        className="text-[10px] font-medium bg-white/[0.02] hover:bg-amber-400/[0.08] border border-white/[0.08] hover:border-amber-400/25 text-white/35 hover:text-amber-200/80 disabled:hover:bg-white/[0.02] disabled:hover:text-white/35 disabled:cursor-wait px-2 py-2.5 rounded-lg flex items-center gap-2 w-full justify-center text-center transition-all cursor-pointer"
                                                      >
                                                        <span className="ember-dot w-1 h-1 rounded-full bg-amber-400/60 shrink-0"></span>
                                                        {generatingPodcasts[`${review.id}-post`]
                                                          ? (language === 'german' ? 'Gestartet…' : 'Started…')
                                                          : (language === 'german' ? 'Wird generiert – antippen zum Starten' : 'Generating – tap to (re)start')}
                                                      </button>
                                                    )}
                                                  </div>

                                                  {/* VIDEO STUDIO */}
                                                  <div className="flex-1 min-w-0">
                                                    <h5 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.14em] mb-2 truncate">{language === "german" ? "Videostudio" : "Video Studio"}</h5>
                                                    {!isWaitingForNewVideo && latestVideoUrl && latestVideoUrl.startsWith("http") ? (
                                                      <a
                                                        href={latestVideoUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-[10px] font-medium bg-white/[0.04] hover:bg-emerald-400/[0.1] border border-white/[0.09] hover:border-emerald-400/30 text-white/50 hover:text-emerald-200 px-2 py-2.5 rounded-lg flex items-center justify-center gap-2 w-full text-center transition-all cursor-pointer truncate"
                                                      >
                                                        <VideoCameraIcon className="w-3.5 h-3.5 shrink-0 text-emerald-400/60" />
                                                        Video
                                                      </a>
                                                    ) : isWaitingForNewVideo ? (
                                                      <div className="text-[10px] font-medium bg-white/[0.01] border border-white/[0.05] text-white/[0.22] px-2 py-2.5 rounded-lg flex items-center gap-2 w-full justify-center text-center">
                                                        <span className="ember-dot w-1 h-1 rounded-full bg-amber-400/50 shrink-0"></span>
                                                        {language === 'german' ? 'Wird erstellt…' : 'Rendering…'}
                                                      </div>
                                                    ) : (
                                                      <div className="text-[10px] font-medium bg-white/[0.01] border border-white/[0.05] text-white/[0.18] px-2 py-2.5 rounded-lg flex items-center gap-2 w-full justify-center text-center">
                                                        {language === 'german' ? 'Nach Bewertung' : 'After grading'}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              </motion.div>
                                            )}
                                          </AnimatePresence>
                                        </div>
                                      </>
                                    );
                                  })()}


                                </div>
                                <div className="flex flex-col items-center gap-2 shrink-0">
                                  <button className="hidden sm:flex w-11 h-11 rounded-full items-center justify-center transition-all bg-white/[0.04] border border-white/[0.07] text-white/40 group-hover:bg-amber-400/15 group-hover:border-amber-400/30 group-hover:text-amber-200 group-hover:scale-110 cursor-pointer">
                                    <ChevronRightIcon className="w-5 h-5" />
                                  </button>
                                  {confirmingDeleteId === review.id && !deletingIds[review.id] ? (
                                    <button
                                      onClick={(e) => handleDeleteModule(e, review.id)}
                                      className="px-3 py-2 rounded-full flex items-center justify-center gap-1.5 transition-all bg-rose-500/15 border border-rose-400/40 text-rose-200 hover:bg-rose-500/25 hover:border-rose-400/60 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer"
                                      title={language === 'german' ? 'Wirklich löschen?' : 'Really delete?'}
                                    >
                                      <TrashIcon className="w-3.5 h-3.5" />
                                      {language === 'german' ? 'Wirklich löschen?' : 'Really delete?'}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => handleDeleteModule(e, review.id)}
                                      disabled={!!deletingIds[review.id]}
                                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all bg-white/[0.04] border border-white/[0.07] text-white/35 hover:bg-rose-500/15 hover:border-rose-400/30 hover:text-rose-300 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                                      title={language === 'german' ? 'Modul löschen' : 'Delete Module'}
                                    >
                                      {deletingIds[review.id] ? (
                                        <ArrowPathIcon className="w-4 h-4 animate-spin text-rose-300" />
                                      ) : (
                                        <TrashIcon className="w-4 h-4" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          ))}

                          {!showAllScheduled && scheduledItems.length > 12 && (
                            <button
                              onClick={() => setShowAllScheduled(true)}
                              className="w-full mt-2 py-4 rounded-2xl card-surface flex items-center justify-center gap-2 text-sm text-white/45 hover:text-amber-200 transition-all cursor-pointer font-medium"
                            >
                              <ChevronDownIcon className="w-4 h-4" />
                              {language === 'german' ? `Alle ${scheduledItems.length} anstehenden anzeigen` : `Show all ${scheduledItems.length} upcoming`}
                            </button>
                          )}
                        </motion.div>
                      );
                    })()}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-col gap-6">
                    <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.99 }} transition={springSoft} className="card-surface-elevated gradient-border p-6 cursor-pointer transition-colors" onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }}>
                      <p className="eyebrow mb-3">Pipeline</p>
                      <h3 className="font-display text-xl font-medium mb-2 text-white">{language === 'german' ? 'Material hochladen' : 'Upload Material'}</h3>
                      <p className="text-sm text-white/40 leading-relaxed mb-6">{language === 'german' ? 'Füttere die KI mit einem neuen Modul, um den generativen Prozess zu starten.' : 'Feed the engine a new module to start the generative AI pipeline.'}</p>
                      <button className="btn-primary w-full py-3.5 px-4 text-sm flex items-center justify-center gap-2 cursor-pointer">
                        <CloudArrowUpIcon className="w-5 h-5" />
                        {language === 'german' ? 'Jetzt hochladen' : 'Upload Now'}
                      </button>
                    </motion.div>
                  </div>
                </motion.div>
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
                <header className="mb-10">
                  <p className="eyebrow mb-3">6-Stage Pipeline</p>
                  <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">Ironclad <em className="text-gradient italic">Generator</em></h1>
                  <p className="text-white/45 text-sm sm:text-base">{language === 'german' ? 'Füge dein Vorlesungsmaterial hier ein, um den kompletten didaktischen KI-Prozess zu starten.' : 'Paste your lecture material below to run the full 6-stage Didactic AI chain.'}</p>
                </header>

                {isGenerating ? (
                  <div className="card-surface-elevated p-8 md:p-14 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/25 flex items-center justify-center mb-6">
                      <ArrowPathIcon className="w-8 h-8 text-amber-300 animate-spin" />
                    </div>
                    <h3 className="font-display text-2xl font-medium text-white mb-2">Processing Module...</h3>
                    <p className="text-white/50 mb-10 text-base">{progressMsg}</p>

                    <div className="progress-track w-full max-w-md h-2.5">
                      <motion.div
                        className="progress-fill h-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(progressStep / 8) * 100}%` }}
                        transition={{ duration: 0.8, ease: EASE_OUT }}
                      />
                    </div>
                    <div className="w-full max-w-md mt-8 text-left space-y-3.5">
                      {[
                        // The REAL pipeline steps the backend emits (quiz-generator.ts),
                        // not the old fictional "Quiz Agent Level 1–5" labels. The app
                        // only generates Quiz 1 at upload; later levels are made one-by-one
                        // during grading. Step numbers match the backend's progress() calls.
                        { step: 1, label: language === "german" ? "Blueprint erstellen" : "Generate Blueprint" },
                        { step: 2, label: language === "german" ? "Quiz 1 generieren" : "Generate Quiz 1" },
                        { step: 3, label: language === "german" ? "Tutor- & Podcast-Prompts" : "Tutor & Podcast prompts" },
                        { step: 5, label: language === "german" ? "NotebookLM einrichten" : "NotebookLM setup" },
                        { step: 6, label: language === "german" ? "Google Drive Upload" : "Google Drive upload" },
                        { step: 7, label: language === "german" ? "In Datenbank speichern" : "Save to database" },
                      ].map(({ step, label }) => (
                        <div key={step} className={`flex items-center gap-3.5 text-sm ${progressStep > step ? 'text-emerald-300' : progressStep === step ? 'text-amber-200 font-medium' : 'text-white/20'}`}>
                          {progressStep > step ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : progressStep === step ? <span className="ember-dot w-5 h-5 rounded-full border-2 border-amber-300 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span></span> : <div className="w-5 h-5 rounded-full border-2 border-current shrink-0" />}
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="card-surface-elevated p-5 md:p-8 flex flex-col gap-7">
                    <div className="flex flex-col sm:flex-row gap-5">
                      <div className="flex-1 flex flex-col justify-end">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45 leading-tight">{language === "german" ? `Modul (Semester ${currentSemester})` : `Module (Semester ${currentSemester})`}</label>
                          <button onClick={() => { setShowSettingsModal(true); }} className="text-xs text-amber-300/80 hover:text-amber-200 transition-colors shrink-0 cursor-pointer">{language === "german" ? "Verwalten" : "Manage Presets"}</button>
                        </div>
                        {modulePresets.length > 0 ? (
                          <select
                            value={subjectInput}
                            onChange={e => setSubjectInput(e.target.value)}
                            className="input-dark w-full px-4 py-3.5 appearance-none cursor-pointer"
                          >
                            {modulePresets.map(preset => (
                              <option key={preset} value={preset} className="bg-[#16120e]">{preset}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="input-dark w-full px-4 py-3.5 text-white/45 text-sm flex items-center justify-between gap-2">
                            {language === "german" ? `Keine Module für Semester ${currentSemester} definiert` : `No modules defined for Semester ${currentSemester}`}
                            <button onClick={() => { setShowSettingsModal(true); }} className="text-amber-300 hover:text-amber-200 font-medium cursor-pointer shrink-0">{language === "german" ? "Hinzufügen" : "Add Presets"}</button>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-end">
                        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/45 mb-2">{language === "german" ? "Thema" : "Topic"}</label>
                        <input
                          type="text"
                          value={topicInput}
                          onChange={e => setTopicInput(e.target.value)}
                          placeholder="e.g. Memory & Motivation"
                          className="input-dark w-full px-4 py-3.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/45 mb-2.5">{language === "german" ? "Vorlesungsmaterial (Dateien oder Text)" : "Lecture Material (Files or Text)"}</label>
                      <div
                        className={`w-full border-2 border-dashed rounded-2xl p-6 md:p-10 mb-4 flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-amber-400/60 bg-amber-400/[0.05]' : 'border-white/[0.1] bg-white/[0.015]'}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            const incoming = Array.from(e.dataTransfer.files);
                            setUploadedFiles(prev => {
                              const existingNames = new Set(prev.map(f => f.name));
                              return [...prev, ...incoming.filter(f => !existingNames.has(f.name))];
                            });
                          }
                        }}
                      >
                        <div className="w-12 h-12 rounded-xl bg-amber-400/[0.08] border border-amber-400/20 flex items-center justify-center mb-4">
                          <CloudArrowUpIcon className="w-6 h-6 text-amber-300" />
                        </div>
                        <p className="text-white/40 text-sm text-center mb-4 leading-relaxed">
                          {language === "german" ? "Ziehe deine PDFs, Excel- oder Word-Dateien hierher" : "Drag and drop your PDFs, Excel, or Word files here"}
                        </p>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.xlsx,.csv,.docx,.txt"
                          className="hidden"
                          id="file-upload"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              setUploadedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                            }
                            e.target.value = "";
                          }}
                        />
                        <label htmlFor="file-upload" className="btn-secondary px-4 py-2 text-sm cursor-pointer">
                          {language === "german" ? "Dateien durchsuchen" : "Browse Files"}
                        </label>
                      </div>

                      {uploadedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {uploadedFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-amber-400/[0.07] text-amber-100/90 px-3.5 py-2 rounded-lg text-xs font-medium border border-amber-400/20">
                              <DocumentTextIcon className="w-4 h-4 text-amber-300" />
                              {file.name}
                              <button onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))} className="ml-1.5 text-amber-200/60 hover:text-white cursor-pointer">
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <textarea
                        value={textInput}
                        onChange={e => setTextInput(e.target.value)}
                        placeholder={language === "german" ? "...oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein..." : "...or paste your lecture notes, transcript, or raw text here..."}
                        className="input-dark w-full px-4 py-4 h-32 resize-none text-sm leading-relaxed"
                      />
                    </div>
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating || (!textInput && uploadedFiles.length === 0) || !subjectInput}
                      className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                    >
                      <CpuChipIcon className="w-5 h-5" />
                      {language === "german" ? "6-Stufen KI-Generierung starten" : "Start 6-Stage AI Generation"}
                    </button>
                  </div>
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
                  <p className="eyebrow mb-3">{language === "german" ? "Archiv" : "Archive"}</p>
                  <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">
                    {language === "german" ? "Meine Bibliothek" : "My Library"}
                  </h1>
                  <p className="text-white/45 text-sm sm:text-base">
                    {language === "german"
                      ? "Alle Vorlesungen, Quizze und Lernmaterialien — nach Semester und Modul sortiert."
                      : "All lectures, quizzes, and study materials — sorted by semester and module."}
                  </p>
                </header>

                {/* ── Empty state ─────────────────────────────────────────── */}
                {rawItems.length === 0 && !isLoadingReviews && (
                  <div className="card-surface p-12 md:p-16 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-6">
                      <BookOpenIcon className="w-8 h-8 text-white/25" />
                    </div>
                    <p className="eyebrow mb-3">{language === "german" ? "Noch leer" : "Still empty"}</p>
                    <h3 className="font-display text-xl font-medium text-white mb-2">
                      {language === "german" ? "Keine Vorlesungen vorhanden" : "No lectures yet"}
                    </h3>
                    <p className="text-white/35 text-sm leading-relaxed max-w-sm">
                      {language === "german"
                        ? "Lade dein erstes Vorlesungsmaterial hoch, um deine Bibliothek aufzubauen."
                        : "Upload your first lecture material to start building your library."}
                    </p>
                  </div>
                )}

                {/* ── Semester accordion list ─────────────────────────────── */}
                {Array.from(libraryBySemester.entries()).map(([sem, modules]) => {
                  const semOpen = expandedLibrarySemesters.has(sem);
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
                        className="w-full flex items-center gap-3 py-2 group cursor-pointer"
                      >
                        <motion.div animate={{ rotate: semOpen ? 90 : 0 }} transition={springTactile}>
                          <ChevronRightIcon className="w-4 h-4 text-amber-300/60 group-hover:text-amber-300 transition-colors shrink-0" />
                        </motion.div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35 group-hover:text-white/55 transition-colors whitespace-nowrap">
                          {language === "german" ? "Semester" : "Semester"}
                        </span>
                        <span className="font-display text-2xl font-medium leading-none text-white group-hover:text-gradient transition-all">
                          {sem}
                        </span>
                        {isCurrentSemester && (
                          <span className="text-[9px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-amber-400/[0.12] border border-amber-400/25 text-amber-300">
                            {language === "german" ? "Aktiv" : "Active"}
                          </span>
                        )}
                        <div className="flex-1 h-px bg-white/[0.06] mx-1" />
                        <span className="text-[10px] text-white/20 font-medium whitespace-nowrap">
                          {modules.size} {language === "german" ? "Module" : "modules"} · {totalLectures} {language === "german" ? "Vorlesungen" : "lectures"}
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
                                const modOpen = expandedLibraryModules.has(modKey);

                                return (
                                  <div key={modKey} className="card-surface overflow-hidden">
                                    {/* Module header */}
                                    <button
                                      onClick={() => setExpandedLibraryModules(prev => {
                                        const next = new Set(prev);
                                        if (next.has(modKey)) next.delete(modKey); else next.add(modKey);
                                        return next;
                                      })}
                                      className="w-full flex items-center gap-3 px-5 py-4 group cursor-pointer"
                                    >
                                      <motion.div animate={{ rotate: modOpen ? 90 : 0 }} transition={springTactile}>
                                        <ChevronRightIcon className="w-3.5 h-3.5 text-white/25 group-hover:text-white/55 transition-colors shrink-0" />
                                      </motion.div>
                                      <FolderOpenIcon className="w-4 h-4 text-amber-300/50 shrink-0" />
                                      <span className="font-display text-base font-medium text-white/85 group-hover:text-white transition-colors flex-1 text-left truncate">
                                        {moduleName}
                                      </span>
                                      <span className="text-[10px] text-white/25 font-medium shrink-0">
                                        {lectures.length} {language === "german" ? (lectures.length === 1 ? "Vorlesung" : "Vorlesungen") : (lectures.length === 1 ? "lecture" : "lectures")}
                                      </span>
                                    </button>

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
                                          <div className="border-t border-white/[0.05]">
                                            {lectures.map((item, idx) => {
                                              const itemOpen = expandedLibraryItems.has(item.id);
                                              const _dueDate = new Date(item.nextReviewDate);
                                              const _now = new Date();
                                              const _todayUTC = new Date(Date.UTC(_now.getUTCFullYear(), _now.getUTCMonth(), _now.getUTCDate()));
                                              const _itemUTC = new Date(Date.UTC(_dueDate.getUTCFullYear(), _dueDate.getUTCMonth(), _dueDate.getUTCDate()));
                                              const isDue = _itemUTC <= _todayUTC;
                                              const hasStudyMaterials = !!(item.tutorPromptDocId || item.prePodcastPrompt || item.postPodcastPrompt || item.lastVideoPrompt1 || item.lastVideoPrompt2 || item.prePodcastUrl || item.postPodcastUrl);

                                              return (
                                                <div key={item.id} className={`${idx > 0 ? "border-t border-white/[0.04]" : ""}`}>
                                                  {/* Collapsed lecture row */}
                                                  <button
                                                    onClick={() => setExpandedLibraryItems(prev => {
                                                      const next = new Set(prev);
                                                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                                      return next;
                                                    })}
                                                    className="w-full flex items-center gap-3 px-5 py-3.5 group cursor-pointer hover:bg-white/[0.02] transition-colors"
                                                  >
                                                    <DocumentTextIcon className="w-3.5 h-3.5 text-white/20 shrink-0 group-hover:text-white/40 transition-colors" />
                                                    <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors flex-1 text-left leading-snug">
                                                      {item.subjectSub}
                                                    </span>
                                                    {isDue && (
                                                      <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full badge-due shrink-0">
                                                        {language === "german" ? "Fällig" : "Due"}
                                                      </span>
                                                    )}
                                                    {/* 7-dot level progress */}
                                                    <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                                                      {item.generatedLevels.map((generated, l) => (
                                                        <div
                                                          key={l}
                                                          title={`Level ${l+1} (${LIB_LEVEL_FULL[l]}): ${l < item.currentLevel ? (language === "german" ? "Bestanden" : "Passed") : l === item.currentLevel ? (language === "german" ? "Aktuell" : "Current") : generated ? (language === "german" ? "Generiert" : "Generated") : (language === "german" ? "Ausstehend" : "Pending")}`}
                                                          className={`w-2 h-2 rounded-full transition-all ${
                                                            l < item.currentLevel
                                                              ? "bg-amber-400"
                                                              : l === item.currentLevel
                                                                ? "bg-amber-300/50 ring-1 ring-amber-300/60"
                                                                : generated
                                                                  ? "bg-white/[0.15]"
                                                                  : "bg-white/[0.06]"
                                                          }`}
                                                        />
                                                      ))}
                                                    </div>
                                                    <span className="text-[10px] text-white/25 font-medium shrink-0 w-8 text-right">
                                                      L{item.currentLevel + 1}
                                                    </span>
                                                    <motion.div animate={{ rotate: itemOpen ? 180 : 0 }} transition={springTactile}>
                                                      <ChevronDownIcon className="w-3.5 h-3.5 text-white/20 group-hover:text-white/45 transition-colors shrink-0" />
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
                                                        <div className="px-5 pb-5 pt-1 bg-black/20 space-y-5">

                                                          {/* Level progress detail */}
                                                          <div>
                                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25 mb-3">
                                                              {language === "german" ? "Level-Fortschritt" : "Level Progress"}
                                                            </p>
                                                            <div className="flex items-start gap-2 sm:gap-3">
                                                              {item.generatedLevels.map((generated, l) => (
                                                                <div key={l} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                                                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                                                    l < item.currentLevel
                                                                      ? "bg-amber-400 border-amber-400"
                                                                      : l === item.currentLevel
                                                                        ? "bg-transparent border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.35)]"
                                                                        : generated
                                                                          ? "bg-white/[0.06] border-white/[0.18]"
                                                                          : "bg-transparent border-white/[0.08]"
                                                                  }`}>
                                                                    {l < item.currentLevel && (
                                                                      <CheckIcon className="w-3 h-3 text-stone-900" strokeWidth={3} />
                                                                    )}
                                                                    {l === item.currentLevel && (
                                                                      <div className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                                                                    )}
                                                                  </div>
                                                                  <span className="text-[8px] font-medium text-white/20 leading-none text-center">
                                                                    {LIB_LEVEL_SHORT[l]}
                                                                  </span>
                                                                </div>
                                                              ))}
                                                            </div>
                                                          </div>

                                                          {/* Quiz generation status */}
                                                          <div>
                                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25 mb-2">
                                                              {language === "german" ? "Quiz-Generierung" : "Quiz Generation"}
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                              {item.generatedLevels.map((generated, l) => (
                                                                <span
                                                                  key={l}
                                                                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                                                                    l < item.currentLevel
                                                                      ? "bg-amber-400/[0.1] border-amber-400/25 text-amber-300"
                                                                      : generated
                                                                        ? "bg-white/[0.05] border-white/[0.12] text-white/45"
                                                                        : "bg-transparent border-white/[0.05] text-white/15"
                                                                  }`}
                                                                >
                                                                  L{l+1} {l < item.currentLevel ? "✓" : generated ? "·" : "○"}
                                                                </span>
                                                              ))}
                                                            </div>
                                                            <p className="text-[10px] text-white/20 mt-2">
                                                              {language === "german"
                                                                ? `${item.generatedLevels.filter(Boolean).length} von 7 Quizzen generiert`
                                                                : `${item.generatedLevels.filter(Boolean).length} of 7 quizzes generated`}
                                                            </p>
                                                          </div>

                                                          {/* Study materials */}
                                                          {hasStudyMaterials && (
                                                            <div>
                                                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25 mb-2">
                                                                {language === "german" ? "Lernmaterialien" : "Study Materials"}
                                                              </p>
                                                              <div className="flex flex-wrap gap-2">
                                                                {item.tutorPromptDocId && (
                                                                  <a
                                                                    href={`/tutor/${item.tutorPromptDocId}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-amber-400/[0.07] border border-amber-400/[0.18] text-amber-300/80 hover:text-amber-200 hover:bg-amber-400/[0.12] transition-all"
                                                                  >
                                                                    <AcademicCapIcon className="w-3 h-3" />
                                                                    {language === "german" ? "Tutor-Prompt" : "Tutor Prompt"}
                                                                  </a>
                                                                )}
                                                                {/* Podcast links — show actual links when available, otherwise generation buttons */}
                                                                {item.prePodcastUrl && item.prePodcastUrl.startsWith("http") ? (
                                                                  <a
                                                                    href={item.prePodcastUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/55 hover:text-white/90 hover:bg-white/[0.07] transition-all"
                                                                  >
                                                                    <SpeakerWaveIcon className="w-3 h-3" />
                                                                    {language === "german" ? "Audio 1" : "Audio 1"}
                                                                  </a>
                                                                ) : item.prePodcastPrompt ? (
                                                                  <button
                                                                    onClick={(e) => { e.stopPropagation(); handleGeneratePodcast(e, item.id, "pre"); }}
                                                                    disabled={!!generatingPodcasts[`${item.id}-pre`]}
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/35 hover:text-amber-200/80 hover:bg-white/[0.06] transition-all cursor-pointer disabled:cursor-wait"
                                                                  >
                                                                    <SpeakerWaveIcon className="w-3 h-3" />
                                                                    {generatingPodcasts[`${item.id}-pre`]
                                                                      ? (language === "german" ? "Gestartet…" : "Started…")
                                                                      : (language === "german" ? "Podcast 1 generieren" : "Generate Podcast 1")}
                                                                  </button>
                                                                ) : null}
                                                                {item.postPodcastUrl && item.postPodcastUrl.startsWith("http") ? (
                                                                  <a
                                                                    href={item.postPodcastUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/55 hover:text-white/90 hover:bg-white/[0.07] transition-all"
                                                                  >
                                                                    <SpeakerWaveIcon className="w-3 h-3" />
                                                                    {language === "german" ? "Audio 2" : "Audio 2"}
                                                                  </a>
                                                                ) : item.postPodcastPrompt ? (
                                                                  <button
                                                                    onClick={(e) => { e.stopPropagation(); handleGeneratePodcast(e, item.id, "post"); }}
                                                                    disabled={!!generatingPodcasts[`${item.id}-post`]}
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/35 hover:text-amber-200/80 hover:bg-white/[0.06] transition-all cursor-pointer disabled:cursor-wait"
                                                                  >
                                                                    <SpeakerWaveIcon className="w-3 h-3" />
                                                                    {generatingPodcasts[`${item.id}-post`]
                                                                      ? (language === "german" ? "Gestartet…" : "Started…")
                                                                      : (language === "german" ? "Podcast 2 generieren" : "Generate Podcast 2")}
                                                                  </button>
                                                                ) : null}
                                                                {item.prePodcastPrompt && (
                                                                  <button
                                                                    onClick={() => setPromptModal({
                                                                      title: language === "german" ? `Podcast Pre-Prompt — ${item.subjectSub}` : `Pre-Podcast Prompt — ${item.subjectSub}`,
                                                                      content: item.prePodcastPrompt!,
                                                                    })}
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/55 hover:text-white/90 hover:bg-white/[0.07] transition-all cursor-pointer"
                                                                  >
                                                                    <DocumentTextIcon className="w-3 h-3" />
                                                                    {language === "german" ? "Podcast Pre-Prompt" : "Pre-Podcast Prompt"}
                                                                  </button>
                                                                )}
                                                                {item.postPodcastPrompt && (
                                                                  <button
                                                                    onClick={() => setPromptModal({
                                                                      title: language === "german" ? `Podcast Post-Prompt — ${item.subjectSub}` : `Post-Podcast Prompt — ${item.subjectSub}`,
                                                                      content: item.postPodcastPrompt!,
                                                                    })}
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/55 hover:text-white/90 hover:bg-white/[0.07] transition-all cursor-pointer"
                                                                  >
                                                                    <DocumentTextIcon className="w-3 h-3" />
                                                                    {language === "german" ? "Podcast Post-Prompt" : "Post-Podcast Prompt"}
                                                                  </button>
                                                                )}
                                                                {item.lastVideoPrompt1 && (
                                                                  <button
                                                                    onClick={() => setPromptModal({
                                                                      title: language === "german" ? `Video-Skript 1 — ${item.subjectSub}` : `Video Script 1 — ${item.subjectSub}`,
                                                                      content: item.lastVideoPrompt1!,
                                                                    })}
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/55 hover:text-white/90 hover:bg-white/[0.07] transition-all cursor-pointer"
                                                                  >
                                                                    <VideoCameraIcon className="w-3 h-3" />
                                                                    {language === "german" ? "Video-Skript 1" : "Video Script 1"}
                                                                  </button>
                                                                )}
                                                                {item.lastVideoPrompt2 && (
                                                                  <button
                                                                    onClick={() => setPromptModal({
                                                                      title: language === "german" ? `Video-Skript 2 — ${item.subjectSub}` : `Video Script 2 — ${item.subjectSub}`,
                                                                      content: item.lastVideoPrompt2!,
                                                                    })}
                                                                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-white/55 hover:text-white/90 hover:bg-white/[0.07] transition-all cursor-pointer"
                                                                  >
                                                                    <VideoCameraIcon className="w-3 h-3" />
                                                                    {language === "german" ? "Video-Skript 2" : "Video Script 2"}
                                                                  </button>
                                                                )}
                                                              </div>
                                                            </div>
                                                          )}

                                                          {/* Last feedback snippet */}
                                                          {item.lastFeedback && (
                                                            <div>
                                                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25 mb-2">
                                                                {language === "german" ? "Letztes Feedback" : "Last Assessment"}
                                                              </p>
                                                              <div className="bg-black/30 rounded-xl border border-white/[0.05] p-3.5 max-h-28 overflow-y-auto custom-scrollbar">
                                                                <p className="text-xs text-white/45 leading-relaxed whitespace-pre-wrap">{item.lastFeedback}</p>
                                                              </div>
                                                            </div>
                                                          )}

                                                          {/* Meta row */}
                                                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-white/25 pt-1 border-t border-white/[0.04]">
                                                            <span className="flex items-center gap-1.5">
                                                              <CalendarDaysIcon className="w-3.5 h-3.5" />
                                                              {language === "german" ? "Erstellt: " : "Created: "}
                                                              <span className="text-white/40">{new Date(item.createdAt).toLocaleDateString()}</span>
                                                            </span>
                                                            <span className="flex items-center gap-1.5">
                                                              <ClockIcon className="w-3.5 h-3.5" />
                                                              {language === "german" ? "Nächste Wdh.: " : "Next review: "}
                                                              <span className={isDue ? "text-amber-300/80" : "text-white/40"}>
                                                                {new Date(item.nextReviewDate).toLocaleDateString()}
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

            {activeTab === "quiz" && selectedReview && (
              <motion.div
                key="quiz"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="max-w-4xl mx-auto"
              >
                <button
                  onClick={() => {
                    setActiveTab("dashboard");
                    setSelectedReview(null);
                    setGradingResult(null);
                  }}
                  className="flex items-center gap-2 text-sm text-white/40 hover:text-white/80 mb-8 transition-all cursor-pointer group"
                >
                  <ArrowLeftIcon className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                  {language === "german" ? "Zurück zum Dashboard" : "Back to Dashboard"}
                </button>

                <header className="mb-10">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md badge-due">Level {selectedReview.level + 1}</span>
                    <span className="eyebrow !text-white/35">{language === "german" ? "Aktives Quiz" : "Active Quiz"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-white">{selectedReview.subject}</h1>
                      <p className="text-sm text-white/40 mt-2">{selectedReview.topic}</p>
                    </div>
                    {parsedTasks.length > 0 && (
                      <motion.button
                        {...pressable}
                        onClick={exportQuizForPrint}
                        className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer shrink-0"
                      >
                        <PrinterIcon className="w-4 h-4 text-amber-300" />
                        {language === "german" ? "Exportieren" : "Export"}
                      </motion.button>
                    )}
                  </div>
                </header>

                {gradingError && !isGrading && (
                  <div className="mb-6 p-6 rounded-2xl bg-rose-500/[0.07] border border-rose-400/20 text-rose-200 text-sm flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-rose-300 font-semibold">
                      <ExclamationTriangleIcon className="w-5 h-5" />
                      <span>Grading Failed</span>
                    </div>
                    <pre className="text-xs font-mono bg-black/30 p-4 rounded-xl border border-white/[0.06] whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto leading-relaxed text-left text-rose-200/70 custom-scrollbar">
                      {gradingError}
                    </pre>
                    <p className="text-xs text-white/35 text-left leading-relaxed">
                      Please check your database, Gemini API key, or server logs, and click below to try submitting again.
                    </p>
                  </div>
                )}

                {isGrading ? (
                  <div className="card-surface-elevated p-8 md:p-14 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/25 flex items-center justify-center mb-6">
                      <ArrowPathIcon className="w-8 h-8 text-amber-300 animate-spin" />
                    </div>
                    <h3 className="font-display text-2xl font-medium mb-2 text-white">{language === "german" ? "Einreichung wird bewertet..." : "Grading Submission..."}</h3>
                    <p className="text-white/50 mb-10 text-base">{gradingMsg}</p>

                    <div className="progress-track w-full max-w-md h-2.5">
                      <motion.div
                        className="progress-fill h-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (gradingStep / 4) * 100)}%` }}
                        transition={{ duration: 0.8, ease: EASE_OUT }}
                      />
                    </div>
                    <div className="w-full max-w-md mt-8 text-left space-y-3.5">
                      {[1,2,3,4].map(step => (
                        <div key={step} className={`flex items-center gap-3.5 text-sm ${gradingStep > step ? 'text-emerald-300' : gradingStep === step ? 'text-amber-200 font-medium' : 'text-white/20'}`}>
                          {gradingStep > step ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : gradingStep === step ? <span className="ember-dot w-5 h-5 rounded-full border-2 border-amber-300 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span></span> : <div className="w-5 h-5 rounded-full border-2 border-current shrink-0" />}
                          {step === 1 ? "Co-Prüfer 1 & 2 (Parallel Evaluation)" :
                           step === 2 ? "Chef-Prüfer (Consolidation & Brief)" :
                           step === 3 ? "Follow-Up Generation (Quiz & Video)" : "Saving Database Records"}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : gradingResult ? (
                  <div className="space-y-6">
                    <div className={`card-surface-elevated p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 ${gradingResult.isPass ? 'border-emerald-400/25 glow-success' : 'border-rose-400/25 glow-danger'}`}>
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.16em] px-3.5 py-1.5 rounded-full ${gradingResult.isPass ? 'bg-emerald-400/12 text-emerald-300 border border-emerald-400/25' : 'bg-rose-400/12 text-rose-300 border border-rose-400/25'}`}>
                          {gradingResult.isPass
                            ? (language === "german" ? "BESTANDEN" : "PASSED")
                            : (language === "german" ? "WIEDERHOLEN" : "REPEAT")}
                        </span>
                        <h2 className="font-display text-3xl sm:text-4xl font-medium text-white mt-5 tracking-tight">
                          {gradingResult.isPass
                            ? <>Level <em className="text-gradient italic">Promoted!</em></>
                            : <>Remediation <em className="italic text-rose-200">Scheduled</em></>}
                        </h2>
                        {gradingResult.nextReviewDate && (
                          <p className="text-white/50 mt-3 text-sm">
                            Next review set to: <strong className="text-amber-200 font-semibold">{new Date(gradingResult.nextReviewDate).toLocaleDateString()}</strong>
                            {gradingResult.currentLevel !== null && <> (Level {gradingResult.currentLevel + 1})</>}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab("dashboard");
                          setSelectedReview(null);
                          setGradingResult(null);
                        }}
                        className="btn-secondary px-6 py-3.5 text-sm font-semibold cursor-pointer shrink-0"
                      >
                        {language === "german" ? "Zurück zum Dashboard" : "Back to Dashboard"}
                      </button>
                    </div>

                    <div className="card-surface-elevated overflow-hidden">
                      <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-4 flex items-center gap-2.5">
                        <DocumentTextIcon className="w-4 h-4 text-amber-300" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">Remediation Brief</h3>
                      </div>

                      <div className="p-6 md:p-8">
                        <div className="whitespace-pre-wrap font-sans text-white/65 text-[15px] leading-relaxed">
                          {gradingResult.feedback}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Quiz taking UI */
                  <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-20">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-display text-xl font-medium text-white flex items-center gap-2.5">
                        <AcademicCapIcon className="w-5 h-5 text-amber-300" />
                        {language === "german" ? "Quiz-Aufgabe" : "Quiz Assignment"}
                      </h3>
                    </div>

                    {parsedTasks.length > 0 ? (
                      <div className="space-y-6">
                        {parsedTasks.map((task, idx) => {
                          const isMC = /^[A-D]\)\s/m.test(task.questionText);
                          return (
                            <motion.div
                              key={task.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.06, duration: DUR.base, ease: EASE_OUT }}
                              className="card-surface-elevated p-5 md:p-8"
                            >
                              <div className="flex items-center gap-3 mb-5">
                                <span className="font-display text-2xl text-amber-300/50 italic leading-none">{String(idx + 1).padStart(2, "0")}</span>
                                <h3 className="text-xs font-bold text-amber-200/90 uppercase tracking-[0.16em]">{task.label}</h3>
                              </div>
                              <div className="text-[15px] text-white/75 whitespace-pre-wrap leading-relaxed mb-6">
                                {task.questionText}
                              </div>

                              <div className="border-t border-white/[0.06] pt-6">
                                <span className="block text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3">Your Answer:</span>
                                <textarea
                                  value={individualAnswers[task.id] || ""}
                                  onChange={e => {
                                    setIndividualAnswers(prev => ({
                                      ...prev,
                                      [task.id]: e.target.value
                                    }));
                                  }}
                                  placeholder={language === "german" ? (isMC ? "Tippe A, B, C oder D..." : "Tippe deine Antwort hier ein...") : (isMC ? "Type A, B, C, or D..." : "Type your answer here...")}
                                  rows={isMC ? 2 : 4}
                                  className="input-dark w-full px-5 py-4 text-sm leading-relaxed resize-none"
                                />
                              </div>
                            </motion.div>
                          );
                        })}

                        <div className="pt-4">
                          <motion.button
                            {...pressable}
                            onClick={handleGrade}
                            disabled={isGrading || !parsedTasks.some(task => (individualAnswers[task.id] || "").trim().length > 0)}
                            className="btn-primary w-full py-5 text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                          >
                            <SparklesIcon className="w-5 h-5" />
                            {language === "german" ? "ALLE ANTWORTEN ZUR KI-BEWERTUNG EINREICHEN" : "Submit All Answers for AI Grading"}
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                      <div className="card-surface-elevated p-5 md:p-8 flex flex-col">
                        <div className="bg-black/25 border border-white/[0.06] rounded-2xl p-6 font-sans whitespace-pre-wrap text-white/60 text-sm leading-relaxed mb-6">
                          {/* Server-computed, level-correct quiz text (slim payload) */}
                          {extractStudentQuiz(selectedReview.raw.currentQuizText || "")}
                        </div>

                        <span className="block text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3">Your Answer:</span>
                        <textarea
                          value={studentAnswers}
                          onChange={e => setStudentAnswers(e.target.value)}
                          placeholder="Write your answers here..."
                          className="input-dark flex-1 w-full p-5 text-sm leading-relaxed resize-none min-h-[300px] mb-6"
                        />
                        <motion.button
                          {...pressable}
                          onClick={handleGrade}
                          disabled={isGrading || !studentAnswers.trim()}
                          className="btn-primary w-full py-5 text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                        >
                          <SparklesIcon className="w-5 h-5" />
                          Submit Answer for AI Grading
                        </motion.button>
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
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
              >
                <motion.div
                  {...modalPanel}
                  className="card-glass w-full max-w-lg overflow-hidden flex flex-col max-h-[85dvh] border border-white/[0.1]"
                >
                  <div className="p-6 border-b border-white/[0.06] flex justify-between items-center">
                    <h3 className="font-display text-xl font-medium text-white">Video Archive</h3>
                    <button
                      onClick={() => setArchiveModalData(null)}
                      className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-6 space-y-3 overflow-y-auto custom-scrollbar">
                    {archiveModalData.map((item, idx) => (
                      <div key={idx} className="card-surface p-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-white text-sm font-semibold">Level {item.level + 1} Video</h4>
                          {item.date && <p className="text-xs text-white/40 mt-0.5">{new Date(item.date).toLocaleDateString()}</p>}
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary px-4 py-2 text-xs flex items-center gap-2"
                        >
                          <VideoCameraIcon className="w-4 h-4 text-amber-300" />
                          Watch
                        </a>
                      </div>
                    ))}
                  </div>
                </motion.div>
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
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
            >
              <motion.div
                {...modalPanel}
                className="card-glass w-full max-w-4xl overflow-hidden flex flex-col max-h-[85dvh] border border-white/[0.1]"
              >
                {/* Header */}
                <div className="p-6 border-b border-white/[0.06] flex justify-between items-center">
                  <div>
                    <h3 className="font-display text-xl font-medium text-white">{activeFeedbackItem.subjectSub}</h3>
                    <p className="text-xs text-white/40 mt-1">{activeFeedbackItem.subjectMain} — Level {activeFeedbackItem.currentLevel + 1}</p>
                  </div>
                  <button
                    onClick={() => setActiveFeedbackItem(null)}
                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Header/Title */}
                <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-3.5 flex items-center gap-2.5">
                  <DocumentTextIcon className="w-4 h-4 text-amber-300" />
                  <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">{language === "german" ? "Feedback & Auswertung" : "Remediation Brief & Feedback"}</h3>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                  <div className="whitespace-pre-wrap font-sans text-white/60 text-sm leading-relaxed">
                    {activeFeedbackItem.lastFeedback}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calendar Subscription Modal */}
        <AnimatePresence>
          {showCalendarModal && (
            <motion.div
              {...overlayMotion}
              className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4"
              onClick={() => setShowCalendarModal(false)}
            >
              <motion.div
                {...modalPanel}
                className="card-glass p-5 sm:p-6 md:p-7 max-w-lg w-full border border-white/[0.1] max-h-[90dvh] overflow-y-auto custom-scrollbar"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-display text-xl font-medium flex items-center gap-2.5 text-white">
                    <CalendarDaysIcon className="w-5 h-5 text-amber-300" />
                    Calendar Sync
                  </h2>
                  <button onClick={() => setShowCalendarModal(false)} className="text-white/40 hover:text-white p-2 transition-colors cursor-pointer">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-sm text-white/45 mb-7 leading-relaxed">
                  Subscribe once — all future reviews will automatically appear in your calendar.
                </p>

                {/* Apple Calendar */}
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] mb-2.5 flex items-center gap-2 text-white/70">🍎 Apple Calendar (Mac/iPhone)</h3>
                  <a
                    href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar?lang=${language}`}
                    className="btn-secondary flex items-center justify-center gap-2 w-full py-3.5 text-sm"
                  >
                    <CalendarDaysIcon className="w-4 h-4 text-amber-300" />
                    Subscribe in Apple Calendar
                  </a>

                </div>

                {/* Google Calendar */}
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] mb-2.5 flex items-center gap-2 text-white/70">📅 Google Calendar</h3>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/calendar?lang=${language}`}
                      className="input-dark flex-1 px-4 py-2.5 text-xs font-mono truncate"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/calendar?lang=${language}`)
                          .catch(() => addToast("error", language === "german" ? "Kopieren fehlgeschlagen." : "Copy failed."));
                        setCalendarUrlCopied(true);
                        setTimeout(() => setCalendarUrlCopied(false), 2000);
                      }}
                      className="btn-secondary px-4 py-2.5 text-xs font-medium flex items-center gap-2 cursor-pointer shrink-0"
                    >
                      {calendarUrlCopied ? <CheckIcon className="w-4 h-4 text-emerald-300" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                      {calendarUrlCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-white/30 mt-2.5 ml-1 leading-relaxed">
                    Google Calendar → Other calendars (+) → From URL → Paste the URL above.
                  </p>
                </div>

                {/* Done Calendar */}
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] mb-2.5 flex items-center gap-2 text-white/70">🟢 Done Calendar (Optional)</h3>
                  <a
                    href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar/done`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-400/[0.08] hover:bg-emerald-400/[0.16] rounded-xl text-xs font-medium text-emerald-300 transition-all border border-emerald-400/20"
                  >
                    <CalendarDaysIcon className="w-4 h-4" />
                    Subscribe to Log History
                  </a>
                  <p className="text-[10px] text-white/30 mt-2.5 ml-1 leading-relaxed">
                    Track your daily progress by subscribing to your completed reviews.
                  </p>
                </div>

                {/* One-time download fallback */}
                <div className="pt-5 border-t border-white/[0.06]">
                  <a
                    href="/api/calendar"
                    download="srs-reviews.ics"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl text-xs font-medium text-white/40 hover:text-white/65 transition-all border border-white/[0.06]"
                  >
                    <DocumentTextIcon className="w-4 h-4" />
                    Download .ics file (one-time import)
                  </a>
                </div>
              </motion.div>
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
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-md"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div
              {...modalPanel}
              className="card-glass p-5 sm:p-6 md:p-7 w-full max-w-lg border border-white/[0.1] max-h-[90dvh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-7">
                <h3 className="font-display text-xl font-medium text-white flex items-center gap-2.5">
                  <AcademicCapIcon className="w-5 h-5 text-amber-300" />
                  {language === "german" ? "Semester-Einstellungen" : "Semester Settings"}
                </h3>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-2 hover:bg-white/[0.06] rounded-full transition-colors text-white/50 hover:text-white cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-7">
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">{language === "german" ? "Aktueller Status" : "Current Status"}</h4>
                  <div className="card-surface p-4 flex items-center justify-between">
                    <div>
                      <div className="font-display text-2xl font-medium text-white">Semester <span className="text-gradient italic">{currentSemester}</span></div>
                      <div className="text-sm text-white/40 mt-0.5">{language === "german" ? "Aktiver Studienzeitraum" : "Active study period"}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">{language === "german" ? "Modul-Voreinstellungen" : "Module Presets"}</h4>
                  <div className="space-y-2 mb-3">
                    {modulePresets.length === 0 ? (
                      <div className="text-white/30 text-sm italic py-2">No modules defined yet.</div>
                    ) : (
                      modulePresets.map((preset, idx) => (
                        <div key={idx} className="flex items-center justify-between card-surface px-4 py-3">
                          <span className="text-white text-sm">{preset}</span>
                          <button
                            onClick={() => {
                              const newPresets = modulePresets.filter((_, i) => i !== idx);
                              savePresets(newPresets, (saved) => {
                                if (subjectInput === preset) setSubjectInput(saved[0] || "");
                              });
                            }}
                            className="text-white/30 hover:text-rose-300 transition-colors cursor-pointer"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
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
                          savePresets([...modulePresets, trimmed], () => {
                            if (!subjectInput) setSubjectInput(trimmed);
                            setNewPresetInput("");
                          });
                        }
                      }}
                      placeholder={language === "german" ? "z.B. Lineare Algebra" : "e.g. Linear Algebra"}
                      className="input-dark flex-1 px-4 py-2.5 text-sm"
                    />
                    <button
                      onClick={() => {
                        if (newPresetInput.trim()) {
                          const trimmed = newPresetInput.trim();
                          savePresets([...modulePresets, trimmed], () => {
                            if (!subjectInput) setSubjectInput(trimmed);
                            setNewPresetInput("");
                          });
                        }
                      }}
                      className="btn-secondary px-4 py-2.5 text-sm cursor-pointer"
                    >
                      {language === "german" ? "Hinzufügen" : "Add"}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/[0.07]">
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">{language === "german" ? "Sprache" : "Language Setting"}</h4>
                  <div className="flex gap-2 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1">
                    <button
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_language', language: 'german' })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
                            return;
                          }
                          if (data.language) setLanguage(data.language);
                        }).catch(err => {
                          console.error(err);
                          addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
                        });
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${language === 'german' ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      German
                    </button>
                    <button
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_language', language: 'english' })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
                            return;
                          }
                          if (data.language) setLanguage(data.language);
                        }).catch(err => {
                          console.error(err);
                          addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
                        });
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${language === 'english' ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      English
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/[0.07]">
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">{language === "german" ? "KI-Verbindung" : "AI Connection"}</h4>
                  <p className="text-xs text-white/40 mb-4 leading-relaxed">
                    {language === "german"
                      ? "Wähle aus, für welche Module der experimentelle Gemini Proxy genutzt werden soll. Die offizielle Google API dient immer als sicherer Fallback."
                      : "Choose which modules should use the experimental Gemini proxy. The official Google API will always act as a reliable fallback."}
                  </p>
                  {(isGenerating || isGrading) && (
                    <div className="mb-4 text-xs font-semibold text-amber-300 flex items-center gap-2">
                      <LockClosedIcon className="w-3.5 h-3.5" />
                      {language === "german" ? "Einstellungen gesperrt, während eine KI-Aktion läuft." : "Settings locked while AI generation is in progress."}
                    </div>
                  )}
                  <div className="flex gap-2 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1">
                    <button
                      disabled={isGenerating || isGrading}
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_wrapper_toggle', wrapperMode: "all" })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
                            return;
                          }
                          if (data.wrapperMode) setWrapperMode(data.wrapperMode);
                        }).catch(err => {
                          console.error(err);
                          addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
                        });
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm transition-colors cursor-pointer ${(isGenerating || isGrading) ? 'opacity-50 cursor-not-allowed' : ''} ${wrapperMode === "all" ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      {language === "german" ? "Alles (Wrapper)" : "All (Proxy)"}
                    </button>
                    <button
                      disabled={isGenerating || isGrading}
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_wrapper_toggle', wrapperMode: "generation_only" })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
                            return;
                          }
                          if (data.wrapperMode) setWrapperMode(data.wrapperMode);
                        }).catch(err => {
                          console.error(err);
                          addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
                        });
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm transition-colors cursor-pointer ${(isGenerating || isGrading) ? 'opacity-50 cursor-not-allowed' : ''} ${wrapperMode === "generation_only" ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      {language === "german" ? "Nur Generierung" : "Gen Only"}
                    </button>
                    <button
                      disabled={isGenerating || isGrading}
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_wrapper_toggle', wrapperMode: "none" })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            addToast("error", `${language === "german" ? "Fehler" : "Error"}: ${data.error}`);
                            return;
                          }
                          if (data.wrapperMode) setWrapperMode(data.wrapperMode);
                        }).catch(err => {
                          console.error(err);
                          addToast("error", language === "german" ? "Einstellung konnte nicht gespeichert werden." : "Failed to save setting.");
                        });
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm transition-colors cursor-pointer ${(isGenerating || isGrading) ? 'opacity-50 cursor-not-allowed' : ''} ${wrapperMode === "none" ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      {language === "german" ? "Nur Fallback" : "Fallback Only"}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-rose-400/[0.12]">
                  <h4 className="text-[10px] font-bold text-rose-300 uppercase tracking-[0.2em] mb-2">{language === "german" ? "Gefahrenzone" : "Danger Zone"}</h4>
                  <p className="text-white/40 text-xs mb-4 leading-relaxed">{language === "german" ? "Der Start eines neuen Semesters erhöht den Semesterzähler und löscht deine aktuellen Modul-Voreinstellungen." : "Starting a new semester will increment your semester counter and wipe your current module presets so you can start fresh."}</p>
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
                    className={`w-full py-3.5 text-rose-300 border rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2 cursor-pointer disabled:opacity-50 disabled:cursor-wait ${confirmingNewSemester ? 'bg-rose-500/[0.2] border-rose-400/50' : 'bg-rose-500/[0.08] hover:bg-rose-500/[0.16] border-rose-400/20 hover:border-rose-400/35'}`}
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
                    className={`w-full py-2.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-wait ${confirmingResetSemester ? 'bg-rose-500/[0.16] text-rose-300 border border-rose-400/40' : 'bg-transparent hover:bg-rose-500/[0.08] text-white/40 hover:text-rose-300 border border-transparent hover:border-rose-400/20'}`}
                  >
                    {confirmingResetSemester
                      ? (language === "german" ? "Wirklich auf Semester 1 zurücksetzen? Erneut klicken" : "Really reset to Semester 1? Click again")
                      : (language === "german" ? "Auf Semester 1 zurücksetzen" : "Reset to Semester 1")}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast notifications (non-blocking alert replacement) */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Prompt viewer modal — podcast prompts & video scripts */}
      <AnimatePresence>
        {promptModal && (
          <motion.div
            {...overlayMotion}
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            onClick={() => setPromptModal(null)}
          >
            <motion.div
              {...modalPanel}
              onClick={(e) => e.stopPropagation()}
              className="card-glass border border-white/[0.1] w-full max-w-2xl max-h-[80dvh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-white/[0.07]">
                <div className="min-w-0">
                  <p className="eyebrow mb-1">{language === "german" ? "Prompt" : "Prompt"}</p>
                  <h3 className="font-display text-base font-medium text-white truncate">{promptModal.title}</h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(promptModal.content)
                        .then(() => addToast("success", language === "german" ? "Kopiert!" : "Copied!"))
                        .catch(() => addToast("error", language === "german" ? "Kopieren fehlgeschlagen." : "Copy failed."));
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-400/[0.1] hover:bg-amber-400/[0.2] border border-amber-400/25 hover:border-amber-400/40 text-amber-300 transition-all cursor-pointer"
                  >
                    {language === "german" ? "Kopieren" : "Copy"}
                  </button>
                  <button
                    onClick={() => setPromptModal(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/40 hover:text-white transition-all cursor-pointer"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <pre className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap font-sans">{promptModal.content}</pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
    </MotionConfig>
  );
}
