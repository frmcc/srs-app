"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toastMotion } from "@/lib/motion";
import { CheckCircleIcon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";

export type ToastVariant = "success" | "error";

export interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

const AUTO_DISMISS_MS = 5000;

/**
 * Tiny toast store (replaces blocking alert()). Returns the current stack
 * plus `addToast`/`dismissToast`; render the stack with <ToastStack/>.
 * Toasts auto-dismiss after ~5s.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((variant: ToastVariant, message: string) => {
    const id = nextIdRef.current++;
    setToasts(prev => [...prev, { id, variant, message }]);
    window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  }, [dismissToast]);

  return { toasts, addToast, dismissToast };
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2.5 w-[calc(100%-2.5rem)] max-w-sm pointer-events-none print:hidden">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            layout
            {...toastMotion}
            role="status"
            className={`pointer-events-auto w-full flex items-start gap-3 px-4 py-3.5 rounded-2xl border backdrop-blur-xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] text-sm leading-relaxed ${
              toast.variant === "success"
                ? "bg-emerald-950/85 border-emerald-400/25 text-emerald-100"
                : "bg-rose-950/85 border-rose-400/25 text-rose-100"
            }`}
          >
            {toast.variant === "success" ? (
              <CheckCircleIcon className="w-5 h-5 shrink-0 text-emerald-300 mt-0.5" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-rose-300 mt-0.5" />
            )}
            <span className="flex-1 break-words">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 text-white/40 hover:text-white transition-colors cursor-pointer p-0.5"
              aria-label="Close"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
