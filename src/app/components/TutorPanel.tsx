"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { EASE_OUT, springTactile } from "@/lib/motion";
import {
  ArrowPathIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  SpeakerWaveIcon,
  StopIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { Tip } from "./Tooltip";

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
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.24, ease: EASE_OUT }}
          className="fixed inset-y-0 right-0 z-[70] w-full sm:w-[376px] bg-(--paper-tutor) border-l border-(--hairline-card) flex flex-col print:hidden shadow-(--shadow-e3) xl:shadow-none"
          aria-label={de ? "Live Tutor Chat" : "Live tutor chat"}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-[max(1.1rem,env(safe-area-inset-top))] pb-4 border-b border-(--hairline) shrink-0">
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] text-ink-900 leading-tight font-sans" style={{ fontWeight: 650 }}>
                Live Tutor
              </h3>
              <p className="text-xs text-ink-400 mt-1 leading-snug">
                {de ? "Kennt diese Vorlesung, das Quiz und deine Entwürfe." : "Knows this lecture, the quiz, and your drafts."}
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

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-5">
            {messages.length === 0 && (
              <div className="flex flex-col items-center text-center pt-10 px-2">
                <div className="w-12 h-12 rounded-2xl bg-(--accent-wash-soft) border border-(--accent-border-soft) flex items-center justify-center mb-4">
                  <SparklesIcon className="w-6 h-6 text-amber-500" strokeWidth={1.6} />
                </div>
                <p className="text-ink-900 text-sm font-semibold mb-1.5">
                  {de ? "Dein Tutor kennt diese Vorlesung." : "Your tutor knows this lecture."}
                </p>
                <p className="text-ink-400 text-xs leading-relaxed mb-6 max-w-[280px]">
                  {de
                    ? `${subject} · ${topic} — er sieht die Aufgaben und deine Entwürfe und hilft mit Hinweisen statt Fertiglösungen.`
                    : `${subject} · ${topic} — it sees the tasks and your drafts and helps with hints instead of ready-made solutions.`}
                </p>
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
              </div>
            )}

            {messages.map((msg) => (
              msg.role === "user" ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[86%] bg-paper-2 rounded-[16px_16px_6px_16px] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-ink-900 whitespace-pre-wrap break-words">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="pr-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="caps-label !text-[10.5px] !tracking-[0.12em]">Tutor</span>
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
                  </div>
                  <div className="text-[13.5px] leading-[1.62] text-ink-900/85 whitespace-pre-wrap break-words">
                    {msg.text || (
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
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={de ? "Frag deinen Tutor…" : "Ask your tutor…"}
                className="input-dark flex-1 px-4 py-3 text-sm leading-relaxed resize-none overflow-hidden min-h-[2.9rem] max-h-40 !bg-paper-1"
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
              <span>{de ? "Der Tutor sieht Quiz + Entwürfe." : "The tutor sees quiz + drafts."}</span>
              <span className="inline-flex items-center gap-1"><span className="kbd">↵</span> {de ? "senden" : "send"}</span>
              <span className="inline-flex items-center gap-1"><span className="kbd">⇧</span><span className="kbd">↵</span> {de ? "neue Zeile" : "new line"}</span>
            </p>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body
  );
}
