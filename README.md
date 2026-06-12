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

## ☁️ Deployment (Cloud Run)

Um ein Update direkt in die Google Cloud (Cloud Run) zu pushen, nutze das Deployment-Skript oder den direkten Befehl:

```bash
gcloud run deploy srs-app --source . --region europe-west1 --project auto-drive-494409
```
