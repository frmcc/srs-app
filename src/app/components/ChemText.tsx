"use client";

import { useEffect, useState, type ComponentType } from "react";
import { looksLikeChemMarkup } from "@/lib/chem-markup";

export interface ChemTextProps {
  text: string;
  /** Inline context (FeedbackBody line fragments): only $…$-level math, no
   *  block scanning — block segmentation already happened upstream. */
  inline?: boolean;
  /** Force the SMILES drawing palette instead of following <html data-theme>.
   *  The print sheet needs "paper": canvases are pixels, so structures drawn
   *  in dark mode would print cream-on-white (invisible). */
  theme?: "paper" | "ink";
}

/**
 * Math/chem-markup text renderer — the always-bundled, feather-weight half.
 *
 * KaTeX + smiles-drawer are heavy, so the real renderer lives in the lazily
 * imported `chem-render` chunk. Until it arrives (or when the text contains no
 * markup at all — the common case), this renders the exact same plain string
 * the rest of the UI shows, inside the caller's existing `whitespace-pre-wrap`
 * wrapper: graceful progressive enhancement, and the fast path never even
 * tokenizes. SSR/hydration always see the plain string; the upgrade happens
 * strictly in the effect.
 *
 * Mounted unconditionally: plain text renders byte-identical and never loads
 * the chunk; only $…$/```smiles markup does.
 */
type ChemRenderComponent = ComponentType<ChemTextProps>;
let chemRenderPromise: Promise<ChemRenderComponent> | null = null;

function loadChemRender(): Promise<ChemRenderComponent> {
  if (!chemRenderPromise) {
    chemRenderPromise = import("./chem-render").then((m) => m.default);
  }
  return chemRenderPromise;
}

export default function ChemText({ text, inline = false, theme }: ChemTextProps) {
  const hasMarkup = looksLikeChemMarkup(text);
  const [Renderer, setRenderer] = useState<ChemRenderComponent | null>(null);

  // Streaming tutor messages upgrade mid-flight: markup can appear after the
  // first tokens, so the effect re-checks whenever `hasMarkup` flips.
  useEffect(() => {
    if (!hasMarkup || Renderer) return;
    let alive = true;
    loadChemRender()
      .then((C) => {
        if (alive) setRenderer(() => C);
      })
      .catch(() => {
        // Chunk failed to load (offline?) — plain text stays; allow a retry
        // on the next mount instead of caching the rejection forever.
        chemRenderPromise = null;
      });
    return () => {
      alive = false;
    };
  }, [hasMarkup, Renderer]);

  if (!hasMarkup || !Renderer) return <>{text}</>;
  return <Renderer text={text} inline={inline} theme={theme} />;
}
