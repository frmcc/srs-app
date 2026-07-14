/**
 * Chemistry/math-markup tokenizer — pure segmentation, no React and no katex.
 *
 * Quizzes/feedback/tutor messages (math renders for EVERY quiz — no gating in
 * this app) carry three notations inside otherwise plain text:
 *   - inline math   $...$            (KaTeX; mhchem \ce{}/\pu{} live inside)
 *   - display math  $$...$$          (multiline)
 *   - structures    ```smiles fences (one "SMILES | optional caption" per line)
 * This module only SPLITS text into segments; rendering happens in the lazily
 * loaded chem-render chunk. Everything ambiguous or over the safety caps stays
 * a literal text segment — a tokenizer miss must never eat content.
 *
 * SMILES support is carried along from the SaaS sibling for port parity; this
 * app's prompts never emit it, so the fence branch simply never matches.
 *
 * LLM-tolerance: bare \ce{…}/\pu{…} outside $…$ and \(...\)/\[...\] delimiters
 * are accepted too — models emit those despite the prompt mandating $…$.
 */

export interface ChemSmilesLine {
  smiles: string;
  caption?: string;
}

export type ChemSegment =
  | { type: "text"; content: string }
  /** `raw` = original slice incl. delimiters, for exact plain-text fallback. */
  | { type: "math"; content: string; display: boolean; raw: string }
  | { type: "smiles"; lines: ChemSmilesLine[]; raw: string };

/** Safety caps — over-cap slices degrade to literal text (DoS guard, and a
 *  runaway unclosed delimiter must not swallow the rest of the quiz). */
const MAX_INLINE_MATH = 2_000;
const MAX_DISPLAY_MATH = 5_000;
const MAX_SMILES_PER_FENCE = 12;
const MAX_SMILES_LENGTH = 500;

