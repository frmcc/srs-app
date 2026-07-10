"use client";

import { useCallback, useRef, useState } from "react";
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

const AUTO_DISMISS_MS = 5000;
const UNDO_DISMISS_MS = 6000;

/**
 * Tiny toast store (replaces blocking alert()). Returns the current stack
 * plus `addToast`/`dismissToast`; render the stack with <ToastStack/>.
 * success/error auto-dismiss after ~5s; undo bars after 6s.
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
    window.setTimeout(() => dismissToast(id), variant === "undo" ? UNDO_DISMISS_MS : AUTO_DISMISS_MS);
    return id;
  }, [dismissToast]);

  return { toasts, addToast, dismissToast };
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const cards = toasts.filter(t => t.variant !== "undo");
  const undos = toasts.filter(t => t.variant === "undo");
  return (
    <>
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2.5 w-[calc(100%-2.5rem)] max-w-sm pointer-events-none print:hidden">
        <AnimatePresence>
          {cards.map(toast => (
            <motion.div
              key={toast.id}
              layout
              {...toastMotion}
              // Errors are assertive so screen readers announce failures;
              // success/info stay polite.
              role={toast.variant === "error" ? "alert" : "status"}
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
              <button
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 text-ink-600 hover:text-ink-900 transition-colors cursor-pointer p-0.5"
                aria-label="Close"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Undo bars — ink chip, bottom-center (CRAFT.md §8) */}
      <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none print:hidden">
        <AnimatePresence>
          {undos.map(toast => (
            <motion.div
              key={toast.id}
              layout
              {...toastMotion}
              role="status"
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
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-(--paper-0)/60 hover:text-(--paper-0) transition-colors cursor-pointer p-1"
                aria-label="Close"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
