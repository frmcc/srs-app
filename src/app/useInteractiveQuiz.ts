"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type InteractivePhase = "idle" | "loading" | "speaking" | "listening";

interface InteractiveTask {
  id: string;
  questionText: string;
}

// --- Minimal Web Speech API typings (not in the default DOM lib everywhere) ---
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResultLike {
  isFinal: boolean;
  0: SpeechAlternative;
}
interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A short silent WAV data-URI, played inside the start gesture to unlock HTMLAudio on iOS. */
function silentWavUri(): string {
  const dataLen = 256;
  const buf = new Uint8Array(44 + dataLen);
  const dv = new DataView(buf.buffer);
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  dv.setUint32(4, 36 + dataLen, true);
  buf.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  buf.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 16000, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  buf.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  dv.setUint32(40, dataLen, true);
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

/** The spoken command that advances to the next task (umlaut-tolerant + EN fallback). */
const TRIGGER_RE = /n[aä]chste\s+aufgabe|next\s+(?:task|question)/i;

interface Options {
  tasks: InteractiveTask[];
  /** BCP-47 language for speech recognition. The trigger phrase is German. */
  recognitionLang?: string;
  /** Live-fill the answer box for a task as the user speaks. */
  onAnswer: (taskId: string, text: string) => void;
}

/**
 * Drives "interactive mode": reads each question aloud (Gemini TTS via /api/tts),
 * then dictates the user's spoken answer into the box until they say "nächste
 * Aufgabe", advancing through every task. Audio for all questions is preloaded in
 * parallel so playback never waits on the whole set.
 */
export function useInteractiveQuiz({ tasks, recognitionLang = "de-DE", onAnswer }: Options) {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [phase, setPhaseState] = useState<InteractivePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => getSpeechRecognitionCtor() !== null);

  // Refs mirror props/state for use inside async callbacks / Web Speech event
  // handlers. They are synced in an effect below (not during render).
  const tasksRef = useRef(tasks);
  const onAnswerRef = useRef(onAnswer);
  const langRef = useRef(recognitionLang);

  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const indexRef = useRef(-1);
  const phaseRef = useRef<InteractivePhase>("idle");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListenRef = useRef(false);
  const finalRef = useRef(""); // final transcript accumulated for the current task
  const ttsCacheRef = useRef<Map<number, Promise<string>>>(new Map());
  const blobUrlsRef = useRef<string[]>([]);

  // Mutually-recursive orchestration is stored in refs (kept in sync below) so the
  // pieces stay stable and can call each other without dependency cycles.
  const advanceRef = useRef<() => void>(() => {});
  const playRef = useRef<(i: number) => void>(() => {});
  const listenRef = useRef<(i: number) => void>(() => {});
  const runRecognizerRef = useRef<(i: number) => void>(() => {});

  const setPhase = useCallback((p: InteractivePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const fetchTts = useCallback((i: number): Promise<string> => {
    const cached = ttsCacheRef.current.get(i);
    if (cached) return cached;
    const p = (async () => {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: tasksRef.current[i]?.questionText ?? "" }),
      });
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      blobUrlsRef.current.push(url);
      return url;
    })();
    ttsCacheRef.current.set(i, p);
    return p;
  }, []);

  const teardownRecognition = useCallback(() => {
    wantListenRef.current = false;
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try {
        r.abort();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  // Create + start a recognizer for task i. Browsers stop recognition after a
  // pause, so onend restarts it while we still want to listen — finalRef is
  // preserved across restarts so the answer keeps growing instead of resetting.
  const runRecognizer = useCallback((i: number) => {
    const Ctor = getSpeechRecognitionCtor();
    const task = tasksRef.current[i];
    if (!Ctor || !task) return;
    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let r = e.resultIndex; r < e.results.length; r++) {
        const result = e.results[r];
        const txt = result[0]?.transcript ?? "";
        if (result.isFinal) finalRef.current += txt + " ";
        else interim += txt;
      }
      const combined = (finalRef.current + interim).replace(/\s+/g, " ").trim();
      const m = combined.match(TRIGGER_RE);
      if (m && typeof m.index === "number") {
        onAnswerRef.current(task.id, combined.slice(0, m.index).trim());
        advanceRef.current();
        return;
      }
      onAnswerRef.current(task.id, combined);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setError("Mikrofon-Zugriff wurde blockiert. Bitte erlaube das Mikrofon und starte erneut.");
        wantListenRef.current = false;
      }
    };
    rec.onend = () => {
      if (wantListenRef.current && activeRef.current && !pausedRef.current && indexRef.current === i) {
        runRecognizerRef.current(i); // restart (browsers stop after a pause); finalRef preserved
      }
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      /* transient double-start; onend will retry */
    }
  }, []);

  const beginListening = useCallback(
    (i: number) => {
      if (!activeRef.current || pausedRef.current) return;
      finalRef.current = "";
      wantListenRef.current = true;
      setPhase("listening");
      if (!getSpeechRecognitionCtor()) {
        setError("Spracherkennung wird in diesem Browser nicht unterstützt — nutze den „Nächste“-Button, um weiterzugehen.");
        return;
      }
      runRecognizerRef.current(i);
    },
    [setPhase],
  );

  const playQuestion = useCallback(
    async (i: number) => {
      if (!activeRef.current) return;
      setPhase("loading");
      let url: string | null = null;
      try {
        url = await fetchTts(i);
      } catch (e) {
        console.error("[interactive] tts error", e);
      }
      if (!activeRef.current || pausedRef.current || indexRef.current !== i) return;

      // Parallel-preload the remaining questions so later playback never waits.
      for (let k = i + 1; k < tasksRef.current.length; k++) fetchTts(k).catch(() => {});

      if (!url) {
        setError("Sprachausgabe fehlgeschlagen — das Diktat startet trotzdem.");
        listenRef.current(i);
        return;
      }

      const a = audioRef.current ?? new Audio();
      audioRef.current = a;
      a.onended = () => {
        if (activeRef.current && !pausedRef.current && indexRef.current === i) listenRef.current(i);
      };
      a.onerror = () => {
        if (activeRef.current && !pausedRef.current && indexRef.current === i) listenRef.current(i);
      };
      a.muted = false;
      a.src = url;
      setPhase("speaking");
      try {
        await a.play();
      } catch {
        // Autoplay blocked despite the unlock — fall back to dictation.
        if (activeRef.current && !pausedRef.current && indexRef.current === i) listenRef.current(i);
      }
    },
    [fetchTts, setPhase],
  );

  const cleanup = useCallback(() => {
    teardownRecognition();
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
      } catch {
        /* noop */
      }
      a.onended = null;
      a.onerror = null;
    }
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];
    ttsCacheRef.current.clear();
  }, [teardownRecognition]);

  const stop = useCallback(() => {
    activeRef.current = false;
    pausedRef.current = false;
    indexRef.current = -1;
    cleanup();
    setActive(false);
    setPaused(false);
    setCurrentIndex(-1);
    setPhase("idle");
  }, [cleanup, setPhase]);

  const advance = useCallback(() => {
    teardownRecognition();
    const next = indexRef.current + 1;
    if (next >= tasksRef.current.length) {
      stop();
      return;
    }
    indexRef.current = next;
    setCurrentIndex(next);
    playRef.current(next);
  }, [teardownRecognition, stop]);

  // Keep the mirror + recursion refs pointed at the latest values/closures. All
  // ref consumers run post-mount via user interaction, so syncing in an effect
  // (rather than during render) is both correct and lint-clean.
  useEffect(() => {
    tasksRef.current = tasks;
    onAnswerRef.current = onAnswer;
    langRef.current = recognitionLang;
    advanceRef.current = advance;
    playRef.current = playQuestion;
    listenRef.current = beginListening;
    runRecognizerRef.current = runRecognizer;
  });

  const start = useCallback(() => {
    if (activeRef.current || !tasksRef.current.length) return;
    setError(null);
    activeRef.current = true;
    pausedRef.current = false;
    indexRef.current = 0;
    setActive(true);
    setPaused(false);
    setCurrentIndex(0);

    // iOS: unlock HTMLAudio inside the user gesture with a silent clip.
    const a = new Audio();
    a.src = silentWavUri();
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
      })
      .catch(() => {});
    audioRef.current = a;

    fetchTts(0).catch(() => {});
    for (let k = 1; k < tasksRef.current.length; k++) fetchTts(k).catch(() => {});
    playRef.current(0);
  }, [fetchTts]);

  const togglePause = useCallback(() => {
    if (!activeRef.current) return;
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      const i = indexRef.current;
      const ph = phaseRef.current;
      if (ph === "speaking" && audioRef.current) audioRef.current.play().catch(() => {});
      else if (ph === "loading") playRef.current(i);
      else listenRef.current(i);
    } else {
      pausedRef.current = true;
      setPaused(true);
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          /* noop */
        }
      }
      teardownRecognition();
    }
  }, [teardownRecognition]);

  useEffect(
    () => () => {
      activeRef.current = false;
      cleanup();
    },
    [cleanup],
  );

  return { active, paused, currentIndex, phase, error, supported, start, stop, togglePause, next: advance };
}