/** Cheap pre-check so the plain-text fast path skips tokenizing entirely. */
export function looksLikeChemMarkup(text: string): boolean {
  return /[$]|```\s*smiles|\\ce\{|\\pu\{|\\\(|\\\[/i.test(text);
}

/** Restore `\$` escapes when rendering a text segment in chem mode. */
export function unescapeChemText(text: string): string {
  return text.replace(/\\\$/g, "$");
}

/**
 * Block pass: ```smiles fences, $$…$$ and \[…\] display math. One sequential
 * scan with ordered alternation — the leftmost match wins, so a fence can
 * never be split by display math found inside its body (and vice versa).
 */
const BLOCK_RE =
  /(^[ \t]*```[ \t]*smiles[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*$)|(\$\$([\s\S]+?)\$\$)|(\\\[([\s\S]+?)\\\])/gim;

/**
 * Inline pass (applied to the block pass's text segments):
 *   - $…$   — single-line, no space adjacent to either delimiter (so prices
 *             like "costs $5 and $10" stay literal), `\$` escapable, an
 *             unmatched `$` stays literal.
 *   - \(…\) — single-line LaTeX inline delimiters.
 *   - bare \ce{…}/\pu{…} — up to one brace-nesting level.
 */
const INLINE_RE =
  /(?<!\\)\$(?=\S)((?:\\.|[^$\n\\])+?)(?<=\S)\$|\\\((.+?)\\\)|\\(?:ce|pu)\{(?:[^{}]|\{[^{}]*\})*\}/g;

/** Parse a smiles fence body; null → malformed/over cap, keep fence literal. */
function parseSmilesFence(body: string): ChemSmilesLine[] | null {
  const lines: ChemSmilesLine[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const sep = line.indexOf("|");
    const smiles = (sep === -1 ? line : line.slice(0, sep)).trim();
    const caption = sep === -1 ? undefined : line.slice(sep + 1).trim() || undefined;
    if (!smiles || smiles.length > MAX_SMILES_LENGTH) return null;
    lines.push({ smiles, caption });
  }
  if (lines.length === 0 || lines.length > MAX_SMILES_PER_FENCE) return null;
  return lines;
}

function pushText(out: ChemSegment[], content: string) {
  if (!content) return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.content += content;
  else out.push({ type: "text", content });
}

/**
 * Block segments replace whole lines, so eat ONE newline on each side — the
 * rendered block brings its own margin, and FeedbackBody's line loop must not
 * see a phantom blank line where the fence used to be.
 */
function trimBlockBoundary(out: ChemSegment[], following: string): string {
  const last = out[out.length - 1];
  if (last?.type === "text" && last.content.endsWith("\n")) {
    last.content = last.content.slice(0, -1);
    if (!last.content) out.pop();
  }
  return following.startsWith("\n") ? following.slice(1) : following;
}

/** Block pass only — FeedbackBody runs this, then its own line-based
 *  markdown-lite over the text segments (inline math is handled deeper). */
export function splitChemBlocks(text: string): ChemSegment[] {
  const src = text.replace(/\r\n/g, "\n");
  const out: ChemSegment[] = [];
  let cursor = 0;
  BLOCK_RE.lastIndex = 0;
  for (let m = BLOCK_RE.exec(src); m !== null; m = BLOCK_RE.exec(src)) {
    const raw = m[0];
    let segment: ChemSegment | null = null;
    if (m[1] !== undefined) {
      const lines = parseSmilesFence(m[2] ?? "");
      if (lines) segment = { type: "smiles", lines, raw };
    } else {
      const content = (m[3] !== undefined ? m[4] : m[6]) ?? "";
      if (content.trim() && content.length <= MAX_DISPLAY_MATH) {
        segment = { type: "math", content: content.trim(), display: true, raw };
      }
    }
    if (!segment) {
      // Malformed/over cap — keep the raw slice as literal text and move on.
      pushText(out, src.slice(cursor, m.index) + raw);
      cursor = m.index + raw.length;
      continue;
    }
    pushText(out, src.slice(cursor, m.index));
    cursor = m.index + raw.length;
    const rest = trimBlockBoundary(out, src.slice(cursor));
    out.push(segment);
    cursor = src.length - rest.length;
  }
  pushText(out, src.slice(cursor));
  return out;
}

/** Inline pass — $…$, \(…\), bare \ce{}/\pu{}. Never crosses newlines. */
export function splitChemInline(text: string): ChemSegment[] {
  const out: ChemSegment[] = [];
  let cursor = 0;
  INLINE_RE.lastIndex = 0;
  for (let m = INLINE_RE.exec(text); m !== null; m = INLINE_RE.exec(text)) {
    const raw = m[0];
    // Bare \ce{}/\pu{}: the whole match IS valid KaTeX input.
    const content = m[1] ?? m[2] ?? raw;
    if (raw.length > MAX_INLINE_MATH) {
      pushText(out, text.slice(cursor, m.index) + raw);
      cursor = m.index + raw.length;
      continue;
    }
    pushText(out, text.slice(cursor, m.index));
    out.push({ type: "math", content, display: false, raw });
    cursor = m.index + raw.length;
  }
  pushText(out, text.slice(cursor));
  return out;
}

/** Full tokenize: block pass, then inline pass over the text segments. */
export function tokenizeChem(text: string): ChemSegment[] {
  const out: ChemSegment[] = [];
  for (const block of splitChemBlocks(text)) {
    if (block.type !== "text") {
      out.push(block);
      continue;
    }
    out.push(...splitChemInline(block.content));
  }
  return out;
}

/**
 * TTS helper — collapse chem markup into something speakable. A no-op on
 * plain text, so callers apply it unconditionally.
 */
export function stripChemForSpeech(text: string, language?: string): string {
  if (!looksLikeChemMarkup(text)) return text;
  const structureNote =
    language === "english" ? "(structure shown in the quiz)" : "(Strukturformel im Quiz abgebildet)";
  const parts: string[] = [];
  for (const seg of tokenizeChem(text)) {
    if (seg.type === "text") {
      parts.push(unescapeChemText(seg.content));
    } else if (seg.type === "smiles") {
      const captions = seg.lines.map((l) => l.caption).filter(Boolean);
      parts.push(captions.length ? captions.join(", ") : structureNote);
    } else {
      parts.push(speakableMath(seg.content));
    }
  }
  return parts.join("");
}

/** Best-effort spoken form of a KaTeX/mhchem snippet. */
function speakableMath(content: string): string {
  let s = content;
  // \ce{2 H2 + O2 -> 2 H2O} → its body with speakable arrows (matches the
  // Unicode notation the base prompts produce, which TTS already handles).
  s = s.replace(/\\(?:ce|pu)\{((?:[^{}]|\{[^{}]*\})*)\}/g, "$1");
  s = s.replace(/<=>{1,2}|<-->/g, " ⇌ ").replace(/->/g, " → ").replace(/<-/g, " ← ");
  // \frac{a}{b} → a / b (repeat for nested fractions, innermost first).
  const frac = /\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g;
  while (frac.test(s)) s = s.replace(frac, "($1 / $2)");
  // Drop sub/superscript braces, keep the content: x^{2} → x^2.
  s = s.replace(/([_^])\{([^{}]*)\}/g, "$1$2");
  // \Delta → Delta, \rightarrow → rightarrow …; then drop leftover braces.
  s = s.replace(/\\([a-zA-Z]+)/g, "$1").replace(/[{}]/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}
