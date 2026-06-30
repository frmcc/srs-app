"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type InteractivePhase = "idle" | "loading" | "speaking" | "listening";
export type DictationMode = "gemini" | "browser";

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

// The spoken command that advances to the next task. Broad on purpose — speech
// recognition rarely returns "nächste Aufgabe" exactly.
const TRIGGER_RE = /n[aäe]chst\w*\s+(?:aufgabe|frage)|next\s+(?:task|question|one)/i;

/** Split a transcript at the trigger phrase: everything before it is the answer. */
function cutAtTrigger(text: string): { answer: string; triggered: boolean } {
  const m = text.match(TRIGGER_RE);
  if (m && typeof m.index === "number") {
    return { answer: text.slice(0, m.index).trim(), triggered: true };
  }
  return { answer: text.trim(), triggered: false };
}

/** Pick a MediaRecorder mime the browser supports (iOS → mp4/aac, Chrome → webm/opus). */
function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"]) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return "";
}

interface Options {
  tasks: InteractiveTask[];
  /** Spoken-language hint (the trigger phrase is German). de-DE for browser STT. */
  language?: string;
  /** "gemini" = server transcription (reliable on iOS); "browser" = Web Speech API. */
  dictationMode?: DictationMode;
  /** Live-fill the answer box for a task as the user speaks. */
  onAnswer: (taskId: string, text: string) => void;
}

/**
 * Drives "interactive mode": reads each question aloud (Gemini TTS), then captures
 * the spoken answer until the user says "nächste Aufgabe". Dictation has two
 * engines, switchable in settings: "gemini" records the answer and transcribes it
 * server-side every couple of seconds (reliable on iOS), "browser" uses the native
 * Web Speech API (instant, but flaky on iOS Safari).
 */
