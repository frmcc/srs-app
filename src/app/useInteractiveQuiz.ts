"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripChemForSpeech } from "@/lib/chem-markup";

export type InteractivePhase = "idle" | "loading" | "speaking" | "listening";
export type DictationMode = "hybrid" | "gemini" | "browser";

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

// --- Minimal Screen Wake Lock typings (same spirit as the SpeechRecognition ones above) ---
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

function getWakeLock(): { request(type: "screen"): Promise<WakeLockSentinelLike> } | null {
  if (typeof navigator === "undefined") return null;
  const n = navigator as unknown as {
    wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
  };
  return n.wakeLock ?? null;
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

/**
 * Error copy in the session's UI language. The hook already localizes STT/TTS
 * from the same `language` option — failure toasts must speak it too.
 */
function errMsg(lang: string, de: string, en: string): string {
  return lang === "English" ? en : de;
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
  /**
   * "hybrid"  = instant browser dictation live-fills the box; on "nächste Aufgabe"
   *             the recorded audio is AI-transcribed once and REPLACES the live text.
   * "gemini"  = record + server transcription every few seconds (no live text).
   * "browser" = Web Speech API only (instant, but flaky on iOS Safari).
   */
  dictationMode?: DictationMode;
  /** Live-fill the answer box for a task as the user speaks. */
  onAnswer: (taskId: string, text: string) => void;
  /**
   * Read the CURRENT answer text for a task. Used by the hybrid finalizer to
   * make sure the AI transcript only replaces the exact text the dictation
   * wrote — never a manual edit the user made in the meantime.
   */
  getAnswer?: (taskId: string) => string;
}

/**
 * Drives "interactive mode": reads each question aloud (Gemini TTS, with a
 * browser speechSynthesis fallback), then captures the spoken answer until the
 * user says "nächste Aufgabe".
 *
 * Hybrid dictation (default): the native Web Speech API types INSTANTLY into
 * the answer box while a MediaRecorder captures the same audio. On advance
 * (voice trigger or button) exactly ONE server transcription runs and
 * overwrites the browser text for that task — instant feel, studio-quality
 * final result, no 2.5s polling.
 */
export function useInteractiveQuiz({ tasks, language = "German", dictationMode = "hybrid", onAnswer, getAnswer }: Options) {
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
  const getAnswerRef = useRef(getAnswer);
  const langRef = useRef(language);
  const modeRef = useRef(dictationMode);

  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const indexRef = useRef(-1);
  const phaseRef = useRef<InteractivePhase>("idle");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<number, Promise<string>>>(new Map());
  const blobUrlsRef = useRef<string[]>([]);
  // In-flight TTS fetch controllers, so cleanup()/stop() can abort them —
  // otherwise a fetch resolving AFTER cleanup pushes a blob URL into the emptied
  // array and leaks it (and wastes a paid TTS call).
  const ttsControllersRef = useRef<Set<AbortController>>(new Set());
  // Keep the active utterance referenced — Chrome garbage-collects it mid-speech otherwise.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // --- screen wake lock (MT-8): hands-free mode must survive the phone's auto-lock ---
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  // --- recorder (hybrid + gemini) ---
  const micPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcribingRef = useRef(false);
  const recMimeRef = useRef("audio/webm");

  // --- browser recognition (hybrid + browser) ---
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListenRef = useRef(false);
  const finalRef = useRef("");

  // --- hybrid orchestration ---
  /** Latest combined (final+interim) browser transcript for the CURRENT task. */
  const lastCombinedRef = useRef("");
  /** Task index the last listen session belonged to (preserves text across pause/resume). */
  const lastListenTaskRef = useRef(-1);
  /** True once the current listening session has been finalized (guards double-advance). */
  const finalizedRef = useRef(false);
  /**
   * Session-level flag: hybrid degraded to record+poll because recognition is
   * unusable on this device. Sticky for the whole session — retrying the dead
   * engine on every task would add seconds of silent latency each time.
   */
  const degradedRef = useRef(false);
  /** Recognition health for the current session (degrade after repeated silent restarts). */
  const recRestartsRef = useRef(0);
  const recGotResultRef = useRef(false);

  // Mutually-recursive orchestration stored in refs (kept in sync below).
  const advanceLockRef = useRef(false);
  const advanceRef = useRef<() => void>(() => {});
  const playRef = useRef<(i: number) => void>(() => {});
  const listenRef = useRef<(i: number) => void>(() => {});
  const transcribeRef = useRef<(i: number) => void>(() => {});
  const runRecognizerRef = useRef<(i: number) => void>(() => {});
  const degradeRef = useRef<(i: number) => void>(() => {});

  const setPhase = useCallback((p: InteractivePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  /**
   * MT-8: the whole point of interactive mode is that the phone lies on the
   * desk while the student talks — without a wake lock, iOS auto-locks during
   * the long TTS/loading phases and kills audio + mic mid-task. Best-effort:
   * a denied request (battery saver, unsupported browser) never blocks the quiz.
   */
  const requestWakeLock = useCallback(() => {
    const wl = getWakeLock();
    if (!wl) return;
    wl.request("screen")
      .then((sentinel) => {
        if (!activeRef.current) {
          sentinel.release().catch(() => {});
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
      })
      .catch(() => {
        /* denied — the session still works, the screen may just sleep */
      });
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // The OS silently releases the lock whenever the app is backgrounded —
  // re-acquire when the student returns to a still-running session.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && activeRef.current && !wakeLockRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [requestWakeLock]);

  const cancelSynthesis = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    }
    utteranceRef.current = null;
  }, []);

  const fetchTts = useCallback((i: number): Promise<string> => {
    const cached = ttsCacheRef.current.get(i);
    if (cached) return cached;
    const p: Promise<string> = (async () => {
      const ctrl = new AbortController();
      ttsControllersRef.current.add(ctrl);
      const timeout = setTimeout(() => ctrl.abort(), 25000); // never hang the "loading" state on a slow/stuck TTS
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: stripChemForSpeech(tasksRef.current[i]?.questionText ?? "", langRef.current === "English" ? "english" : "german") }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          // Surface the server's actual reason (e.g. "model not found") — it
          // used to be discarded, which made TTS failures undiagnosable and
          // silently dropped the session to the robotic fallback voice.
          const detail = await res.text().catch(() => "");
          console.error(`[interactive] Gemini TTS failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
          throw new Error(`TTS HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
        }
        const url = URL.createObjectURL(await res.blob());
        blobUrlsRef.current.push(url);
        return url;
      } finally {
        clearTimeout(timeout);
        ttsControllersRef.current.delete(ctrl);
      }
    })();
    // A FAILED request must not poison the cache: evict it so replays and
    // navigation get a fresh attempt (rate limits clear within a minute).
    p.catch(() => {
      if (ttsCacheRef.current.get(i) === p) ttsCacheRef.current.delete(i);
    });
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
      recGotResultRef.current = true;
      let interim = "";
      for (let r = e.resultIndex; r < e.results.length; r++) {
        const result = e.results[r];
        const txt = result[0]?.transcript ?? "";
        if (result.isFinal) finalRef.current += txt + " ";
        else interim += txt;
      }
      const combined = (finalRef.current + interim).replace(/\s+/g, " ").trim();
      lastCombinedRef.current = combined;
      const { answer, triggered } = cutAtTrigger(combined);
      if (triggered) {
        onAnswerRef.current(task.id, answer);
        advanceRef.current(); // finalizes the recording (hybrid) before moving on
        return;
      }
      onAnswerRef.current(task.id, combined);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        if (modeRef.current === "hybrid") {
          // Recognition blocked but the recorder may still work — degrade quietly.
          degradeRef.current(i);
        } else {
          setError(errMsg(langRef.current,
            "Mikrofon-Zugriff wurde blockiert. Bitte erlaube das Mikrofon und starte erneut.",
            "Microphone access was blocked. Please allow the microphone and start again.",
          ));
          wantListenRef.current = false;
        }
        return;
      }
      // Hybrid: a broken recognition service (offline STT, audio conflict) must
      // not kill the flow — the recorder keeps the answer, polling takes over.
      if (modeRef.current === "hybrid" && (ev.error === "audio-capture" || ev.error === "network")) {
        degradeRef.current(i);
      }
    };
    rec.onend = () => {
      if (wantListenRef.current && activeRef.current && !pausedRef.current && indexRef.current === i) {
        recRestartsRef.current += 1;
        // Hybrid: recognition that keeps ending without EVER producing a result
        // is dead on this device (typical iOS conflict with MediaRecorder) —
        // switch this task to record+poll instead of restarting forever.
        if (modeRef.current === "hybrid" && !recGotResultRef.current && recRestartsRef.current >= 3) {
          degradeRef.current(i);
          return;
        }
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

  // --- server STT ----------------------------------------------------------
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

  /**
   * Take over the current recording: stop the recorder, wait for its final
   * chunk to flush, and hand back the full audio blob.
   *
   * The chunk buffer is DETACHED into a local array immediately — advance()
   * calls stopListening() right after this, whose stopRecorder() clears
   * chunksRef; without the detach, the recorder's asynchronous final
   * ondataavailable/onstop would find an empty buffer and the AI would only
   * ever receive the last partial second of audio. The mime is frozen here
   * too, because the NEXT task's recorder may overwrite recMimeRef before the
   * transcription request is sent.
   */
  const captureRecording = useCallback((): Promise<Blob | null> => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const mime = recMimeRef.current;
    const captured: Blob[] = chunksRef.current;
    chunksRef.current = []; // detach — stopRecorder() may wipe the ref buffer any moment

    const build = (): Blob | null => (captured.length ? new Blob(captured, { type: mime }) : null);

    if (!rec || rec.state === "inactive") return Promise.resolve(build());

    // Late chunks must land in OUR array, not the (soon-cleared) shared ref.
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) captured.push(e.data);
    };

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve(build());
      };
      rec.onstop = done;
      try {
        rec.stop(); // flushes the last partial chunk via ondataavailable before onstop
      } catch {
        done();
      }
      // Safety: some browsers occasionally never fire onstop.
      setTimeout(done, 800);
    });
  }, []);

  /**
   * The hybrid payoff: ONE high-quality server transcription of the full task
   * audio, replacing the instant-but-rough browser text. Replacement rules:
   *  - never overwrite with an empty transcript (silence / API failure),
   *  - never overwrite text the user has manually edited since dictation
   *    (checked via getAnswer against the dictation snapshot),
   *  - always target the captured task id — the user may already be answering
   *    the next question while this resolves.
   */
  const transcribeFinal = useCallback(async (taskId: string, blob: Blob, dictationSnapshot: string) => {
    try {
      const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(langRef.current)}`, {
        method: "POST",
        // blob.type was frozen at capture time — recMimeRef may already belong
        // to the next task's recorder.
        headers: { "Content-Type": blob.type || recMimeRef.current },
        body: blob,
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || data.error) return; // keep the browser text — it's already in the box
      const { answer } = cutAtTrigger(String(data.text ?? ""));
      if (!answer.trim()) return; // never blank out an answer

      const current = getAnswerRef.current?.(taskId);
      if (typeof current === "string" && current.trim() !== dictationSnapshot.trim()) {
        return; // the user edited this answer manually — their text wins
      }
      onAnswerRef.current(taskId, answer);
    } catch (e) {
      console.warn("[interactive] final transcription failed — keeping live dictation text", e);
    }
  }, []);

  /**
   * Called on every advance (voice trigger or button). If a recording exists
   * for the current task, capture it and fire the one-shot AI transcription in
   * the background. Never blocks the jump to the next question.
   */
  const maybeFinalizeCurrent = useCallback(() => {
    if (finalizedRef.current) return;
    if (phaseRef.current !== "listening") return;
    if (!recorderRef.current && !chunksRef.current.length) return; // browser-only mode: nothing to polish
    finalizedRef.current = true;

    const i = indexRef.current;
    const task = tasksRef.current[i];
    if (!task) return;
    const snapshot = cutAtTrigger(lastCombinedRef.current).answer;

    captureRecording()
      .then((blob) => {
        if (blob && blob.size > 0) return transcribeFinal(task.id, blob, snapshot);
      })
      .catch(() => {});
  }, [captureRecording, transcribeFinal]);

  /** gemini mode / degraded hybrid: periodic transcription of the growing recording. */
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
        setError(errMsg(langRef.current,
          "Transkription fehlgeschlagen — nutze den „Nächste“-Button, um weiterzugehen.",
          "Transcription failed — use the “Next task” button to continue.",
        ));
        return;
      }
      const task = tasksRef.current[i];
      if (!task) return;
      const { answer, triggered } = cutAtTrigger(String(data.text ?? ""));
      if (answer) {
        lastCombinedRef.current = answer;
        onAnswerRef.current(task.id, answer); // don't clear the box on a silent poll
      }
      if (triggered) advanceRef.current();
    } catch (e) {
      console.warn("[interactive] transcribe failed", e);
    } finally {
      transcribingRef.current = false;
    }
  }, []);

  /** Hybrid → record+poll fallback when browser recognition is unusable on this device. */
  const degradeToPolling = useCallback(
    (i: number) => {
      if (degradedRef.current) return;
      degradedRef.current = true;
      teardownRecognition();
      if (recorderRef.current && !pollTimerRef.current) {
        pollTimerRef.current = setInterval(() => transcribeRef.current(i), 2500);
      } else if (!recorderRef.current) {
        // No recognition AND no recorder (e.g. the mic prompt was denied): nothing
        // can capture input. Surface an error instead of hanging forever on the
        // "listening" phase with no engine running.
        setError(errMsg(langRef.current,
          "Mikrofon nicht verfügbar — bitte Zugriff erlauben, oder nutze den „Nächste“-Button.",
          "Microphone unavailable — please allow access, or use the “Next task” button.",
        ));
      }
    },
    [teardownRecognition],
  );

  /** Stop whichever listening engine is active. Both teardowns are no-ops if idle. */
  const stopListening = useCallback(() => {
    teardownRecognition();
    stopRecorder();
  }, [teardownRecognition, stopRecorder]);

  const beginListening = useCallback(
    async (i: number) => {
      if (!activeRef.current || pausedRef.current) return;
      setPhase("listening");

      const mode = modeRef.current;
      // Pause/resume of the SAME task keeps the dictated text; a new task starts clean.
      const resumingSameTask = lastListenTaskRef.current === i;
      lastListenTaskRef.current = i;
      finalizedRef.current = false;
      if (!resumingSameTask) {
        finalRef.current = "";
        lastCombinedRef.current = "";
        recRestartsRef.current = 0;
        recGotResultRef.current = false;
      }

      const wantsRecognition = (mode === "hybrid" && !degradedRef.current) || mode === "browser";
      const wantsRecorder = mode === "hybrid" || mode === "gemini";
      const Ctor = getSpeechRecognitionCtor();

      let recognitionRunning = false;
      if (wantsRecognition) {
        if (Ctor) {
          wantListenRef.current = true;
          if (!recognitionRef.current) runRecognizerRef.current(i);
          recognitionRunning = true;
        } else if (mode === "browser") {
          setError(errMsg(langRef.current,
            "Standard-Spracherkennung wird in diesem Browser nicht unterstützt — wechsle in den Einstellungen zu Hybrid oder Gemini.",
            "Built-in speech recognition is not supported in this browser — switch to Hybrid or Gemini in Settings.",
          ));
          return;
        }
        // hybrid without recognition support: fall through to record+poll below
      }

      if (!wantsRecorder) return;

      // Resume path: a paused recorder keeps its audio — just continue it.
      if (recorderRef.current) {
        if (recorderRef.current.state === "paused") {
          try {
            recorderRef.current.resume();
          } catch {
            /* noop */
          }
        }
        if (!recognitionRunning && !pollTimerRef.current) {
          pollTimerRef.current = setInterval(() => transcribeRef.current(i), 2500);
        }
        return;
      }

      const stream = micPromiseRef.current ? await micPromiseRef.current : null;
      if (!activeRef.current || pausedRef.current || indexRef.current !== i) return;
      if (!stream) {
        if (mode === "gemini" || !recognitionRunning) {
          setError(errMsg(langRef.current,
            "Mikrofon nicht verfügbar — bitte Zugriff erlauben, oder nutze den „Nächste“-Button.",
            "Microphone unavailable — please allow access, or use the “Next task” button.",
          ));
        }
        return; // hybrid: recognition alone still works (no AI overwrite for this task)
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
          if (mode === "gemini" || !recognitionRunning) {
            setError(errMsg(langRef.current,
              "Aufnahme wird in diesem Browser nicht unterstützt — nutze den „Nächste“-Button.",
              "Recording is not supported in this browser — use the “Next task” button.",
            ));
          }
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
      // Poll ONLY when there is no live recognition (gemini mode / degraded hybrid).
      // Healthy hybrid transcribes exactly once, on advance.
      if (!recognitionRunning) {
        pollTimerRef.current = setInterval(() => transcribeRef.current(i), 2500);
      }
    },
    [setPhase],
  );

  /** Read the question via the browser's built-in voices when Gemini TTS fails. */
  const speakWithSynthesis = useCallback(
    (i: number) => {
      const task = tasksRef.current[i];
      if (typeof window === "undefined" || !("speechSynthesis" in window) || !task) {
        setError(errMsg(langRef.current,
          "Sprachausgabe fehlgeschlagen — das Diktat startet trotzdem.",
          "Speech playback failed — dictation will start anyway.",
        ));
        listenRef.current(i);
        return;
      }
      cancelSynthesis();
      const u = new SpeechSynthesisUtterance(stripChemForSpeech(task.questionText, langRef.current === "English" ? "english" : "german"));
      u.lang = langRef.current === "English" ? "en-US" : "de-DE";
      utteranceRef.current = u;

      let settled = false;
      const proceed = () => {
        if (settled) return;
        settled = true;
        utteranceRef.current = null;
        if (activeRef.current && !pausedRef.current && indexRef.current === i) listenRef.current(i);
      };
      u.onend = proceed;
      u.onerror = (ev: SpeechSynthesisErrorEvent) => {
        // "interrupted"/"canceled" fire on our own cancel() (advance/stop) —
        // not a real failure. Only toast when BOTH engines genuinely failed
        // while this question is still the active one.
        const intentional = ev.error === "interrupted" || ev.error === "canceled";
        if (!settled && !intentional && activeRef.current && !pausedRef.current && indexRef.current === i) {
          setError(errMsg(langRef.current,
            "Sprachausgabe fehlgeschlagen — das Diktat startet trotzdem.",
            "Speech playback failed — dictation will start anyway.",
          ));
        }
        proceed();
      };
      setPhase("speaking");
      try {
        window.speechSynthesis.speak(u);
      } catch {
        setError(errMsg(langRef.current,
          "Sprachausgabe fehlgeschlagen — das Diktat startet trotzdem.",
          "Speech playback failed — dictation will start anyway.",
        ));
        proceed();
        return;
      }
      // Watchdog: onend is unreliable on some platforms — never hang "speaking".
      const estimatedMs = Math.min(45000, 3000 + task.questionText.length * 90);
      setTimeout(() => {
        if (!settled && activeRef.current && !pausedRef.current && indexRef.current === i && phaseRef.current === "speaking") {
          cancelSynthesis();
          proceed();
        }
      }, estimatedMs);
    },
    [cancelSynthesis, setPhase],
  );

  const playQuestion = useCallback(
    async (i: number) => {
      if (!activeRef.current) return;
      cancelSynthesis();
      setPhase("loading");
      let url: string | null = null;
      try {
        url = await fetchTts(i);
      } catch (e) {
        console.error("[interactive] tts error", e);
      }
      if (!activeRef.current || pausedRef.current || indexRef.current !== i) return;

      // Prefetch ONLY the next question, and only once the current one is in
      // hand. The old "fire all remaining in parallel" slammed the TTS preview
      // model's low rate limit (10+ concurrent calls → 429s), which killed
      // question 1's audio too and forced the robotic fallback voice.
      if (i + 1 < tasksRef.current.length) fetchTts(i + 1).catch(() => {});

      if (!url) {
        // Gemini TTS failed → seamless fallback to the browser's own voices.
        speakWithSynthesis(i);
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
    [fetchTts, setPhase, speakWithSynthesis, cancelSynthesis],
  );

  const cleanup = useCallback(() => {
    stopListening();
    cancelSynthesis();
    releaseWakeLock();
    // Abort in-flight TTS fetches so their .then doesn't push a blob URL into the
    // now-cleared array (leak) after the session ended.
    ttsControllersRef.current.forEach((c) => c.abort());
    ttsControllersRef.current.clear();
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
    lastListenTaskRef.current = -1;
    degradedRef.current = false;
    lastCombinedRef.current = "";
  }, [stopListening, cancelSynthesis, releaseWakeLock]);

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
    // Re-entrancy guard: the Forward button isn't disabled, and a voice trigger
    // ("nächste Aufgabe") can fire alongside a click — without this, two calls
    // in one tick would step the index by 2 and silently SKIP a question.
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;
    setTimeout(() => { advanceLockRef.current = false; }, 250);

    // Fire the one-shot AI transcription for the task we're leaving (hybrid /
    // gemini). Non-blocking: the jump to the next question happens immediately.
    maybeFinalizeCurrent();
    stopListening();
    cancelSynthesis();
    const next = indexRef.current + 1;
    if (next >= tasksRef.current.length) {
      stop();
      return;
    }
    indexRef.current = next;
    setCurrentIndex(next);
    playRef.current(next);
  }, [maybeFinalizeCurrent, stopListening, cancelSynthesis, stop]);

  const previous = useCallback(() => {
    // Deliberately NO finalize here: going back means redoing — the recording
    // of the interrupted attempt is discarded.
    stopListening();
    cancelSynthesis();
    const prev = indexRef.current - 1;
    if (prev < 0) return; // already at the first question
    indexRef.current = prev;
    setCurrentIndex(prev);
    // Re-answering a task starts a fresh dictation session for it. (The
    // session-level degradation flag stays — a dead recognition engine
    // doesn't come back by navigating.)
    if (lastListenTaskRef.current === prev) lastListenTaskRef.current = -1;
    playRef.current(prev);
  }, [stopListening, cancelSynthesis]);

  // Keep the mirror + recursion refs pointed at the latest values/closures.
  useEffect(() => {
    tasksRef.current = tasks;
    onAnswerRef.current = onAnswer;
    getAnswerRef.current = getAnswer;
    langRef.current = language;
    modeRef.current = dictationMode;
    advanceRef.current = advance;
    playRef.current = playQuestion;
    listenRef.current = beginListening;
    transcribeRef.current = transcribePoll;
    runRecognizerRef.current = runRecognizer;
    degradeRef.current = degradeToPolling;
  });

  const start = useCallback(() => {
    if (activeRef.current || !tasksRef.current.length) return;
    setError(null);
    activeRef.current = true;
    pausedRef.current = false;
    indexRef.current = 0;
    lastListenTaskRef.current = -1;
    degradedRef.current = false;
    setActive(true);
    setPaused(false);
    setCurrentIndex(0);

    // MT-8: request the wake lock inside the same user gesture that unlocks audio.
    requestWakeLock();

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

    // Hybrid + gemini record audio: acquire the mic inside the user gesture
    // (required on iOS). Browser mode lets the Web Speech API manage its own mic.
    if (modeRef.current !== "browser") {
      micPromiseRef.current =
        typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
          ? navigator.mediaDevices.getUserMedia({ audio: true }).catch((e) => {
              console.warn("[interactive] mic denied", e);
              return null;
            })
          : Promise.resolve(null);
    }

    // Only question 1 — playQuestion prefetches each following question
    // one-ahead, sequentially, to stay under the TTS model's rate limit.
    playRef.current(0);
  }, [requestWakeLock]);

  const togglePause = useCallback(() => {
    if (!activeRef.current) return;
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      const i = indexRef.current;
      const ph = phaseRef.current;
      if (ph === "speaking" && utteranceRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.resume();
        } catch {
          /* noop */
        }
      } else if (ph === "speaking" && audioRef.current) {
        audioRef.current.play().catch(() => {});
      } else if (ph === "loading") {
        playRef.current(i);
      } else {
        // beginListening is resume-aware: it keeps the dictated text, resumes a
        // paused recorder, and restarts recognition/polling as appropriate.
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
      if (utteranceRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.pause();
        } catch {
          /* noop */
        }
      }
      // Pause/stop whichever listening engine is active.
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
