# SRS App (Spaced Repetition System)

Ein KI-basiertes Lernsystem, das Vorlesungsskripte verarbeitet, strukturierte Quizzes generiert und handschriftliche Einreichungen automatisch über die Google Gemini API korrigiert.

## 📱 Apple Shortcuts (Kurzbefehle)

Mit diesen Shortcuts kannst du direkt von deinem iPhone oder iPad Dokumente an das Backend schicken:

1. **Vorlesung hochladen (Quiz-Generierung starten)**
   Lade ein Skript hoch, um den Blueprint, das erste Quiz und die Podcast-Prompts zu generieren:
   👉 [iCloud Link: Vorlesung hochladen](https://www.icloud.com/shortcuts/5df6c00cf6854c09b04456810c380f80)

2. **Quiz-Lösung hochladen (Grading)**
   Mache ein Foto deiner beantworteten Aufgaben und lass sie von der KI korrigieren:
   👉 [iCloud Link: Grading](https://www.icloud.com/shortcuts/b31e9ae5e30844a0b41dad6b31d8f071)

---

## 🛠 Entwicklung & lokaler Start

Installiere die Abhängigkeiten und starte den Entwicklungsserver:

```bash
npm install
npm run dev
```

Die App ist anschließend unter [http://localhost:3000](http://localhost:3000) erreichbar.

## 🔐 Auth (wichtig für Deployment)

Die App unterstützt zwei Mechanismen (beide in `src/middleware.ts`):

- **`BASIC_AUTH_USER` + `BASIC_AUTH_PASSWORD`** — schützt die gesamte App (Browser fragt nach Login).
- **`SHORTCUT_TOKEN`** — Maschinen-Credential für die iPhone-Shortcuts. Wird als Header `x-shortcut-token: <token>` (oder `Authorization: Bearer <token>`) mitgeschickt und gilt überall als Alternative zu Basic Auth.

**Fail-closed:** Ist in Produktion *keine* der Varianten konfiguriert, blockiert die Middleware alle teuren/verändernden API-Endpoints (`/api/quiz*`, `/api/grade*`, `/api/podcast*`, `/api/transcribe`, `/api/tts` sowie alle Nicht-GET-Requests) mit `503`, damit niemand mit der URL die Gemini-Quota verbrennen kann. Seiten und lesende GETs bleiben erreichbar.

## 🗄 DB-Migration

Nach einem Schema-Update einmal ausführen (wendet die ALTERs idempotent auf Turso an):

```bash
node migrate.mjs
```

Aktuell enthalten: `ReviewLog.feedback` + `ReviewLog.itemId` (Feedback-Historie pro Modul).

## ☁️ Deployment (Cloud Run)

Um ein Update direkt in die Google Cloud (Cloud Run) zu pushen, nutze das Deployment-Skript oder den direkten Befehl:

```bash
gcloud run deploy srs-app --source . --region europe-west1 --project auto-drive-494409
```
