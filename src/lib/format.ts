/**
 * TY-4 — one percent convention app-wide.
 * German (DIN 5008) sets a narrow no-break space (U+202F) between the number
 * and the sign ("82 %"); English sets none ("82%"). Every user-facing
 * percentage goes through here so the two styles never coexist on one screen.
 */
export function fmtPercent(value: number, language: string): string {
  return `${Math.round(value)}${language === "german" ? "\u202F" : ""}%`;
}
