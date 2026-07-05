"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type FocusEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

/**
 * CRAFT.md §4 — the ink tooltip. Never native `title`.
 * Portal-based (overflow:hidden can't clip it), 400ms hover intent,
 * 140ms fade + 2px rise (CSS .tip-bubble), flips below near the top edge.
 * Keyboard focus shows it immediately; the label doubles as aria-label.
 */
export function Tip({ label, children, side }: {
  label: string;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
  side?: "top" | "bottom";
}) {
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const hide = useCallback(() => { clear(); setPos(null); }, [clear]);
  const show = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const below = side === "bottom" || (side !== "top" && r.top < 72);
    setPos({ x: r.left + r.width / 2, y: below ? r.bottom : r.top, below });
  }, [side]);
  const schedule = useCallback((el: HTMLElement) => {
    clear();
    timerRef.current = window.setTimeout(() => show(el), 400);
  }, [clear, show]);

  useEffect(() => clear, [clear]);

  if (!isValidElement(children)) return children;
  const prev = children.props;
  const merged = cloneElement(children, {
    "aria-label": (prev as Record<string, unknown>)["aria-label"] as string | undefined ?? label,
    onMouseEnter: (e: MouseEvent<HTMLElement>) => { prev.onMouseEnter?.(e); schedule(e.currentTarget); },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => { prev.onMouseLeave?.(e); hide(); },
    onMouseDown: (e: MouseEvent<HTMLElement>) => { prev.onMouseDown?.(e); hide(); },
    onFocus: (e: FocusEvent<HTMLElement>) => { prev.onFocus?.(e); show(e.currentTarget); },
    onBlur: (e: FocusEvent<HTMLElement>) => { prev.onBlur?.(e); hide(); },
  } as Partial<HTMLAttributes<HTMLElement>>);

  return (
    <>
      {merged}
      {pos && typeof document !== "undefined" && createPortal(
        <span
          role="tooltip"
          className="tip-bubble"
          data-below={pos.below || undefined}
          style={{ left: pos.x, top: pos.y }}
        >
          {label}
        </span>,
        document.body
      )}
    </>
  );
}
