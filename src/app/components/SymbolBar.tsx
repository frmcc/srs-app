"use client";

import type { ReactNode } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

/**
 * Collapsible one-tap symbol bar above a quiz answer box.
 *
 * Retracted by default (a single quiet handle) so it never clutters; one tap
 * expands it into a category picker + the chips for that category. Math and
 * Physics are available to everyone (the app renders KaTeX for all accounts);
 * Chemistry is added for chem-mode accounts, where it also surfaces the recent
 * formulas auto-collected by the typing beautifier + the periodic table.
 *
 * Chips use onPointerDown preventDefault so the answer textarea never loses
 * focus or its caret when a symbol is inserted.
 */

export type SymbolCategory = "math" | "physics" | "chem";

const CATEGORY_LABEL: Record<SymbolCategory, { de: string; en: string }> = {
  math: { de: "Mathe", en: "Math" },
  physics: { de: "Physik", en: "Physics" },
  chem: { de: "Chemie", en: "Chem" },
};

/** Common math symbols — Unicode, so they read cleanly as plain text and also
 *  survive inside $…$ if the student wraps an expression. */
const MATH_TOKENS = [
  "√", "∛", "∫", "∮", "Σ", "∏", "∂", "∇", "∞", "π",
  "≤", "≥", "≠", "≈", "≡", "±", "∓", "×", "÷", "·", "∝", "°",
  "∈", "∉", "⊂", "⊆", "∪", "∩", "∅", "∀", "∃", "→", "⇒", "⇔",
  "α", "β", "γ", "δ", "ε", "θ", "λ", "μ", "σ", "φ", "ω",
  "²", "³", "⁻¹",
];

/** Common physics symbols — Greek quantities, operators, and unit exponents. */
const PHYSICS_TOKENS = [
  "ℏ", "λ", "ν", "ω", "Ω", "μ", "ρ", "σ", "τ", "θ", "φ", "ψ", "Φ", "Ψ",
  "Δ", "∇", "∂", "∫", "∝", "≈", "≤", "≥", "±", "×", "·", "°", "→", "∞",
  "Å", "℃", "²", "³", "⁻¹", "⁻²", "⁰",
];

/** Fixed chem tokens (arrows, deltas, charge superscripts, Greek). Recent
 *  formulas + the default polyatomic-ion shelf follow, chem only. */
const CHEM_TOKENS = ["→", "⇌", "↔", "Δ", "°C", "·", "⁺", "⁻", "²⁺", "²⁻", "³⁺", "α", "β", "π", "λ", "µ"];
const DEFAULT_IONS = ["SO₄²⁻", "NO₃⁻", "NH₄⁺", "CO₃²⁻", "PO₄³⁻", "OH⁻", "HCO₃⁻", "H₃O⁺"];

export default function SymbolBar({
  categories,
  category,
  onCategory,
  expanded,
  onExpandedChange,
  recents,
  onInsert,
  language,
}: {
  categories: SymbolCategory[];
  category: SymbolCategory;
  onCategory: (c: SymbolCategory) => void;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  recents: string[];
  onInsert: (token: string) => void;
  language: string;
}) {
  const de = language === "german";
  if (categories.length === 0) return null;
  // The active category must be one that's actually available.
  const active = categories.includes(category) ? category : categories[0];

  const chip = (token: string, key: string, title?: string): ReactNode => (
    <button
      key={key}
      type="button"
      tabIndex={-1}
      title={title}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onInsert(token)}
      className="shrink-0 h-7 min-w-7 px-2 rounded-full bg-paper-2 text-[13px] leading-none text-ink-600 hover:text-ink-900 hover:bg-(--chip-hover) transition-colors cursor-pointer"
    >
      {token}
    </button>
  );

  if (!expanded) {
    return (
      <button
        type="button"
        tabIndex={-1}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onExpandedChange(true)}
        aria-expanded={false}
        className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full bg-paper-2 text-[12px] font-semibold text-ink-600 hover:text-ink-900 hover:bg-(--chip-hover) transition-colors cursor-pointer"
      >
        <span aria-hidden="true" className="text-[13px] leading-none">∑</span>
        {de ? "Symbole" : "Symbols"}
        <ChevronDownIcon className="w-3.5 h-3.5 -rotate-90" strokeWidth={2} />
      </button>
    );
  }

  const tokens =
    active === "math" ? MATH_TOKENS : active === "physics" ? PHYSICS_TOKENS : CHEM_TOKENS;
  const chemShelf =
    active === "chem" ? [...recents, ...DEFAULT_IONS.filter((d) => !recents.includes(d))].slice(0, 10) : [];

  return (
    <div className="flex items-center gap-2" aria-label={de ? "Symbol-Schnelleingabe" : "Symbol quick input"}>
      <button
        type="button"
        tabIndex={-1}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onExpandedChange(false)}
        aria-expanded
        title={de ? "Einklappen" : "Collapse"}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-paper-2 text-ink-500 hover:text-ink-900 hover:bg-(--chip-hover) transition-colors cursor-pointer"
      >
        <ChevronDownIcon className="w-4 h-4 rotate-90" strokeWidth={2} />
      </button>
      {categories.length > 1 && (
        <div className="shrink-0 flex items-center gap-0.5 rounded-full bg-paper-2 p-0.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onCategory(c)}
              aria-pressed={active === c}
              className={`h-6 px-2.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer ${
                active === c ? "bg-paper-1 text-ink-900 shadow-(--shadow-e1)" : "text-ink-500 hover:text-ink-900"
              }`}
            >
              {de ? CATEGORY_LABEL[c].de : CATEGORY_LABEL[c].en}
            </button>
          ))}
        </div>
      )}
      <div className="min-w-0 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-1.5 -mb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tokens.map((t, i) => chip(t, `t-${i}`))}
        {chemShelf.length > 0 && <span aria-hidden="true" className="shrink-0 w-px h-4 bg-(--hairline-card) mx-0.5" />}
        {chemShelf.map((f, i) =>
          chip(f, `c-${i}`, de ? "Formeln — füllt sich mit deinen zuletzt genutzten" : "Formulas — fills with your recently used"),
        )}
      </div>
    </div>
  );
}