export function useInteractiveQuiz({ tasks, language = "German", dictationMode = "gemini", onAnswer }: Options) {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [phase, setPhaseState] = useState<InteractivePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    const media = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
    return media || getSpeechRecognitionCtor() !== null;
  });

  // Refs mirror props/state for use inside async callbacks. Synced in an effect below.
  const tasksRef = useRef(tasks);
  const onAnswerRef = useRef(onAnswer);
  const langRef = useRef(language);
  const modeRef = useRef(dictationMode);

  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const indexRef = useRef(-1);
  const phaseRef = useRef<InteractivePhase>("idle");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<number, Promise<string>>>(new Map());
  const blobUrlsRef = useRef<string[]>([]);

  // --- gemini (record + transcribe) ---
  const micPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcribingRef = useRef(false);
  const recMimeRef = useRef("audio/webm");

  // --- browser (Web Speech API) ---
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListenRef = useRef(false);
  const finalRef = useRef("");

  // Mutually-recursive orchestration stored in refs (kept in sync below).
  const advanceRef = useRef<() => void>(() => {});
  const playRef = useRef<(i: number) => void>(() => {});
  const listenRef = useRef<(i: number) => void>(() => {});
  const transcribeRef = useRef<(i: number) => void>(() => {});
  const runRecognizerRef = useRef<(i: number) => void>(() => {});

  const setPhase = useCallback((p: InteractivePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const fetchTts = useCallback((i: number): Promise<string> => {
    const cached = ttsCacheRef.current.get(i);
    if (cached) return cached;
    const p = (async () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 25000); // never hang the "loading" state on a slow/stuck TTS
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: tasksRef.current[i]?.questionText ?? "" }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
        const url = URL.createObjectURL(await res.blob());
        blobUrlsRef.current.push(url);
        return url;
      } finally {
        clearTimeout(timeout);
      }
    })();
    ttsCacheRef.current.set(i, p);
    return p;
  }, []);

  // --- browser STT ---------------------------------------------------------
  const teardownRecognition = useCallback(() => {
    wantListenRef.current = false;
    const r = recognitionRef.current;
    recognitionRef.current = null;
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

  const runRecognizer = useCallback((i: number) => {
    const Ctor = getSpeechRecognitionCtor();
    const task = tasksRef.current[i];
    if (!Ctor || !task) return;
    const rec = new Ctor();
    rec.lang = langRef.current === "English" ? "en-US" : "de-DE";
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
      const { answer, triggered } = cutAtTrigger(combined);
      if (triggered) {
        onAnswerRef.current(task.id, answer);
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
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      /* transient double-start; onend will retry */
    }
  }, []);

  // --- gemini STT ----------------------------------------------------------
  const stopRecorder = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
    chunksRef.current = [];
    transcribingRef.current = false;
  }, []);

  const transcribePoll = useCallback(async (i: number) => {
    if (transcribingRef.current || !chunksRef.current.length) return;
    transcribingRef.current = true;
    try {
      const blob = new Blob(chunksRef.current, { type: recMimeRef.current });
      const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(langRef.current)}`, {
        method: "POST",
        headers: { "Content-Type": recMimeRef.current },
        body: blob,
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!activeRef.current || pausedRef.current || indexRef.current !== i) return;
      if (!res.ok || data.error) {
        setError("Transkription fehlgeschlagen — nutze den „Nächste“-Button, um weiterzugehen.");
        return;
      }
      const task = tasksRef.current[i];
      if (!task) return;
      const { answer, triggered } = cutAtTrigger(String(data.text ?? ""));
      if (answer) onAnswerRef.current(task.id, answer); // don't clear the box on a silent poll
      if (triggered) advanceRef.current();
    } catch (e) {
      console.warn("[interactive] transcribe failed", e);
    } finally {
      transcribingRef.current = false;
    }
  }, []);

  /** Stop whichever listening engine is active. Both teardowns are no-ops if idle. */
  const stopListening = useCallback(() => {
    teardownRecognition();
    stopRecorder();
  }, [teardownRecognition, stopRecorder]);

  const beginListening = useCallback(
    async (i: number) => {
      if (!activeRef.current || pausedRef.current) return;
      setPhase("listening");

      if (modeRef.current === "browser") {
        if (!getSpeechRecognitionCtor()) {
          setError("Standard-Spracherkennung wird in diesem Browser nicht unterstützt — wechsle in den Einstellungen zu Gemini.");
          return;
        }
        finalRef.current = "";
        wantListenRef.current = true;
        runRecognizerRef.current(i);
        return;
      }

      // gemini: record + transcribe
      const stream = micPromiseRef.current ? await micPromiseRef.current : null;
      if (!activeRef.current || pausedRef.current || indexRef.current !== i) return;
      if (!stream) {
        setError("Mikrofon nicht verfügbar — bitte Zugriff erlauben, oder nutze den „Nächste“-Button.");
        return;
      }
      chunksRef.current = [];
      const mime = pickRecorderMime();
      let rec: MediaRecorder;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        try {
          rec = new MediaRecorder(stream);
        } catch {
          setError("Aufnahme wird in diesem Browser nicht unterstützt — nutze den „Nächste“-Button.");
          return;
        }
      }
      recMimeRef.current = (rec.mimeType || mime || "audio/webm").split(";")[0];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      try {
        rec.start(1000); // emit a chunk every second
      } catch {
        /* noop */
      }
      pollTimerRef.current = setInterval(() => transcribeRef.current(i), 2500);
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
        if (activeRef.current && !pausedRef.current && indexRef.current === i) listenRef.current(i);
      }
    },
    [fetchTts, setPhase],
  );

  const cleanup = useCallback(() => {
    stopListening();
    if (micPromiseRef.current) {
      micPromiseRef.current.then((s) => s?.getTracks().forEach((t) => t.stop())).catch(() => {});
      micPromiseRef.current = null;
    }
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
  }, [stopListening]);

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
    stopListening();
    const next = indexRef.current + 1;
    if (next >= tasksRef.current.length) {
      stop();
      return;
    }
    indexRef.current = next;
    setCurrentIndex(next);
    playRef.current(next);
  }, [stopListening, stop]);

  const previous = useCallback(() => {
    stopListening();
    const prev = indexRef.current - 1;
    if (prev < 0) return; // already at the first question
    indexRef.current = prev;
    setCurrentIndex(prev);
    playRef.current(prev);
  }, [stopListening]);

  // Keep the mirror + recursion refs pointed at the latest values/closures.
  useEffect(() => {
    tasksRef.current = tasks;
    onAnswerRef.current = onAnswer;
    langRef.current = language;
    modeRef.current = dictationMode;
    advanceRef.current = advance;
    playRef.current = playQuestion;
    listenRef.current = beginListening;
    transcribeRef.current = transcribePoll;
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

    // Gemini mode: acquire the mic inside the user gesture (required on iOS).
    // Browser mode lets the Web Speech API manage its own microphone.
    if (modeRef.current === "gemini") {
      micPromiseRef.current =
        typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
          ? navigator.mediaDevices.getUserMedia({ audio: true }).catch((e) => {
              console.warn("[interactive] mic denied", e);
              return null;
            })
          : Promise.resolve(null);
    }

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
      if (ph === "speaking" && audioRef.current) {
        audioRef.current.play().catch(() => {});
      } else if (ph === "loading") {
        playRef.current(i);
      } else if (modeRef.current === "gemini" && recorderRef.current?.state === "paused") {
        // Resume the same recording so the answer keeps growing.
        try {
          recorderRef.current.resume();
        } catch {
          /* noop */
        }
        if (!pollTimerRef.current) pollTimerRef.current = setInterval(() => transcribeRef.current(i), 2500);
      } else {
        listenRef.current(i);
      }
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
      // Pause/stop whichever engine is active.
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") {
        try {
          rec.pause();
        } catch {
          /* noop */
        }
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
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

  return { active, paused, currentIndex, total: tasks.length, phase, error, supported, start, stop, togglePause, previous, next: advance };
}
