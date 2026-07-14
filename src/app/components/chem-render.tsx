"use client";

/**
 * chem-render — the HEAVY half of the math/chem-markup text renderer.
 *
 * Loaded exclusively via ChemText's dynamic `import()` so KaTeX (+fonts CSS)
 * and smiles-drawer never enter the main bundle; sessions without $…$ markup
 * fetch zero extra bytes. Everything here degrades to the raw source text on
 * any parse or draw failure — a malformed LLM emission must never eat quiz
 * content.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";
import SmilesDrawer from "smiles-drawer";
import {
  splitChemInline,
  tokenizeChem,
  unescapeChemText,
  type ChemSmilesLine,
} from "@/lib/chem-markup";
import type { ChemTextProps } from "./ChemText";

/* ------------------------------------------------------------------ theme */

/**
 * smiles-drawer paints pixels (no CSS inheritance), so the app palette is
 * baked into two custom themes keyed by the <html data-theme> value. BACKGROUND
 * is used for the halo behind atom labels — it must match the `bg-paper-0`
 * card the canvas sits on, not be transparent, or bonds strike through the
 * letters. Heteroatom colors keep smiles-drawer's defaults (legible on both
 * papers); only the skeleton/C/H tones swap with the theme.
 */
const SMILES_THEMES = {
  paper: {
    FOREGROUND: "#211b12",
    BACKGROUND: "#f6f3ec",
    C: "#211b12",
    O: "#e74c3c",
    N: "#3498db",
    F: "#27ae60",
    CL: "#16a085",
    BR: "#d35400",
    I: "#8e44ad",
    P: "#d35400",
    S: "#b8860b",
    B: "#e67e22",
    SI: "#e67e22",
    H: "#6e6455",
  },
  ink: {
    FOREGROUND: "#f1ebdf",
    BACKGROUND: "#1b1713",
    C: "#f1ebdf",
    O: "#e74c3c",
    N: "#3498db",
    F: "#27ae60",
    CL: "#16a085",
    BR: "#d35400",
    I: "#8e44ad",
    P: "#d35400",
    S: "#f1c40f",
    B: "#e67e22",
    SI: "#e67e22",
    H: "#b3a896",
  },
};

type ThemeName = keyof typeof SMILES_THEMES;

/** The appearance bootstrap stamps the RESOLVED theme (auto included) onto
 *  <html data-theme> without React state — observe the attribute directly. */
function useResolvedTheme(): ThemeName {
  const [theme, setTheme] = useState<ThemeName>("paper");
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setTheme(el.getAttribute("data-theme") === "ink" ? "ink" : "paper");
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/* ------------------------------------------------------------------- math */

function MathSpan({ content, display, raw }: { content: string; display: boolean; raw: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(content, {
        displayMode: display,
        // Untrusted LLM output: no \href/\html*/\includegraphics, errors render
        // as escaped literal text, and macro/size bombs are capped.
        throwOnError: false,
        trust: false,
        strict: "ignore",
        maxExpand: 1_000,
        maxSize: 100,
        errorColor: "currentColor",
        output: "htmlAndMathml",
      });
    } catch {
      return null;
    }
  }, [content, display]);

  // Renderer bug → show exactly what the model wrote, delimiters included.
  if (html === null) return <>{raw}</>;

  return display ? (
    <div className="chem-math-block my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="chem-math" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/* ----------------------------------------------------------------- smiles */

const SMILES_W = 300;
const SMILES_H = 190;

function SmilesCanvas({ line, theme }: { line: ChemSmilesLine; theme: ThemeName }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Never reset on re-run: a new SMILES string remounts via the list key, and
  // a theme flip can't fix an unparseable molecule.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Draw one frame later — keeps setState out of the synchronous effect
    // body (parse/draw callbacks fire synchronously in smiles-drawer).
    let cancelled = false;
    const fail = () => {
      if (!cancelled) setFailed(true);
    };
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        const drawer = new SmilesDrawer.Drawer({
          width: SMILES_W,
          height: SMILES_H,
          themes: SMILES_THEMES,
        });
        SmilesDrawer.parse(
          line.smiles,
          (tree) => {
            try {
              drawer.draw(tree, canvas, theme);
            } catch {
              fail();
            }
          },
          fail
        );
      } catch {
        fail();
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [line.smiles, theme]);

  // Invalid SMILES — show the raw code instead of an empty box, so the
  // student still sees what the model meant (and can ask the tutor).
  if (failed) {
    return (
      <code className="text-xs text-ink-600 break-all bg-paper-2 rounded-md px-2 py-1">
        {line.smiles}
        {line.caption ? ` (${line.caption})` : ""}
      </code>
    );
  }

  return (
    <figure className="chem-smiles-figure inline-flex flex-col items-center gap-1.5 bg-paper-0 border border-(--hairline) rounded-[10px] p-3 max-w-full m-0">
      <canvas ref={canvasRef} width={SMILES_W} height={SMILES_H} className="max-w-full" />
      {line.caption && (
        <figcaption className="text-xs text-ink-400 text-center leading-snug">{line.caption}</figcaption>
      )}
    </figure>
  );
}

function SmilesFigureRow({ lines, themeOverride }: { lines: ChemSmilesLine[]; themeOverride?: ThemeName }) {
  const resolved = useResolvedTheme();
  const theme = themeOverride ?? resolved;
  return (
    <div className="flex flex-wrap gap-3 my-2">
      {lines.map((line, i) => (
        <SmilesCanvas key={`${line.smiles}-${i}`} line={line} theme={theme} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ entry */

export default function ChemRender({ text, inline = false, theme }: ChemTextProps) {
  const segments = useMemo(
    () => (inline ? splitChemInline(text) : tokenizeChem(text)),
    [text, inline]
  );
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "math") {
          return <MathSpan key={i} content={seg.content} display={seg.display} raw={seg.raw} />;
        }
        if (seg.type === "smiles") {
          return <SmilesFigureRow key={i} lines={seg.lines} themeOverride={theme} />;
        }
        return <span key={i}>{unescapeChemText(seg.content)}</span>;
      })}
    </>
  );
}
