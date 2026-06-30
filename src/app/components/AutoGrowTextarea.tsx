"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A textarea that grows to fit its content (no inner scrollbar) on BOTH typed
 * and programmatic (e.g. interactive-mode dictation) value changes — the inline
 * SaaS `ref` trick only fires on typing. Pass a `min-h-*` class for the starting
 * height; it never shrinks below that.
 */
export function AutoGrowTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);

  return <textarea ref={ref} {...props} />;
}
