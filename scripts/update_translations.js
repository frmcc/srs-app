const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');

const replacements = [
  // Sidebar fix
  {
    find: '<span className="font-medium">Dashboard</span>',
    replace: '<span className="font-medium whitespace-nowrap">Dashboard</span>'
  },
  {
    find: '<span className="font-medium">{language === \'german\' ? \'Material hochladen\' : \'Upload Material\'}</span>',
    replace: '<span className="font-medium whitespace-nowrap">{language === \'german\' ? \'Material hochladen\' : \'Upload Material\'}</span>'
  },
  {
    find: '<span className="font-medium">{language === \'german\' ? \'Bibliothek\' : \'Library\'}</span>',
    replace: '<span className="font-medium whitespace-nowrap">{language === \'german\' ? \'Bibliothek\' : \'Library\'}</span>'
  },
  {
    find: '<span className="font-medium">{language === \'german\' ? \'Einstellungen\' : \'Settings\'}</span>',
    replace: '<span className="font-medium whitespace-nowrap">{language === \'german\' ? \'Einstellungen\' : \'Settings\'}</span>'
  },
  {
    find: '<span className="font-medium text-sm">',
    replace: '<span className="font-medium text-sm whitespace-nowrap">'
  },
  // Quiz view
  {
    find: '>Active Quiz<',
    replace: '>{language === "german" ? "Aktives Quiz" : "Active Quiz"}<'
  },
  {
    find: 'Quiz Assignment',
    replace: '{language === "german" ? "Quiz-Aufgabe" : "Quiz Assignment"}'
  },
  {
    find: 'Back to Dashboard',
    replace: '{language === "german" ? "Zurück zum Dashboard" : "Back to Dashboard"}'
  },
  {
    find: '>View Remediation Brief<',
    replace: '>{language === "german" ? "Feedback ansehen" : "View Remediation Brief"}<'
  },
  {
    find: 'Remediation Brief & Feedback',
    replace: '{language === "german" ? "Feedback & Auswertung" : "Remediation Brief & Feedback"}'
  },
  // Library view
  {
    find: '>My Library<',
    replace: '>{language === "german" ? "Meine Bibliothek" : "My Library"}<'
  },
  {
    find: '>Review your stored modules, tutor prompts, and generating schedules.<',
    replace: '>{language === "german" ? "Überprüfe deine gespeicherten Module, Tutor-Prompts und Lernpläne." : "Review your stored modules, tutor prompts, and generating schedules."}<'
  },
  {
    find: '>All generated courses and details will reflect here as we build custom features!<',
    replace: '>{language === "german" ? "Alle generierten Kurse und Details werden hier angezeigt." : "All generated courses and details will reflect here as we build custom features!"}<'
  },
  // Settings view
  {
    find: '>Semester Settings<',
    replace: '>{language === "german" ? "Semester-Einstellungen" : "Semester Settings"}<'
  },
  {
    find: 'CURRENT STATUS',
    replace: '{language === "german" ? "AKTUELLER STATUS" : "CURRENT STATUS"}'
  },
  {
    find: '>Active study period<',
    replace: '>{language === "german" ? "Aktiver Studienzeitraum" : "Active study period"}<'
  },
  {
    find: 'MODULE PRESETS',
    replace: '{language === "german" ? "MODUL-VOREINSTELLUNGEN" : "MODULE PRESETS"}'
  },
  {
    find: 'e.g. Linear Algebra',
    replace: '{language === "german" ? "z.B. Lineare Algebra" : "e.g. Linear Algebra"}'
  },
  {
    find: '>Add<',
    replace: '>{language === "german" ? "Hinzufügen" : "Add"}<'
  },
  {
    find: 'LANGUAGE SETTING',
    replace: '{language === "german" ? "SPRACHE" : "LANGUAGE SETTING"}'
  },
  {
    find: 'DANGER ZONE',
    replace: '{language === "german" ? "GEFAHRENZONE" : "DANGER ZONE"}'
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
  // Audio/Video labels
  {
    find: '>PRE-LECTURE<',
    replace: '>{language === "german" ? "VORBEREITUNG" : "PRE-LECTURE"}<'
  },
  {
    find: '>POST-LECTURE<',
    replace: '>{language === "german" ? "NACHBEREITUNG" : "POST-LECTURE"}<'
  },
  {
    find: '>VIDEO STUDIO<',
    replace: '>{language === "german" ? "VIDEOSTUDIO" : "VIDEO STUDIO"}<'
  }
];

let newContent = content;
let count = 0;
replacements.forEach(r => {
  if (newContent.includes(r.find)) {
    newContent = newContent.split(r.find).join(r.replace);
    count++;
  } else {
    console.log("Could not find string: ", r.find);
  }
});

fs.writeFileSync('src/app/page.tsx', newContent);
console.log(`Replaced ${count} strings successfully.`);
