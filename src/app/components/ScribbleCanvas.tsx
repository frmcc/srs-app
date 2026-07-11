"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Handwriting pad for quiz answer boxes (allowlist feature, see
 * SCRIBBLE_ALLOWED_EMAILS): the student scribbles formulas, structures,
 * mechanisms or full answers with an Apple Pencil, finger or mouse. The
 * drawing is exported as a white-background PNG data URL and sent to the
 * grading pipeline as an inline image under the task it belongs to.
 *
 * Implementation notes:
 * - Strokes are kept as vectors (CSS-pixel coords + per-point width) and the
 *   bitmap is redrawn from them — that makes Undo exact and container
 *   resizes non-destructive.
 * - A restored sketch (reopening the pad) arrives as a bitmap `initialDataUrl`
 *   and is drawn underneath the new strokes; Clear removes both.
 * - Palm rejection: once a pen is seen, touch strokes are ignored (classic
 *   iPad heuristic — the wrist lands on the glass while writing).
 * - White is painted explicitly: a transparent PNG could render black in the
 *   grader's image decoding, and dark-mode UIs must not leak into the export.
 */

type StrokePoint = { x: number; y: number; w: number };
type Stroke = StrokePoint[];

// CC-11: the app's warm ink (--ink-900), NOT Tailwind's cooler stone-900. Kept
// as a fixed literal on purpose — the pad is a light, theme-independent surface
// so the exported PNG never leaks a dark-mode UI into the grader's image.
const INK = "#211b12";
const BASE_WIDTH = 2.4; // logical px; modulated by pointer pressure

function strokeWidthFor(e: PointerEvent | React.PointerEvent): number {
  // pressure: pen = real value, mouse = 0.5 while pressed, touch ≈ 0/1.
  const p = typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : 0.5;
  return BASE_WIDTH * (0.55 + 0.9 * Math.min(1, p));
}

export function ScribbleCanvas({
  initialDataUrl,
  onChange,
  language,
  heightPx = 340,
}: {
  /** Existing sketch (PNG data URL) to restore when the pad is reopened. */
  initialDataUrl?: string | null;
  /** Fires after every completed stroke / undo / clear. null = pad is empty. */
  onChange: (dataUrl: string | null) => void;
  language: string;
  heightPx?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const liveStrokeRef = useRef<Stroke | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const sawPenRef = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [hasBase, setHasBase] = useState(!!initialDataUrl);

  const de = language === "german";

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // CC-11: paper-1 (the app's warmest white) rather than a max-glare #fff — a
    // fixed light fill so the export stays grader-friendly in either theme.
    ctx.fillStyle = "#fffefb";
    ctx.fillRect(0, 0, cssW, cssH);
    const base = baseImageRef.current;
    if (base) ctx.drawImage(base, 0, 0, cssW, cssH);

    ctx.strokeStyle = INK;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const paint = (stroke: Stroke) => {
      if (stroke.length === 0) return;
      if (stroke.length === 1) {
        const p = stroke[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
        return;
      }
      for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1];
        const b = stroke[i];
        ctx.beginPath();
        ctx.lineWidth = (a.w + b.w) / 2;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    };
    strokesRef.current.forEach(paint);
    if (liveStrokeRef.current) paint(liveStrokeRef.current);
    ctx.restore();
  }, []);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (strokesRef.current.length === 0 && !baseImageRef.current) {
      onChange(null);
      return;
    }
    // PNG keeps thin pen lines crisp; white background is already painted.
    onChange(canvas.toDataURL("image/png"));
  }, [onChange]);

  // Size the bitmap to the container (device-pixel exact) and redraw. Runs on
  // mount and on container resizes (rotation, sidebar toggle).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const setup = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cssW = Math.max(280, wrap.clientWidth);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(heightPx * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${heightPx}px`;
      redraw();
    };
    setup();
    const ro = new ResizeObserver(() => setup());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [heightPx, redraw]);

  // Restore a previously drawn sketch underneath new strokes — ONCE, on mount.
  // The parent feeds the latest export back in as `initialDataUrl`, so reacting
  // to every prop change would rasterize our own live strokes into the base
  // image and silently break Undo.
  const restoreUrlRef = useRef(initialDataUrl);
  useEffect(() => {
    const url = restoreUrlRef.current;
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      setHasBase(true);
      redraw();
    };
    img.src = url;
  }, [redraw]);

  const pointFrom = (e: React.PointerEvent): StrokePoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: strokeWidthFor(e) };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") sawPenRef.current = true;
    // Palm rejection: pen users' resting wrist must not draw.
    if (e.pointerType === "touch" && sawPenRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    liveStrokeRef.current = [pointFrom(e)];
    redraw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveStrokeRef.current;
    if (!live) return;
    e.preventDefault();
    // Coalesced events give the full 120/240 Hz pen trace instead of the
    // rAF-throttled samples — visibly smoother handwriting on iPad.
    const native = e.nativeEvent as PointerEvent;
    const events = typeof native.getCoalescedEvents === "function" && native.getCoalescedEvents().length > 0
      ? native.getCoalescedEvents()
      : [native];
    const rect = canvasRef.current!.getBoundingClientRect();
    for (const ev of events) {
      live.push({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, w: strokeWidthFor(ev) });
    }
    redraw();
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveStrokeRef.current;
    if (!live) return;
    e.preventDefault();
    liveStrokeRef.current = null;
    strokesRef.current.push(live);
    setStrokeCount(strokesRef.current.length);
    redraw();
    emit();
  };

  const undo = () => {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redraw();
    emit();
  };

  const clear = () => {
    strokesRef.current = [];
    liveStrokeRef.current = null;
    baseImageRef.current = null;
    setHasBase(false);
    setStrokeCount(0);
    redraw();
    emit();
  };

  const empty = strokeCount === 0 && !hasBase;

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        className="block w-full rounded-[12px] border border-(--hairline) bg-[#fffefb] cursor-crosshair select-none"
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
        aria-label={de ? "Scribble-Feld für handschriftliche Antworten" : "Scribble pad for handwritten answers"}
      />
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-[11px] text-ink-400">
          {de
            ? "Schreibe mit Apple Pencil, Finger oder Maus — Formeln, Skizzen, alles zählt."
            : "Write with Apple Pencil, finger, or mouse — formulas, sketches, anything counts."}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={undo}
            disabled={strokeCount === 0}
            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-paper-2 text-ink-600 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {de ? "Rückgängig" : "Undo"}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={empty}
            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-paper-2 text-ink-600 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {de ? "Leeren" : "Clear"}
          </button>
        </div>
      </div>
    </div>
  );
}
