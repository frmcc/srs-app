"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * CRAFT.md §4 — the ink tooltip. Never native `title`.
 * Portal-based (overflow:hidden can't clip it), 400ms hover intent,
 * 140ms fade + 2px rise (CSS .tip-bubble), flips below near the top edge.
 * Keyboard focus shows it immediately. Coarse pointers have no hover, so a
 * touch/pen press shows the bubble at once; the next outside tap or any
 * scroll dismisses it (MT-4). The wrapper is `display: contents`, so it adds
 * no box; events bubble through it from the real control, and the label is
 * mirrored into aria-label — but only onto interactive controls, since ARIA
 * ignores aria-label on generic divs/spans (AX-9).
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
  /** True while the visible bubble was opened by a coarse pointer (MT-4). */
  const touchRef = useRef(false);
  const hide = useCallback(() => { clear(); touchRef.current = false; setPos(null); }, [clear]);
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

  // MT-4 — coarse-pointer mode: touch/pen presses show the bubble immediately
  // (there is no hover to wait for); a mouse press keeps the old dismiss
  // behavior so clicking a control doesn't leave its tip hanging.
  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") {
      hide();
      return;
    }
    touchRef.current = true;
    clear();
    show();
  }, [clear, hide, show]);

  // While a touch-opened bubble is visible, the next tap outside the control
  // or any scroll dismisses it.
  useEffect(() => {
    if (!pos || !touchRef.current) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      hide();
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("scroll", hide, true);
    };
  }, [pos, hide]);

  useEffect(() => clear, [clear]);

  // Mirror the label into aria-label when the control doesn't bring its own.
  // Track ownership so we KEEP it in sync when the label changes (toggle buttons
  // like speak/stop or pause/resume swap their tooltip text) without clobbering
  // an aria-label the control set itself.
  const ownsAriaRef = useRef(false);
  useEffect(() => {
    const el = anchorEl();
    if (!el) return;
    // ARIA ignores aria-label on generic elements (bare div/span) — only
    // mirror onto controls that actually expose it (AX-9). Data that lives on
    // generic elements needs its own text alternative at the call site.
    if (!el.matches("a,button,input,select,textarea,summary,[role],[tabindex]")) return;
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
        onPointerDown={handlePointerDown}
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
