const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

const replacements = [
  {
    find: 'View Remediation Brief',
    replace: '{language === "german" ? "Feedback ansehen" : "View Remediation Brief"}'
  },
  {
    find: 'Remediation Brief & Feedback',
    replace: '{language === "german" ? "Feedback & Auswertung" : "Remediation Brief & Feedback"}'
  },
  {
    find: 'All generated courses and details will reflect here as we build custom features!',
    replace: '{language === "german" ? "Alle generierten Kurse und Details werden hier angezeigt." : "All generated courses and details will reflect here as we build custom features!"}'
  },
  {
    find: '>Semester Settings<',
    replace: '>{language === "german" ? "Semester-Einstellungen" : "Semester Settings"}<'
  },
  {
    find: '>Current Status<',
    replace: '>{language === "german" ? "Aktueller Status" : "Current Status"}<'
  },
  {
    find: '>Module Presets<',
    replace: '>{language === "german" ? "Modul-Voreinstellungen" : "Module Presets"}<'
  },
  {
    find: '>Language Setting<',
    replace: '>{language === "german" ? "Sprache" : "Language Setting"}<'
  },
  {
    find: '>Danger Zone<',
    replace: '>{language === "german" ? "Gefahrenzone" : "Danger Zone"}<'
  },
  {
    find: '>Add<',
    replace: '>{language === "german" ? "Hinzufügen" : "Add"}<'
  },
  {
    find: 'e.g. Linear Algebra',
    replace: '{language === "german" ? "z.B. Lineare Algebra" : "e.g. Linear Algebra"}'
  },
  {
    find: '>Starting a new semester will increment your semester counter and wipe your current module presets so you can start fresh.<',
    replace: '>{language === "german" ? "Der Start eines neuen Semesters erhöht den Semesterzähler und löscht deine aktuellen Modul-Voreinstellungen." : "Starting a new semester will increment your semester counter and wipe your current module presets so you can start fresh."}<'
  },
  {
    find: 'Start New Semester (Semester ${currentSemester + 1})',
    replace: '{language === "german" ? `Neues Semester starten (Semester ${currentSemester + 1})` : `Start New Semester (Semester ${currentSemester + 1})`}'
  },
  {
    find: '>Reset to Semester 1<',
    replace: '>{language === "german" ? "Auf Semester 1 zurücksetzen" : "Reset to Semester 1"}<'
  },
  {
    find: '>Pre-Lecture<',
    replace: '>{language === "german" ? "Vorbereitung" : "Pre-Lecture"}<'
  },
  {
    find: '>Post-Lecture<',
    replace: '>{language === "german" ? "Nachbereitung" : "Post-Lecture"}<'
  },
  {
    find: '>Video Studio<',
    replace: '>{language === "german" ? "Videostudio" : "Video Studio"}<'
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
