/**
 * Math-notation prompt addenda — applied UNCONDITIONALLY (this app has no
 * chem gating; every quiz renders math).
 *
 * The app renders KaTeX everywhere (components/ChemText.tsx is mounted
 * unconditionally — plain text without $-markup renders byte-identical and
 * never loads the chunk). The quiz-PRODUCING base prompts carry the math
 * rule inline (api/quiz/prompts.ts, api/grade/prompts.ts retry/mastery/
 * comprehension); these addenda cover the two surfaces whose base prompts
 * say nothing about notation: the examiners' feedback and the tutor chat.
 *
 * Injection pattern:
 *   systemInstruction: BASE + MATH_NOTATION_… + languageInstruction
 *
 * German master text, like every base prompt. Careful: template literals —
 * every LaTeX backslash is doubled so the emitted prompt carries `\frac{...}`.
 */

/** Appended to the EXAMINER prompts (co_pruefer_1/2, chef_pruefer incl. its
 *  decision retry). Comprehension grading reuses the same examiners. */
export const MATH_NOTATION_GRADING = `

NOTATION IN DEINEM FEEDBACK:
Die App des Studenten rendert Mathematik nativ (KaTeX). Schreibe mathematische Ausdrücke in deinem
Feedback als Inline-LaTeX zwischen $...$ (z. B. $\\frac{a+b}{c}$, $\\int_0^1 f(x)\\,dx$,
$\\lim_{n \\to \\infty} a_n$), mehrzeilige Herleitungen in $$...$$ auf eigenen Zeilen; kein Leerzeichen
direkt hinter dem öffnenden bzw. vor dem schließenden $. Einfache Symbole und chemische Formeln dürfen
Unicode bleiben (H₂SO₄, ⇌, ΔG, x², π) — kein LaTeX-Zwang für Einfaches. Keine \\begin{...}-Umgebungen
außerhalb der Delimiter, keine HTML-Tags. Die ===MARKER===-Struktur, Abschnitts- und
Aufgaben-Überschriften ("Aufgabe N" / "Task N") bleiben reiner Text. Auch alle Bewertungs- und
Beherrschungs-Prozentangaben (z. B. "Gesamtbeherrschung: 82 %") bleiben reiner Text — niemals in $...$.`;

/** One compact block for the tutor-chat "technical" rules array (single
 *  systemInstruction assembly in api/tutor/chat/route.ts). */
export const MATH_NOTATION_TUTOR =
  "- NOTATION: Dieser Chat rendert Mathematik nativ (KaTeX). Nutze, wo es dem Verständnis dient, " +
  "Inline-LaTeX in $...$ (z. B. $\\frac{a+b}{c}$, $\\int_0^1 f(x)\\,dx$; mehrzeilige Herleitungen in " +
  "$$...$$ auf eigenen Zeilen, kein Leerzeichen direkt innerhalb der Delimiter). Einfache Symbole und " +
  "chemische Formeln bleiben Unicode (H₂SO₄, ⇌, x², π); keine anderen LaTeX-Umgebungen, keine HTML-Tags.";
