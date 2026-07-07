"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * CRAFT.md §4 — the ink tooltip. Never native `title`.
 * Portal-based (overflow:hidden can't clip it), 400ms hover intent,
 * 140ms fade + 2px rise (CSS .tip-bubble), flips below near the top edge.
 * Keyboard focus shows it immediately. The wrapper is `display: contents`,
 * so it adds no box; events bubble through it from the real control, and the
 * label is mirrored into aria-label on the control when it has none.
 */
export function Tip({ label, children, side }: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const anchorEl = useCallback(
    () => (wrapRef.current?.firstElementChild as HTMLElement | null) ?? null,
    []
  );
  const clear = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const hide = useCallback(() => { clear(); setPos(null); }, [clear]);
  const show = useCallback(() => {
    const el = anchorEl();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = side === "bottom" || (side !== "top" && r.top < 72);
    setPos({ x: r.left + r.width / 2, y: below ? r.bottom : r.top, below });
  }, [anchorEl, side]);
  const schedule = useCallback(() => {
    clear();
    timerRef.current = window.setTimeout(show, 400);
  }, [clear, show]);

  useEffect(() => clear, [clear]);

  // Mirror the label into aria-label when the control doesn't bring its own.
  // Track ownership so we KEEP it in sync when the label changes (toggle buttons
  // like speak/stop or pause/resume swap their tooltip text) without clobbering
  // an aria-label the control set itself.
  const ownsAriaRef = useRef(false);
  useEffect(() => {
    const el = anchorEl();
    if (!el) return;
    if (!el.getAttribute("aria-label") || ownsAriaRef.current) {
      el.setAttribute("aria-label", label);
      ownsAriaRef.current = true;
    }
  }, [anchorEl, label]);

  return (
    <>
      <span
        ref={wrapRef}
        style={{ display: "contents" }}
        onMouseEnter={schedule}
        onMouseLeave={hide}
        onMouseDown={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
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
