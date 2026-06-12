const { createClient } = require("@libsql/client");
require("dotenv").config({ path: ".env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const columnsToAdd = [
  "tutorPromptDocId TEXT",
  "semester INTEGER NOT NULL DEFAULT 1",
  "tutorPromptContent TEXT",
  "quiz6DocId TEXT",
  "quiz7DocId TEXT",
  "sourceMaterialContent TEXT",
  "blueprint TEXT",
  "coverageLedger TEXT",
  "lastFeedback TEXT",
  "lastVideoPrompt1 TEXT",
  "lastVideoPrompt2 TEXT",
  "notebookId TEXT",
  "prePodcastPrompt TEXT",
  "postPodcastPrompt TEXT",
  "prePodcastUrl TEXT",
  "postPodcastUrl TEXT",
  "videoUrl TEXT"
];

async function fix() {
  for (const col of columnsToAdd) {
    try {
      console.log(`Adding ${col}...`);
      await client.execute(`ALTER TABLE SRSItem ADD COLUMN ${col}`);
      console.log(`Success.`);
    } catch (e) {
      console.log(`Failed (might already exist):`, e.message);
    }
  }
  
  // also check ReviewLog level?
  try {
     await client.execute(`CREATE TABLE IF NOT EXISTS ReviewLog (
        id TEXT PRIMARY KEY,
        subjectMain TEXT NOT NULL,
        subjectSub TEXT NOT NULL,
        level INTEGER NOT NULL,
        passed BOOLEAN NOT NULL,
        completedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        userId TEXT,
        FOREIGN KEY(userId) REFERENCES User(id) ON DELETE CASCADE
     )`);
  } catch(e) {}
  
  // AppConfig?
  try {
     await client.execute(`CREATE TABLE IF NOT EXISTS AppConfig (
        id INTEGER PRIMARY KEY DEFAULT 1,
        currentSemester INTEGER NOT NULL DEFAULT 1,
        modulePresets TEXT NOT NULL DEFAULT '[]',
        language TEXT NOT NULL DEFAULT 'german',
        updatedAt DATETIME NOT NULL
     )`);
  } catch(e) {}
  
  // BackgroundJob?
  try {
     await client.execute(`CREATE TABLE IF NOT EXISTS BackgroundJob (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        subjectMain TEXT NOT NULL,
        subjectSub TEXT NOT NULL DEFAULT 'Module',
        itemId TEXT,
        error TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME
     )`);
  } catch(e) {}

  console.log("Done fixing Turso!");
}

fix();
