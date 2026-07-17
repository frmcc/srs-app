"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { EASE_OUT, EASE_IN_OUT, springTactile } from "@/lib/motion";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  SpeakerWaveIcon,
  StopIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { Tip } from "./Tooltip";
import ChemText from "./ChemText";
import { stripChemForSpeech } from "@/lib/chem-markup";

/**
 * Live Tutor — the web twin of the iPad audio tutor, as a slide-over chat next
 * to the quiz. Same per-module system prompt and session-memory idea, but:
 * text streaming instead of TTS chunks, and the tutor sees the real quiz tasks
 * + current draft answers instead of a screenshot. Each answer can still be
 * read aloud with the Gemini voice via the existing /api/tts route.
 *
 * History is client-held (like the Cloud Run `sessions` dict) and persisted in
 * sessionStorage per module, so switching tabs doesn't lose the thread.
 */

interface TutorTask {
  id: string;
  label: string;
  questionText: string;
}

interface TutorMessage {
  id: string;
  /** "error" is a transient system row (connection failure) — never persisted, never sent to the model. */
  role: "user" | "model" | "error";
  text: string;
  /** role:"error" only — the failed prompt, so "Erneut senden" can retry it. */
  retryText?: string;
  /** role:"error" only — ids of the failed exchange's user/model rows, pruned on retry. */
  retryUserId?: string;
  retryModelId?: string;
}

interface TutorPanelProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  subject: string;
  topic: string;
  language: string;
  /** Which tutor is loaded: "quiz" while answering (guards the assessment,
   *  hints only) or "assessment" after grading (debriefs with full solutions).
   *  Assessment chats live on their own threads — a quiz-phase conversation
   *  never bleeds into the debrief. */
  phase?: "quiz" | "assessment";
  tasks: TutorTask[];
  getDraft: (taskId: string) => string;
  /** Scribbled answer (PNG data URL) for a task, if the user drew one. Sent to
   *  the tutor when the chat is focused on that task. */
  getSketch?: (taskId: string) => string | undefined;
  /** Grader's per-task assessment (after grading), so a per-task chat opened from
   *  the task-by-task review carries that task's evaluation in its context. */
  getAssessment?: (taskId: string) => string | undefined;
  /** When set, the matching task is pinned at the top of the chat so the
   *  original question stays in view through a long conversation. */
  focusedTaskId?: string | null;
  /** Which quiz sheet the server should inject as context: the current level
   *  quiz, the answered-quiz snapshot (assessment/revisit — the level slot
   *  already holds the follow-up quiz by then), or the comprehension quiz.
   *  Defaults to "current". */
  quizContext?: "current" | "lastAnswered" | "comprehensionCurrent" | "comprehensionAnswered";
}

const HISTORY_CAP = 30;
const storageKey = (itemId: string) => `srs-tutor-chat-${itemId}`;

function loadHistory(itemId: string): TutorMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey(itemId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TutorMessage[];
    // Error rows are transient UI — never replay one as if the tutor said it.
    return Array.isArray(parsed) ? parsed.filter((m) => m && m.role !== "error").slice(-HISTORY_CAP) : [];
  } catch {
    return [];
  }
}

function saveHistory(itemId: string, messages: TutorMessage[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(itemId), JSON.stringify(messages.slice(-HISTORY_CAP)));
  } catch {
    /* quota/private mode — chat still works in memory */
  }
}

