import { createClient } from "@libsql/client";
import fs from "fs";

/**
 * Repariert die PRODUKTIONS-Datenbank (die aus DATABASE_URL — tutorsrshost),
 * indem sie mit dem aktuellen prisma/schema.prisma abgeglichen wird:
 *
 *  1. Fehlende Tabellen werden angelegt (CREATE TABLE IF NOT EXISTS).
 *  2. Fehlende Spalten werden per ALTER TABLE ADD COLUMN ergänzt.
 *  3. Falls die DB SaaS-benannte Spalten trägt (tutorPromptUrl, quiz1Url, …),
 *     werden deren Daten in die personal-App-Spalten (…DocId) KOPIERT, damit
 *     keine Quiz-Texte "verschwinden".
 *  4. Fehlende Indizes werden angelegt.
 *
 * WICHTIG: Liest DATABASE_URL direkt aus der .env — absichtlich NICHT die
 * TURSO_DATABASE_URL-Variable, die auf eine ANDERE Datenbank zeigt
 * (tutorsrspersonal). Genau diese Verwechslung hat die letzte Migration ins
 * Leere laufen lassen.
 *
 * Idempotent — mehrfaches Ausführen ist harmlos.
 * Aufruf: node fix-prod-db.mjs
 */

// ---- .env selbst parsen (kein dotenv: das würde TURSO_* mitladen) ----------
const envText = fs.readFileSync(".env", "utf8");
const dbUrlMatch = envText.match(/^DATABASE_URL="?([^"\n]+)"?/m);
if (!dbUrlMatch) {
  console.error("DATABASE_URL nicht in .env gefunden.");
  process.exit(1);
}
const raw = dbUrlMatch[1];
const url = raw.split("?")[0];
const tokenMatch = raw.match(/authToken=([^&\s"]+)/);
if (!url.startsWith("libsql://") || !tokenMatch) {
  console.error("DATABASE_URL ist keine libsql-URL mit authToken — Abbruch.");
  process.exit(1);
}
console.log(`Ziel-Datenbank (PROD): ${url}`);

const client = createClient({ url, authToken: tokenMatch[1] });

// ---- Soll-Schema (aus prisma/schema.prisma abgeleitet) ----------------------
// [Spaltenname, SQL-Definition für ADD COLUMN]
const TABLES = {
  User: {
    create: `CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "name" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    columns: {
      id: `TEXT`,
      email: `TEXT`,
      name: `TEXT`,
      createdAt: `DATETIME DEFAULT CURRENT_TIMESTAMP`,
    },
    indexes: [`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`],
  },
  SRSItem: {
    create: `CREATE TABLE IF NOT EXISTS "SRSItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "subjectMain" TEXT NOT NULL,
      "subjectSub" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "tutorPromptDocId" TEXT,
      "tutorPromptContent" TEXT,
      "semester" INTEGER NOT NULL DEFAULT 1,
      "currentLevel" INTEGER NOT NULL DEFAULT 0,
      "nextReviewDate" DATETIME NOT NULL,
      "quiz1DocId" TEXT, "quiz2DocId" TEXT, "quiz3DocId" TEXT,
      "quiz4DocId" TEXT, "quiz5DocId" TEXT, "quiz6DocId" TEXT, "quiz7DocId" TEXT,
      "sourceMaterialId" TEXT,
      "sourceMaterialContent" TEXT,
      "blueprint" TEXT,
      "coverageLedger" TEXT,
      "lastFeedback" TEXT,
      "lastVideoPrompt1" TEXT,
      "lastVideoPrompt2" TEXT,
      "notebookId" TEXT,
      "prePodcastPrompt" TEXT,
      "postPodcastPrompt" TEXT,
      "prePodcastUrl" TEXT,
      "postPodcastUrl" TEXT,
      "videoUrl" TEXT,
      "userId" TEXT
    )`,
    columns: {
      tutorPromptDocId: `TEXT`,
      tutorPromptContent: `TEXT`,
      semester: `INTEGER NOT NULL DEFAULT 1`,
      currentLevel: `INTEGER NOT NULL DEFAULT 0`,
      quiz1DocId: `TEXT`, quiz2DocId: `TEXT`, quiz3DocId: `TEXT`,
      quiz4DocId: `TEXT`, quiz5DocId: `TEXT`, quiz6DocId: `TEXT`, quiz7DocId: `TEXT`,
      sourceMaterialId: `TEXT`,
      sourceMaterialContent: `TEXT`,
      blueprint: `TEXT`,
      coverageLedger: `TEXT`,
      lastFeedback: `TEXT`,
      lastVideoPrompt1: `TEXT`,
      lastVideoPrompt2: `TEXT`,
      notebookId: `TEXT`,
      prePodcastPrompt: `TEXT`,
      postPodcastPrompt: `TEXT`,
      prePodcastUrl: `TEXT`,
      postPodcastUrl: `TEXT`,
      videoUrl: `TEXT`,
      userId: `TEXT`,
    },
    indexes: [
      `CREATE INDEX IF NOT EXISTS "SRSItem_nextReviewDate_idx" ON "SRSItem"("nextReviewDate")`,
      `CREATE INDEX IF NOT EXISTS "SRSItem_subjectMain_idx" ON "SRSItem"("subjectMain")`,
    ],
    // SaaS-Spaltenname → personal-Spaltenname (Daten kopieren, falls vorhanden)
    copyFrom: {
      tutorPromptUrl: "tutorPromptDocId",
      quiz1Url: "quiz1DocId", quiz2Url: "quiz2DocId", quiz3Url: "quiz3DocId",
      quiz4Url: "quiz4DocId", quiz5Url: "quiz5DocId", quiz6Url: "quiz6DocId", quiz7Url: "quiz7DocId",
      sourceMaterialUrl: "sourceMaterialId",
    },
  },
  PushSubscription: {
    create: `CREATE TABLE IF NOT EXISTS "PushSubscription" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "endpoint" TEXT NOT NULL,
      "p256dh" TEXT NOT NULL,
      "auth" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    columns: {},
    indexes: [`CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint")`],
  },
  BackgroundJob: {
    create: `CREATE TABLE IF NOT EXISTS "BackgroundJob" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "subjectMain" TEXT NOT NULL,
      "subjectSub" TEXT NOT NULL DEFAULT 'Module',
      "itemId" TEXT,
      "error" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" DATETIME
    )`,
    columns: {
      subjectSub: `TEXT NOT NULL DEFAULT 'Module'`,
      itemId: `TEXT`,
      error: `TEXT`,
      updatedAt: `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      completedAt: `DATETIME`,
    },
    indexes: [`CREATE INDEX IF NOT EXISTS "BackgroundJob_status_createdAt_idx" ON "BackgroundJob"("status", "createdAt")`],
  },
  AppConfig: {
    create: `CREATE TABLE IF NOT EXISTS "AppConfig" (
      "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
      "currentSemester" INTEGER NOT NULL DEFAULT 1,
      "modulePresets" TEXT NOT NULL DEFAULT '[]',
      "language" TEXT NOT NULL DEFAULT 'german',
      "wrapperMode" TEXT NOT NULL DEFAULT 'all',
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    columns: {
      currentSemester: `INTEGER NOT NULL DEFAULT 1`,
      modulePresets: `TEXT NOT NULL DEFAULT '[]'`,
      language: `TEXT NOT NULL DEFAULT 'german'`,
      wrapperMode: `TEXT NOT NULL DEFAULT 'all'`,
      updatedAt: `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    },
    indexes: [],
  },
  ReviewLog: {
    create: `CREATE TABLE IF NOT EXISTS "ReviewLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "subjectMain" TEXT NOT NULL,
      "subjectSub" TEXT NOT NULL,
      "level" INTEGER NOT NULL,
      "passed" BOOLEAN NOT NULL,
      "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "feedback" TEXT,
      "itemId" TEXT,
      "userId" TEXT
    )`,
    columns: {
      feedback: `TEXT`,
      itemId: `TEXT`,
      userId: `TEXT`,
    },
    indexes: [
      `CREATE INDEX IF NOT EXISTS "ReviewLog_itemId_idx" ON "ReviewLog"("itemId")`,
      `CREATE INDEX IF NOT EXISTS "ReviewLog_completedAt_idx" ON "ReviewLog"("completedAt")`,
    ],
  },
};

async function columnsOf(table) {
  try {
    const res = await client.execute(`PRAGMA table_info("${table}")`);
    return res.rows.map((r) => String(r.name));
  } catch {
    return [];
  }
}

async function main() {
  let changes = 0;

  for (const [table, def] of Object.entries(TABLES)) {
    const before = await columnsOf(table);

    if (before.length === 0) {
      console.log(`⚠️  Tabelle ${table} fehlt komplett — wird angelegt.`);
      await client.execute(def.create);
      changes++;
    } else {
      for (const [col, sqlType] of Object.entries(def.columns)) {
        if (!before.includes(col)) {
          console.log(`+ ${table}.${col} wird ergänzt`);
          await client.execute(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${sqlType}`);
          changes++;
        }
      }
    }

    // Daten aus SaaS-benannten Spalten übernehmen (nur wenn Quelle existiert & Ziel leer)
    if (def.copyFrom) {
      const now = await columnsOf(table);
      for (const [src, dst] of Object.entries(def.copyFrom)) {
        if (now.includes(src) && now.includes(dst)) {
          const res = await client.execute(
            `UPDATE "${table}" SET "${dst}" = "${src}" WHERE "${dst}" IS NULL AND "${src}" IS NOT NULL`
          );
          if (res.rowsAffected > 0) {
            console.log(`↪ ${table}: ${res.rowsAffected} Werte von ${src} → ${dst} kopiert`);
            changes++;
          }
        }
      }
    }

    for (const idx of def.indexes) {
      try {
        await client.execute(idx);
      } catch (e) {
        if (!String(e.message).includes("already exists")) console.warn(`Index-Warnung (${table}):`, e.message);
      }
    }

    const after = await columnsOf(table);
    console.log(`✓ ${table}: ${after.length} Spalten [${after.join(", ")}]`);
  }

  console.log(changes === 0
    ? "\nAlles war bereits aktuell — keine Änderungen nötig."
    : `\nFertig — ${changes} Änderung(en) angewendet. Jetzt die App neu laden!`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FEHLER:", e.message || e);
  process.exit(1);
});
