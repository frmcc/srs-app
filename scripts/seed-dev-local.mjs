/**
 * Seeds the ISOLATED local verification DB (file:./dev-local.db — never Turso)
 * with one item carrying a graded regular attempt and a comprehension check,
 * both with answer snapshots, so the revisit views and the per-task tutor can
 * be driven without a live Gemini grading run.
 * Run:  node scripts/seed-dev-local.mjs
 */
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { encode } from "next-auth/jwt";

const DB_URL = "file:" + path.resolve(process.cwd(), "dev-local.db");
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: DB_URL }) });

const DAY = 86_400_000;
const now = Date.now();

const ANSWERED_QUIZ = `Aufgabe 1 - 2 Punkte:
Erkläre die Markownikow-Regel an der Addition von HBr an Propen. Welche Zwischenstufe entscheidet über das Hauptprodukt?

Aufgabe 2 - 3 Punkte:
Ein Alken entfärbt Bromwasser, ein Alkan nicht. Begründe den Unterschied auf Ebene der Bindungsverhältnisse.`;

const COMP_QUIZ = `Aufgabe 1 - 2 Punkte:
Warum verläuft die elektrophile Addition von Brom an Ethen als anti-Addition?

Aufgabe 2 - 2 Punkte:
Nenne die Zwischenstufe der HBr-Addition an Propen und begründe ihre Stabilität.`;

const feedbackFor = (pass, m1, m2) => `# Gesamtbewertung
${pass ? "PASS" : "REPEAT"} — Geschätzte Beherrschung: ${Math.round((m1 + m2) / 2)} %

${pass ? "Solide Leistung — die Kernkonzepte sitzen." : "Die Grundidee ist da, aber zentrale Begründungen fehlen noch."}

---

# Lern- und Nacharbeitsbrief für das nächste Modul
## Schwächste Konzepte oder Themen
- Hyperkonjugative Stabilisierung von Carbenium-Ionen
## Prioritäten für die nächste Lernschleife
1. Zwischenstufen zeichnen und vergleichen

---

# Bewertung pro Aufgabe

## Aufgabe 1
Geschätzte Beherrschung dieser Aufgabe: ${m1} %

**Was der Student gut gemacht hat:** Die Regel wurde korrekt benannt und am Beispiel angewendet.

**Fehlende, vage oder falsche Bestandteile:** Die Stabilität des sekundären Carbenium-Ions wurde nicht hyperkonjugativ begründet.

## Aufgabe 2
Geschätzte Beherrschung dieser Aufgabe: ${m2} %

**Was der Student gut gemacht hat:** Der π-Bindungs-Unterschied wurde sauber herausgearbeitet.

**Fehlende, vage oder falsche Bestandteile:** Der Nachweischarakter der Entfärbung blieb unerwähnt.`;

async function main() {
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, language: "german", currentSemester: 2, modulePresets: JSON.stringify(["Chemie"]) },
  });

  const sub = "Organische Chemie: Alkene & Additionsreaktionen";
  const existing = await prisma.sRSItem.findFirst({ where: { subjectSub: sub } });
  const data = {
    subjectMain: "Chemie",
    subjectSub: sub,
    semester: 2,
    currentLevel: 2,
    nextReviewDate: new Date(now + 3 * DAY),
    quiz1DocId: ANSWERED_QUIZ,
    quiz2DocId: ANSWERED_QUIZ,
    quiz3DocId: "Aufgabe 1 - 2 Punkte:\nFolgequiz (Level 3) — anderer Inhalt als der Snapshot, beweist dass die Wiederansicht den Snapshot liest.",
    sourceMaterialContent: "Vorlesungsskript (seed) — nur für lokale UI-Verifikation.",
    lastFeedback: feedbackFor(true, 90, 75),
    lastAnswersJson: JSON.stringify({
      v: 1,
      answeredAt: new Date(now - 2 * DAY).toISOString(),
      level: 1,
      passed: true,
      quizText: ANSWERED_QUIZ,
      tasks: {
        "aufgabe1-0": "Bei der Addition von HBr an Propen wandert das H an das C mit den meisten H-Atomen. Es entsteht das stabilere sekundäre Carbenium-Ion als Zwischenstufe, deshalb ist 2-Brompropan das Hauptprodukt.",
        "aufgabe2-1": "Das Alken hat eine π-Bindung, die als Elektronenpaar-Donor mit Brom reagiert — deshalb entfärbt es Bromwasser. Das Alkan hat nur σ-Bindungen und reagiert nicht.",
      },
      free: "",
      sketches: {},
      sketchesDropped: [],
    }),
    comprehensionScore: 72,
    comprehensionPassed: false,
    comprehensionAt: new Date(now - DAY),
    comprehensionQuizText: COMP_QUIZ,
    comprehensionFeedback: feedbackFor(false, 80, 64),
    comprehensionAnswersJson: JSON.stringify({
      v: 1,
      answeredAt: new Date(now - DAY).toISOString(),
      level: null,
      passed: false,
      score: 72,
      quizText: COMP_QUIZ,
      tasks: {
        "aufgabe1-0": "Weil das Bromonium-Ion die eine Seite abschirmt, greift das Bromid von der Rückseite an.",
        "aufgabe2-1": "Es entsteht ein Carbenium-Ion, das stabilste ist das sekundäre.",
      },
      free: "",
      sketches: {},
      sketchesDropped: [],
    }),
  };
  if (existing) {
    await prisma.sRSItem.update({ where: { id: existing.id }, data });
  } else {
    await prisma.sRSItem.create({ data });
  }

  const logCount = await prisma.reviewLog.count();
  if (logCount === 0) {
    const item = await prisma.sRSItem.findFirst({ where: { subjectSub: sub } });
    await prisma.reviewLog.create({
      data: {
        subjectMain: "Chemie",
        subjectSub: sub,
        level: 1,
        passed: true,
        completedAt: new Date(now - 2 * DAY),
        feedback: data.lastFeedback,
        itemId: item.id,
      },
    });
  }
  console.log("Seeded dev-local.db");

  // Session cookie for the dev-local server (same fixed local-only secret as
  // scripts/dev-local.sh) — page.tsx requires a session even with open APIs.
  const token = await encode({
    token: { sub: "local-verification", name: "Guest", email: "guest@local.test" },
    secret: "local-verification-only-not-a-real-secret",
    maxAge: 7 * 24 * 3600,
  });
  console.log("COOKIE=next-auth.session-token=" + token);
}

main().finally(() => prisma.$disconnect());