export default function TutorPanel({ open, onClose, itemId, subject, topic, language, phase = "quiz", tasks, getDraft, getSketch, getAssessment, focusedTaskId, quizContext = "current" }: TutorPanelProps) {
  const de = language !== "english";
  const assess = phase === "assessment";
  const comp = quizContext === "comprehensionCurrent" || quizContext === "comprehensionAnswered";
  const focusedTask = focusedTaskId ? tasks.find((t) => t.id === focusedTaskId) ?? null : null;
  // Each task's tutor chat is its OWN thread; the header (global) tutor keeps the
  // bare-itemId thread. Keying the stored history by task means a per-task
  // conversation never bleeds into another task's chat or the global one.
  // Assessment-phase chats get their own suffix: the debrief tutor is a
  // different persona with different rules, so it must not inherit a mid-quiz
  // conversation (or vice versa on a repeat attempt). Comprehension chats are
  // about a different quiz sheet entirely — same reasoning, own suffix.
  const threadKey = `${focusedTaskId ? `${itemId}::${focusedTaskId}` : itemId}${comp ? "::comp" : ""}${assess ? "::assess" : ""}`;

  const [messages, setMessages] = useState<TutorMessage[]>(() => loadHistory(threadKey));
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // MT-13: on a coarse pointer (phone/tablet keyboard) there is no Shift+Enter,
  // so Enter must insert a newline instead of sending — the send button is the
  // submit affordance. Resolved after mount, so SSR/first render (fine pointer,
  // Enter-sends) stays stable and only touch devices flip.
  const [coarsePointer, setCoarsePointer] = useState(false);
  // AX-10: completed replies (or failures) are announced once via a hidden
  // polite live region — never every streamed token.
  const [liveNote, setLiveNote] = useState("");

  // TTS playback (one message at a time)
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  // EM-9: acknowledge a failed "Read aloud" tap with a short inline note.
  const [ttsFailedId, setTtsFailedId] = useState<string | null>(null);
  const ttsFailedTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUrlCacheRef = useRef<Map<string, string>>(new Map());

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(false);
  // Tracks the CURRENTLY displayed thread (module + focused task) so an in-flight
  // stream can tell whether the user has since switched away (and must not
  // persist into the wrong thread).
  const threadKeyRef = useRef(threadKey);

  // Switch task or module → abort any in-flight stream, then load that thread.
  useEffect(() => {
    abortRef.current?.abort();
    threadKeyRef.current = threadKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- swap persisted thread when the task/module changes
    setMessages(loadHistory(threadKey));
    setInput("");
  }, [threadKey]);

  // MT-13: detect a coarse pointer once after mount.
  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pointer capability only known client-side
      setCoarsePointer(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const urlCache = ttsUrlCacheRef.current;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      audioRef.current?.pause();
      if (ttsFailedTimerRef.current !== null) window.clearTimeout(ttsFailedTimerRef.current);
      urlCache.forEach((url) => URL.revokeObjectURL(url));
      urlCache.clear();
    };
  }, []);

  // AX-10: the panel is portaled to the end of <body>, so focus never reaches
  // it naturally. The composer autofocuses on open (below); on close, hand
  // focus back to whatever opened the panel (the Tutor toggle).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => opener?.focus();
  }, [open]);

  // MT-11: iOS (especially standalone) does not shrink the layout viewport when
  // the keyboard opens, so a `fixed inset-y-0` panel leaves the pinned composer
  // behind the keys. When the keyboard is open we size/offset the panel off the
  // visualViewport instead — instantaneous, no animated properties.
  //
  // MT-11b: but ONLY when the keyboard is actually open. iOS also fires vv
  // "scroll" during ordinary scrolling, with an offsetTop that oscillates
  // (URL-bar collapse, momentum, rubber-banding). Binding top to it on every
  // scroll made the "fixed" panel drift OPPOSITE to the page on iPhone/iPad —
  // the reported bug. So during normal scroll (keyboard closed) we clear the
  // overrides and let the panel be a plain, truly-fixed inset-y-0.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const el = panelRef.current;
      if (!el) return;
      // Keyboard open ⇒ the visual viewport is well shorter than the layout one.
      const keyboardOpen = window.innerHeight - vv.height > 150;
      if (keyboardOpen) {
        el.style.top = `${vv.offsetTop}px`;
        el.style.height = `${vv.height}px`;
      } else if (el.style.top || el.style.height) {
        el.style.top = "";
        el.style.height = "";
      }
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [open]);

  // MT-12: touch gestures on the panel's NON-scrolling parts (header, pinned
  // task, composer — and the chat while it's too short to scroll) must not
  // hand the pan to the page behind: iOS then rubber-bands <main>/<body>
  // under the fixed panel — the split-view "weird scrolling". Let touches
  // inside any actually-scrollable descendant pan natively; swallow the rest.
  // Non-passive listener — React's synthetic touchmove can't preventDefault.
  useEffect(() => {
    const el = panelRef.current;
    if (!open || !el) return;
    const onTouchMove = (e: TouchEvent) => {
      let n = e.target instanceof Element ? e.target : null;
      while (n && n !== el) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return;
        n = n.parentElement;
      }
      e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [open]);

  // MT-12b: below sm the panel covers the full width — the page behind is
  // invisible, so its scroller is locked outright while the panel is open
  // (scroll-chaining into an invisible page reads as rubber-band jank).
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 639.9px)");
    const root = document.documentElement;
    const apply = () => {
      if (mql.matches) {
        root.style.overflow = "hidden";
        root.style.overscrollBehaviorY = "none";
      } else {
        root.style.overflow = "";
        root.style.overscrollBehaviorY = "";
      }
    };
    apply();
    mql.addEventListener("change", apply);
    return () => {
      mql.removeEventListener("change", apply);
      root.style.overflow = "";
      root.style.overscrollBehaviorY = "";
    };
  }, [open]);

  // Follow the stream: keep the newest content in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [messages, open, streaming]);

  // Esc closes the panel (the close button advertises "— Esc").
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // IS-10: if a higher overlay consumed this press (the dashboard's ordered
      // Escape chain calls preventDefault), one keystroke must close ONE layer.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    setSpeakingId(null);
  }, []);

  const speakMessage = useCallback(async (msg: TutorMessage) => {
    if (speakingId === msg.id) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    setTtsFailedId(null);
    try {
      let url = ttsUrlCacheRef.current.get(msg.id);
      if (!url) {
        setTtsLoadingId(msg.id);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Strip math markup into speakable form first (no-op on plain text).
          body: JSON.stringify({ text: stripChemForSpeech(msg.text, language).slice(0, 4000) }),
        });
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
        url = URL.createObjectURL(await res.blob());
        ttsUrlCacheRef.current.set(msg.id, url);
      }
      if (!mountedRef.current) return;
      // Fresh element per playback; handlers are wired on the LOCAL object
      // before it's stored (keeps the ref itself immutable during use).
      audioRef.current?.pause();
      const audio = new Audio();
      audio.onended = () => setSpeakingId(null);
      audio.onerror = () => setSpeakingId(null);
      audio.src = url;
      audioRef.current = audio;
      setSpeakingId(msg.id);
      await audio.play();
    } catch (err) {
      console.error("[tutor] TTS failed:", err);
      setSpeakingId(null);
      // EM-9: acknowledge the tap — a vanished spinner reads as a broken button.
      setTtsFailedId(msg.id);
      if (ttsFailedTimerRef.current !== null) window.clearTimeout(ttsFailedTimerRef.current);
      ttsFailedTimerRef.current = window.setTimeout(() => setTtsFailedId(null), 5000);
    } finally {
      setTtsLoadingId(null);
    }
  }, [speakingId, stopSpeaking, language]);

  const buildDrafts = useCallback((): string => {
    const parts: string[] = [];
    for (const task of tasks) {
      const draft = (getDraft(task.id) || "").trim();
      if (draft) parts.push(`${task.label}:\n${draft}`);
    }
    return parts.join("\n\n");
  }, [tasks, getDraft]);

  const send = useCallback(async (rawText: string, base?: TutorMessage[]) => {
    const text = rawText.trim();
    if (!text || streaming) return;

    // Collision-proof ids. A per-mount counter restarted at 1 each mount and
    // collided with persisted ids (u1/m2…) from a previous mount, so a streamed
    // reply could overwrite an OLD message and duplicate React keys.
    const userMsg: TutorMessage = { id: `u-${crypto.randomUUID()}`, role: "user", text };
    const modelMsg: TutorMessage = { id: `m-${crypto.randomUUID()}`, role: "model", text: "" };
    const streamThreadKey = threadKey; // the (module + task) thread this exchange belongs to
    // `base` lets "Erneut senden" resend on a thread with the failed exchange
    // pruned. Error rows never reach the model (EM-10).
    const thread = base ?? messages;
    const historyForApi = [...thread, userMsg]
      .filter((m) => m.role !== "error")
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages([...thread, userMsg, modelMsg]);
    setInput("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    let failure: string | null = null;

    try {
      // Per-task chat: tell the tutor to concentrate on THIS task, and send the
      // student's work on it — the typed draft and (once, at the start of the
      // thread) the scribbled answer image, if any.
      const focusDraft = focusedTask ? (getDraft(focusedTask.id) || "").trim() : "";
      const focusAssessment = focusedTask && getAssessment ? (getAssessment(focusedTask.id) || "").trim() : "";
      const rawSketch = focusedTask && getSketch ? getSketch(focusedTask.id) : undefined;
      const focusSketch = thread.length === 0 && rawSketch
        ? rawSketch.replace(/^data:[^,]*,/, "")
        : undefined;
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          language: de ? "german" : "english",
          phase,
          quizContext,
          drafts: buildDrafts(),
          messages: historyForApi,
          focusedTask: focusedTask
            ? { label: focusedTask.label, questionText: focusedTask.questionText, draft: focusDraft, assessment: focusAssessment || undefined }
            : undefined,
          focusedSketch: focusSketch,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setMessages((prev) => prev.map((m) => (m.id === modelMsg.id ? { ...m, text: snapshot } : m)));
      }
      acc += decoder.decode();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("[tutor] chat failed:", err);
        const msg = err instanceof Error ? err.message : String(err);
        failure = msg.slice(0, 120);
      }
    } finally {
      abortRef.current = null;
      if (mountedRef.current) {
        setStreaming(false);
        // If the user switched modules while this streamed, `prev` now holds the
        // OTHER module's messages — persisting here would overwrite that thread.
        // Only commit/persist when we're still on the module this exchange began.
        if (threadKeyRef.current === streamThreadKey) {
          const finalText = acc.trim();
          // EM-10: failures are a distinct system row, not tutor speech.
          const failureText = failure !== null
            ? (de
                ? `Der Tutor ist gerade nicht erreichbar (${failure}).`
                : `The tutor is unavailable right now (${failure}).`)
            : null;
          setMessages((prev) => {
            let next = finalText
              ? prev.map((m) => (m.id === modelMsg.id ? { ...m, text: finalText } : m))
              : prev.filter((m) => m.id !== modelMsg.id); // aborted (or failed) before any content
            if (failureText) {
              next = [...next, {
                id: `e-${crypto.randomUUID()}`,
                role: "error" as const,
                text: failureText,
                retryText: text,
                retryUserId: userMsg.id,
                retryModelId: modelMsg.id,
              }];
            }
            // Never persist error rows — and never persist a partial reply that
            // errored as if the tutor completed it.
            saveHistory(streamThreadKey, next.filter((m) => m.role !== "error" && !(failureText && m.id === modelMsg.id)));
            return next;
          });
          // AX-10: announce the completed reply (or the failure) exactly once.
          const announce = failureText ?? finalText;
          if (announce) setLiveNote(announce);
        }
      }
    }
  }, [messages, streaming, itemId, threadKey, de, phase, quizContext, buildDrafts, focusedTask, getDraft, getSketch, getAssessment]);

  /** "Erneut senden" on an error row: prune the failed exchange, resend the same text. */
  const retrySend = useCallback((errRow: TutorMessage) => {
    if (!errRow.retryText) return;
    const pruned = messages.filter(
      (m) => m.id !== errRow.id && m.id !== errRow.retryUserId && m.id !== errRow.retryModelId,
    );
    send(errRow.retryText, pruned);
  }, [messages, send]);

  const clearThread = useCallback(() => {
    abortRef.current?.abort();
    stopSpeaking();
    setMessages([]);
    setStreaming(false);
    try {
      sessionStorage.removeItem(storageKey(threadKey));
    } catch {
      /* noop */
    }
  }, [threadKey, stopSpeaking]);

  const suggestions = useMemo(() => {
    const first = tasks[0]?.label ?? (de ? "Aufgabe 1" : "Task 1");
    if (assess) {
      return de
        ? [
            "Geh die Bewertung mit mir durch: Wo lag mein Verständnis daneben?",
            `Erkläre mir die Musterlösung zu ${first} — und warum meine Antwort nicht gereicht hat.`,
            "Was ist das Wichtigste, das ich aus diesem Quiz mitnehmen sollte?",
          ]
        : [
            "Walk me through the assessment: where was my understanding off?",
            `Explain the model answer for ${first} — and why mine fell short.`,
            "What's the most important thing to take away from this quiz?",
          ];
    }
    return de
      ? [
          `Gib mir einen Tipp zu ${first} — ohne die Lösung zu verraten.`,
          "Erkläre mir das Kernkonzept dieser Vorlesung in einfachen Worten.",
          "Schau über meine bisherigen Antwort-Entwürfe: Wo bin ich auf dem Holzweg?",
        ]
      : [
          `Give me a hint for ${first} — without revealing the solution.`,
          "Explain the core concept of this lecture in simple terms.",
          "Review my current draft answers: where am I off track?",
        ];
  }, [tasks, de, assess]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.aside
          key="tutor-panel"
          ref={panelRef}
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          // MO-10: exits accelerate away (motion law "Move/close 200ms EASE_IN_OUT")
          // instead of reusing the decelerating entrance curve.
          exit={{ x: 24, opacity: 0, transition: { duration: 0.2, ease: EASE_IN_OUT } }}
          transition={{ duration: 0.24, ease: EASE_OUT }}
          className="fixed inset-y-0 right-0 z-[70] w-full sm:w-[376px] overscroll-y-none bg-(--paper-tutor) border-l border-(--hairline-card) flex flex-col print:hidden shadow-(--shadow-e3) xl:shadow-none"
          aria-label={de ? "Live Tutor Chat" : "Live tutor chat"}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-[max(1.1rem,env(safe-area-inset-top))] pb-4 border-b border-(--hairline) shrink-0">
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] text-ink-900 leading-tight font-sans" style={{ fontWeight: 650 }}>
                Live Tutor
              </h3>
              <p className="text-xs text-ink-400 mt-1 leading-snug">
                {assess
                  ? (de ? "Kennt diese Vorlesung, dein Quiz und die Bewertung." : "Knows this lecture, your quiz, and the assessment.")
                  : (de ? "Kennt diese Vorlesung, das Quiz und deine Entwürfe." : "Knows this lecture, the quiz, and your drafts.")}
              </p>
            </div>
            {messages.length > 0 && (
              <Tip label={de ? "Gespräch zurücksetzen" : "Reset conversation"}>
                <button
                  onClick={clearThread}
                  className="btn-ghost-icon w-8 h-8 flex items-center justify-center hover:!text-(--grade-fail-accent) hover:!bg-(--grade-fail-wash) cursor-pointer shrink-0"
                >
                  <TrashIcon className="w-4 h-4" strokeWidth={1.6} />
                </button>
              </Tip>
            )}
            <Tip label={de ? "Schließen — Esc" : "Close — Esc"}>
              <button
                onClick={onClose}
                className="btn-ghost-icon w-8 h-8 flex items-center justify-center cursor-pointer shrink-0"
              >
                <XMarkIcon className="w-4 h-4" strokeWidth={1.6} />
              </button>
            </Tip>
          </div>

          {/* AX-10: hidden polite live region — completed replies/failures only. */}
          <div aria-live="polite" role="status" className="sr-only">
            {liveNote}
          </div>

          {/* Pinned task — stays in view through a long conversation so the
              student never loses the question they opened the tutor for. Sticky
              inside the scroll area; sits above the messages. */}
          {focusedTask && (
            <div className="shrink-0 px-4 pt-3 pb-3 border-b border-(--hairline) bg-(--paper-tutor)">
              <div className="rounded-2xl border border-(--accent-border-soft) bg-(--accent-wash-soft) px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MapPinIcon className="w-3.5 h-3.5 text-(--accent-text-strong)" strokeWidth={1.8} />
                  <span className="caps-label !text-(--accent-text-strong)">{focusedTask.label}</span>
                </div>
                <p className="text-[13px] leading-[1.5] text-ink-900 line-clamp-4 whitespace-pre-wrap">
                  <ChemText inline text={focusedTask.questionText} />
                </p>
              </div>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-5 py-5 space-y-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center text-center pt-10 px-2">
                <div className="w-12 h-12 rounded-2xl bg-(--accent-wash-soft) border border-(--accent-border-soft) flex items-center justify-center mb-4">
                  <SparklesIcon className="w-6 h-6 text-amber-500" strokeWidth={1.6} />
                </div>
                <p className="text-ink-900 text-sm font-semibold mb-1.5">
                  {focusedTask
                    ? (de ? "Fokus auf diese Aufgabe." : "Focused on this task.")
                    : (de ? "Dein Tutor kennt diese Vorlesung." : "Your tutor knows this lecture.")}
                </p>
                <p className="text-ink-400 text-xs leading-relaxed mb-6 max-w-[280px]">
                  {focusedTask
                    ? (assess
                        ? (de
                            ? "Er sieht diese Frage, deine Antwort und die Bewertung des Prüfers — und erklärt, bis es wirklich sitzt. Frag einfach los."
                            : "It sees this question, your answer, and the examiner's assessment — and explains until it truly clicks. Just ask.")
                        : (de
                            ? "Er sieht diese Frage und deine bisherige Antwort und hilft mit Hinweisen statt Fertiglösungen. Frag einfach los."
                            : "It sees this question and your current answer, and helps with hints instead of ready-made solutions. Just ask."))
                    : (assess
                        ? (de
                            ? `${subject} · ${topic} — das Quiz ist bewertet. Jetzt geht es nur noch ums Verstehen: Er erklärt Lösungen vollständig.`
                            : `${subject} · ${topic} — the quiz is graded. Now it's all about understanding: it explains solutions in full.`)
                        : (de
                            ? `${subject} · ${topic} — er sieht die Aufgaben und deine Entwürfe und hilft mit Hinweisen statt Fertiglösungen.`
                            : `${subject} · ${topic} — it sees the tasks and your drafts and helps with hints instead of ready-made solutions.`))}
                </p>
                {/* Suggestion chips are for the general chat only — a per-task
                    chat is already scoped, so they'd just be noise. */}
                {!focusedTask && (
                  <div className="flex flex-col gap-2 w-full">
                    {suggestions.map((s) => (
                      <motion.button
                        key={s}
                        whileTap={{ scale: 0.985 }}
                        transition={springTactile}
                        onClick={() => send(s)}
                        className="text-left text-xs text-ink-600 hover:text-ink-900 bg-paper-1 hover:bg-paper-2 border border-(--hairline-card) rounded-xl px-4 py-3 leading-relaxed transition-colors cursor-pointer"
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg) => (
              msg.role === "user" ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[86%] bg-paper-2 rounded-[16px_16px_6px_16px] px-3.5 py-2.5 text-sm leading-[1.55] text-ink-900 whitespace-pre-wrap break-words">
                    {msg.text}
                  </div>
                </div>
              ) : msg.role === "error" ? (
                /* EM-10: connection failures are a system row (clay wash, warning
                   icon, retry) — visually distinct from tutor speech, no emoji. */
                <div key={msg.id} className="flex items-start gap-2.5 rounded-xl bg-(--grade-fail-wash) border border-(--grade-fail-border) px-3.5 py-3 text-[13px] leading-relaxed text-(--grade-fail-text)">
                  <ExclamationTriangleIcon className="w-[18px] h-[18px] shrink-0 mt-0.5 text-(--grade-fail-accent)" strokeWidth={1.6} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words">{msg.text}</p>
                    {msg.retryText && (
                      <button
                        onClick={() => retrySend(msg)}
                        disabled={streaming}
                        className="mt-1.5 font-semibold underline underline-offset-2 hover:text-(--grade-fail-accent) cursor-pointer disabled:cursor-default"
                      >
                        {de ? "Erneut senden" : "Send again"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="pr-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="caps-label !tracking-[0.12em]">Tutor</span>
                    {msg.text && (
                      <Tip label={speakingId === msg.id ? (de ? "Stopp" : "Stop") : (de ? "Vorlesen (Gemini-Stimme)" : "Read aloud (Gemini voice)")}>
                      <button
                        onClick={() => speakMessage(msg)}
                        disabled={ttsLoadingId === msg.id}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-ink-400 hover:text-(--accent-text) hover:bg-(--accent-wash-soft) transition-colors cursor-pointer disabled:cursor-wait"
                      >
                        {ttsLoadingId === msg.id ? (
                          <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                        ) : speakingId === msg.id ? (
                          <StopIcon className="w-3.5 h-3.5 text-amber-600" strokeWidth={1.6} />
                        ) : (
                          <SpeakerWaveIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
                        )}
                      </button>
                      </Tip>
                    )}
                    {ttsFailedId === msg.id && (
                      /* EM-9: the tap is acknowledged instead of failing silently. */
                      <span className="text-[11px] text-(--grade-fail-text)">
                        {de ? "Vorlesen gerade nicht möglich" : "Read-aloud is unavailable right now"}
                      </span>
                    )}
                  </div>
                  <div className="text-sm leading-[1.62] text-ink-900/85 whitespace-pre-wrap break-words">
                    {msg.text ? (
                      <ChemText text={msg.text} />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-ink-400">
                        <span className="ember-dot w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {de ? "denkt nach…" : "thinking…"}
                      </span>
                    )}
                  </div>
                </div>
              )
            ))}
          </div>

          {/* Composer */}
          <div className="border-t border-(--hairline) px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] shrink-0">
            <div className="flex items-end gap-2">
              <AutoGrowTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // MT-13: coarse pointers let Enter insert a newline (send button submits).
                  if (!coarsePointer && e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                // AX-10: focus moves into the portaled panel on open; the label
                // survives once typed text hides the placeholder.
                autoFocus
                aria-label={de ? "Frag deinen Tutor" : "Ask your tutor"}
                placeholder={de ? "Frag deinen Tutor…" : "Ask your tutor…"}
                /* text-base (16px) on mobile stops iOS auto-zooming on focus; sm+ keeps 14px. */
                className="input-dark flex-1 px-4 py-3 text-base sm:text-sm leading-relaxed resize-none overflow-hidden min-h-[2.9rem] max-h-40 !bg-paper-1"
              />
              <Tip label={de ? "Senden — ↵" : "Send — ↵"}>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  transition={springTactile}
                  onClick={() => send(input)}
                  disabled={streaming || !input.trim()}
                  className="btn-primary w-11 h-11 !rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
                >
                  {streaming ? (
                    <ArrowPathIcon className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <PaperAirplaneIcon className="w-4.5 h-4.5" strokeWidth={1.6} />
                  )}
                </motion.button>
              </Tip>
            </div>
            <p className="text-[11px] text-ink-400 mt-2 px-1 flex items-center gap-1.5 flex-wrap">
              <span>
                {assess
                  ? (de ? "Der Tutor sieht Quiz + Bewertung." : "The tutor sees quiz + assessment.")
                  : (de ? "Der Tutor sieht Quiz + Entwürfe." : "The tutor sees quiz + drafts.")}
              </span>
              {/* MT-13: the Enter/Shift+Enter chords don't exist on a touch keyboard. */}
              {!coarsePointer && (
                <>
                  <span className="inline-flex items-center gap-1"><span className="kbd">↵</span> {de ? "senden" : "send"}</span>
                  <span className="inline-flex items-center gap-1"><span className="kbd">⇧</span><span className="kbd">↵</span> {de ? "neue Zeile" : "new line"}</span>
                </>
              )}
            </p>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body
  );
}
