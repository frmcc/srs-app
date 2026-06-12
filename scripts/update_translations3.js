const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

const replacements = [
  // Upload Page
  {
    find: 'Module (Semester ${currentSemester})',
    replace: '{language === "german" ? `Modul (Semester ${currentSemester})` : `Module (Semester ${currentSemester})`}'
  },
  {
    find: '>Manage Presets<',
    replace: '>{language === "german" ? "Verwalten" : "Manage Presets"}<'
  },
  {
    find: '>Topic / Thema<',
    replace: '>{language === "german" ? "Thema" : "Topic"}<'
  },
  {
    find: '>Lecture Material (Files or Text)<',
    replace: '>{language === "german" ? "Vorlesungsmaterial (Dateien oder Text)" : "Lecture Material (Files or Text)"}<'
  },
  {
    find: '>Drag and drop your PDFs, Excel, or Word files here<',
    replace: '>{language === "german" ? "Ziehe deine PDFs, Excel- oder Word-Dateien hierher" : "Drag and drop your PDFs, Excel, or Word files here"}<'
  },
  {
    find: '>Browse Files<',
    replace: '>{language === "german" ? "Dateien durchsuchen" : "Browse Files"}<'
  },
  {
    find: 'placeholder="...or paste your lecture notes, transcript, or raw text here..."',
    replace: 'placeholder={language === "german" ? "...oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein..." : "...or paste your lecture notes, transcript, or raw text here..."}'
  },
  {
    find: 'Start 6-Stage AI Generation',
    replace: '{language === "german" ? "6-Stufen KI-Generierung starten" : "Start 6-Stage AI Generation"}'
  },
  // Notifications
  {
    find: '"Notifications On"',
    replace: 'language === "german" ? "Benachrichtigungen an" : "Notifications On"'
  },
  {
    find: '"Notifications Blocked"',
    replace: 'language === "german" ? "Benachrichtigungen blockiert" : "Notifications Blocked"'
  },
  {
    find: '"Enable Notifications"',
    replace: 'language === "german" ? "Benachrichtigungen aktivieren" : "Enable Notifications"'
  },
  // Tutor Promo
  {
    find: '>Upgrade your learning with voice AI.<',
    replace: '>{language === "german" ? "Optimiere dein Lernen mit Sprach-KI." : "Upgrade your learning with voice AI."}<'
  },
  {
    find: '>Unlock (Phase 2)<',
    replace: '>{language === "german" ? "Freischalten (Phase 2)" : "Unlock (Phase 2)"}<'
  },
  // Quiz taking
  {
    find: 'SUBMIT ALL ANSWERS FOR AI GRADING',
    replace: '{language === "german" ? "ALLE ANTWORTEN ZUR KI-BEWERTUNG EINREICHEN" : "SUBMIT ALL ANSWERS FOR AI GRADING"}'
  },
  {
    find: 'placeholder="Type your answer here..."',
    replace: 'placeholder={language === "german" ? "Tippe deine Antwort hier ein..." : "Type your answer here..."}'
  }
];

let count = 0;
replacements.forEach(r => {
  if (content.includes(r.find)) {
    content = content.split(r.find).join(r.replace);
    count++;
  } else {
    console.log("Not found: " + r.find);
  }
});

fs.writeFileSync('src/app/page.tsx', content);
console.log(`Replaced ${count} strings.`);
