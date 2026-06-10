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
  "quiz1DocId TEXT",
  "quiz2DocId TEXT",
  "quiz3DocId TEXT",
  "quiz4DocId TEXT",
  "quiz5DocId TEXT",
  "quiz6DocId TEXT",
  "quiz7DocId TEXT",
  "sourceMaterialId TEXT",
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
  "videoUrl TEXT",
  "userId TEXT"
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
  console.log("Done fixing Turso!");
}

fix();
