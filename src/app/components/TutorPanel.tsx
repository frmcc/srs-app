"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { EASE_OUT, springTactile } from "@/lib/motion";
import {
  AcademicCapIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  SpeakerWaveIcon,
  StopIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

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
  role: "user" | "model";
  text: string;
}

interface TutorPanelProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  subject: string;
  topic: string;
  language: string;
  tasks: TutorTask[];
  getDraft: (taskId: string) => string;
}

const HISTORY_CAP = 30;
const storageKey = (itemId: string) => `srs-tutor-chat-${itemId}`;

function loadHistory(itemId: string): TutorMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey(itemId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TutorMessage[];
    return Array.isArray(parsed) ? parsed.slice(-HISTORY_CAP) : [];
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

export default function TutorPanel({ open, onClose, itemId, subject, topic, language, tasks, getDraft }: TutorPanelProps) {
  const de = language !== "english";

  const [messages, setMessages] = useState<TutorMessage[]>(() => loadHistory(itemId));
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  // TTS playback (one message at a time)
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUrlCacheRef = useRef<Map<string, string>>(new Map());

  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);

  // Switch module → load that module's thread.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- swap persisted thread when the module changes
    setMessages(loadHistory(itemId));
    setInput("");
  }, [itemId]);

  useEffect(() => {
    mountedRef.current = true;
    const urlCache = ttsUrlCacheRef.current;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      audioRef.current?.pause();
      urlCache.forEach((url) => URL.revokeObjectURL(url));
      urlCache.clear();
    };
  }, []);

  // Follow the stream: keep the newest content in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [messages, open, streaming]);

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
    try {
      let url = ttsUrlCacheRef.current.get(msg.id);
      if (!url) {
        setTtsLoadingId(msg.id);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: msg.text.slice(0, 4000) }),
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
    } finally {
      setTtsLoadingId(null);
    }
  }, [speakingId, stopSpeaking]);

  const buildDrafts = useCallback((): string => {
    const parts: string[] = [];
    for (const task of tasks) {
      const draft = (getDraft(task.id) || "").trim();
      if (draft) parts.push(`${task.label}:\n${draft}`);
    }
    return parts.join("\n\n");
  }, [tasks, getDraft]);

  const send = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || streaming) return;

    const userMsg: TutorMessage = { id: `u${idRef.current++}`, role: "user", text };
    const modelMsg: TutorMessage = { id: `m${idRef.current++}`, role: "model", text: "" };
    const historyForApi = [...messages, userMsg].map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg, modelMsg]);
    setInput("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";

    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          language: de ? "german" : "english",
          drafts: buildDrafts(),
          messages: historyForApi,
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
        acc = acc || (de
          ? `⚠️ Der Tutor ist gerade nicht erreichbar (${msg.slice(0, 120)}). Versuch es gleich noch einmal.`
          : `⚠️ The tutor is unavailable right now (${msg.slice(0, 120)}). Please try again in a moment.`);
      }
    } finally {
      abortRef.current = null;
      if (mountedRef.current) {
        setStreaming(false);
        setMessages((prev) => {
          const finalText = acc.trim();
          const next = finalText
            ? prev.map((m) => (m.id === modelMsg.id ? { ...m, text: finalText } : m))
            : prev.filter((m) => m.id !== modelMsg.id); // aborted before any content
          saveHistory(itemId, next);
          return next;
        });
      }
    }
  }, [messages, streaming, itemId, de, buildDrafts]);

  const clearThread = useCallback(() => {
    abortRef.current?.abort();
    stopSpeaking();
    setMessages([]);
    setStreaming(false);
    try {
      sessionStorage.removeItem(storageKey(itemId));
    } catch {
      /* noop */
    }
  }, [itemId, stopSpeaking]);

  const suggestions = useMemo(() => {
    const first = tasks[0]?.label ?? (de ? "Aufgabe 1" : "Task 1");
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
  }, [tasks, de]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.aside
          key="tutor-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="fixed inset-y-0 right-0 z-[70] w-full sm:w-[420px] card-glass border-l border-white/[0.1] flex flex-col print:hidden"
          aria-label={de ? "Live Tutor Chat" : "Live tutor chat"}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b border-white/[0.07] shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_4px_16px_-4px_rgba(245,158,11,0.6)] shrink-0">
              <AcademicCapIcon className="w-4.5 h-4.5 text-stone-950" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-medium text-white leading-tight">
                Live <em className="text-gradient italic">Tutor</em>
              </h3>
              <p className="text-[11px] text-white/35 truncate">{subject} · {topic}</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearThread}
                title={de ? "Gespräch zurücksetzen" : "Reset conversation"}
                className="w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-rose-500/15 flex items-center justify-center text-white/35 hover:text-rose-300 transition-colors cursor-pointer shrink-0"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              title={de ? "Schließen" : "Close"}
              className="w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center text-center pt-10 px-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-400/[0.08] border border-amber-400/20 flex items-center justify-center mb-4">
                  <SparklesIcon className="w-6 h-6 text-amber-300" />
                </div>
                <p className="text-white/60 text-sm font-medium mb-1.5">
                  {de ? "Dein Tutor kennt diese Vorlesung." : "Your tutor knows this lecture."}
                </p>
                <p className="text-white/30 text-xs leading-relaxed mb-6 max-w-[280px]">
                  {de
                    ? "Er sieht die Quizaufgaben und deine Entwürfe — und hilft mit Hinweisen statt Fertiglösungen."
                    : "It sees the quiz tasks and your drafts — and helps with hints instead of ready-made solutions."}
                </p>
                <div className="flex flex-col gap-2 w-full">
                  {suggestions.map((s) => (
                    <motion.button
                      key={s}
                      whileTap={{ scale: 0.98 }}
                      transition={springTactile}
                      onClick={() => send(s)}
                      className="text-left text-xs text-white/55 hover:text-amber-100 bg-white/[0.03] hover:bg-amber-400/[0.07] border border-white/[0.08] hover:border-amber-400/25 rounded-xl px-4 py-3 leading-relaxed transition-all cursor-pointer"
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    msg.role === "user"
                      ? "bg-amber-400/[0.12] border border-amber-400/25 text-amber-50 rounded-br-md"
                      : "bg-white/[0.04] border border-white/[0.08] text-white/75 rounded-bl-md"
                  }`}
                >
                  {msg.text || (
                    <span className="inline-flex items-center gap-1.5 text-white/35">
                      <span className="ember-dot w-1.5 h-1.5 rounded-full bg-amber-300" />
                      {de ? "denkt nach…" : "thinking…"}
                    </span>
                  )}
                  {msg.role === "model" && msg.text && (
                    <div className="mt-2 -mb-1 flex justify-end">
                      <button
                        onClick={() => speakMessage(msg)}
                        disabled={ttsLoadingId === msg.id}
                        title={speakingId === msg.id ? (de ? "Stopp" : "Stop") : (de ? "Vorlesen (Gemini-Stimme)" : "Read aloud (Gemini voice)")}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-amber-300 hover:bg-amber-400/[0.08] transition-colors cursor-pointer disabled:cursor-wait"
                      >
                        {ttsLoadingId === msg.id ? (
                          <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                        ) : speakingId === msg.id ? (
                          <StopIcon className="w-3.5 h-3.5 text-amber-300" />
                        ) : (
                          <SpeakerWaveIcon className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="border-t border-white/[0.07] px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] shrink-0">
            <div className="flex items-end gap-2">
              <AutoGrowTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={de ? "Frag deinen Tutor…" : "Ask your tutor…"}
                className="input-dark flex-1 px-4 py-3 text-sm leading-relaxed resize-none overflow-hidden min-h-[2.9rem] max-h-40"
              />
              <motion.button
                whileTap={{ scale: 0.94 }}
                transition={springTactile}
                onClick={() => send(input)}
                disabled={streaming || !input.trim()}
                title={de ? "Senden (Enter)" : "Send (Enter)"}
                className="btn-primary w-11 h-11 rounded-xl flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40"
              >
                {streaming ? (
                  <ArrowPathIcon className="w-4.5 h-4.5 animate-spin" />
                ) : (
                  <PaperAirplaneIcon className="w-4.5 h-4.5" />
                )}
              </motion.button>
            </div>
            <p className="text-[10px] text-white/20 mt-2 px-1">
              {de
                ? "Der Tutor sieht Quiz + Entwürfe. Enter = senden, Shift+Enter = neue Zeile."
                : "The tutor sees quiz + drafts. Enter = send, Shift+Enter = new line."}
            </p>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body
  );
}
