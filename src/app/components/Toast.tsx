"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toastMotion } from "@/lib/motion";
import { CheckCircleIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";

export type ToastVariant = "success" | "error" | "undo";

export interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
  /** CRAFT.md §8 — forgiveness: undo toasts carry one action instead of a confirm dialog. */
  action?: { label: string; onClick: () => void };
}

/** Success: a quick confirmation. */
const AUTO_DISMISS_MS = 5000;
/** Errors carry raw server messages — they need reading time (EM-4). */
const ERROR_DISMISS_MS = 12000;
/** The undo affordance must outlive a moment of hesitation (AX-12). */
const UNDO_DISMISS_MS = 10000;

/**
 * Tiny toast store (replaces blocking alert()). Returns the current stack
 * plus `addToast`/`dismissToast`; render the stack with <ToastStack/>.
 * Auto-dismiss timing lives in the stack itself so hovering or focusing a
 * toast pauses its countdown (EM-4/AX-12).
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((variant: ToastVariant, message: string, opts?: { action?: ToastItem["action"] }) => {
    const id = nextIdRef.current++;
    setToasts(prev => [...prev, { id, variant, message, action: opts?.action }]);
    return id;
  }, []);

  return { toasts, addToast, dismissToast };
}

/**
 * Pausable auto-dismiss (EM-4/AX-12): pointer-over or focus pauses the
 * countdown; leaving resumes it with the remaining time — a toast never
 * vanishes while it's being read.
 */
function usePausableDismiss(ms: number, dismiss: () => void) {
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);
  const remainingRef = useRef(ms);
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const pause = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
  }, []);

  const resume = useCallback(() => {
    if (timerRef.current !== null) return;
    startedRef.current = Date.now();
    // Small grace floor so a toast never disappears the instant the pointer leaves.
    timerRef.current = window.setTimeout(() => dismissRef.current(), Math.max(remainingRef.current, 800));
  }, []);

  useEffect(() => {
    resume();
    return pause;
  }, [pause, resume]);

  return { pause, resume };
}

function ToastCard({ toast, de, onDismiss }: { toast: ToastItem; de: boolean; onDismiss: (id: number) => void }) {
  const { pause, resume } = usePausableDismiss(
    toast.variant === "error" ? ERROR_DISMISS_MS : AUTO_DISMISS_MS,
    () => onDismiss(toast.id),
  );
  return (
    <motion.div
      layout
      {...toastMotion}
      // Errors are assertive so screen readers announce failures;
      // success/info stay polite.
      role={toast.variant === "error" ? "alert" : "status"}
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      className={`pointer-events-auto w-full flex items-start gap-3 px-4 py-3.5 rounded-[18px] border bg-paper-1 shadow-(--shadow-e3) text-sm leading-relaxed text-ink-900 ${
        toast.variant === "success"
          ? "border-(--grade-pass-border)"
          : "border-(--grade-fail-border)"
      }`}
    >
      {toast.variant === "success" ? (
        <CheckCircleIcon className="w-5 h-5 shrink-0 text-(--grade-pass-accent) mt-0.5" strokeWidth={1.6} />
      ) : (
        <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-(--grade-fail-accent) mt-0.5" strokeWidth={1.6} />
      )}
      <span className="flex-1 break-words">{toast.message}</span>
      {/* 40px hit area via padding + negative margin — visual footprint unchanged (IS-11). */}
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-ink-600 hover:text-ink-900 transition-colors cursor-pointer p-3 -m-2.5"
        aria-label={de ? "Schließen" : "Close"}
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function UndoBar({ toast, de, onDismiss }: { toast: ToastItem; de: boolean; onDismiss: (id: number) => void }) {
  const { pause, resume } = usePausableDismiss(UNDO_DISMISS_MS, () => onDismiss(toast.id));
  return (
    <motion.div
      layout
      {...toastMotion}
      role="status"
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      className="pointer-events-auto flex items-center gap-4 pl-5 pr-2.5 py-2.5 rounded-full bg-ink-900 text-(--paper-0) text-[13px] font-medium shadow-[0_6px_16px_-6px_rgba(33,27,18,0.4)] whitespace-nowrap"
    >
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action?.onClick(); onDismiss(toast.id); }}
          className="text-(--accent-on-surface-inverse) font-semibold px-2 py-1 rounded-full hover:bg-[color-mix(in_srgb,var(--paper-0)_12%,transparent)] transition-colors cursor-pointer"
        >
          {toast.action.label}
        </button>
      )}
      {/* ~38px hit area via padding + negative margin (IS-11). */}
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-(--paper-0)/60 hover:text-(--paper-0) transition-colors cursor-pointer p-3 -m-2"
        aria-label={de ? "Schließen" : "Close"}
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export function ToastStack({ toasts, onDismiss, language }: { toasts: ToastItem[]; onDismiss: (id: number) => void; language: string }) {
  const de = language === "german";
  const cards = toasts.filter(t => t.variant !== "undo");
  const undos = toasts.filter(t => t.variant === "undo");
  return (
    <>
      {/* Safe-area anchoring matches the undo bar — in the installed PWA the
          cards must clear the home indicator and landscape notches (LS-5/MT-6). */}
      <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-[100] flex flex-col items-end gap-2.5 w-[calc(100%-2.5rem)] max-w-sm pointer-events-none print:hidden">
        <AnimatePresence>
          {cards.map(toast => (
            <ToastCard key={toast.id} toast={toast} de={de} onDismiss={onDismiss} />
          ))}
        </AnimatePresence>
      </div>

      {/* Undo bars — ink chip, bottom-center (CRAFT.md §8) */}
      <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none print:hidden">
        <AnimatePresence>
          {undos.map(toast => (
            <UndoBar key={toast.id} toast={toast} de={de} onDismiss={onDismiss} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
