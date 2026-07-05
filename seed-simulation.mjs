import { createClient } from "@libsql/client";
import fs from "fs";
import crypto from "crypto";

const envText = fs.readFileSync(".env", "utf8");
const dbUrlMatch = envText.match(/^DATABASE_URL="?([^"\n]+)"?/m);
const raw = dbUrlMatch[1];
const url = raw.split("?")[0];
const tokenMatch = raw.match(/authToken=([^&\s"]+)/);
const client = createClient({ url, authToken: tokenMatch[1] });

function cuid() {
  return 'c' + crypto.randomBytes(12).toString('hex');
}

function dateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function run() {
  console.log("Setting AppConfig to Semester 2...");
  await client.execute(`UPDATE "AppConfig" SET currentSemester = 2 WHERE id = 1`);

  const modules = [
    { name: "Anatomie", sem: 1, level: 6, age: 150 },
    { name: "Physiologie", sem: 1, level: 5, age: 140 },
    { name: "Biochemie", sem: 1, level: 7, age: 160 },
    { name: "Psychologie", sem: 1, level: 4, age: 130 },
    { name: "Histologie", sem: 1, level: 5, age: 145 },
    { name: "Pharmakologie", sem: 2, level: 1, age: 15 },
    { name: "Pathologie", sem: 2, level: 2, age: 20 },
    { name: "Mikrobiologie", sem: 2, level: 0, age: 5 },
    { name: "Immunologie", sem: 2, level: 1, age: 10 },
    { name: "Genetik", sem: 2, level: 0, age: 2 },
  ];

  for (const m of modules) {
    const itemId = cuid();
    const createdAt = dateDaysAgo(m.age);
    const nextReviewDate = dateDaysAgo(-3); // review in 3 days
    
    console.log(`Inserting module ${m.name} (Sem ${m.sem}, Level ${m.level})`);
    await client.execute({
      sql: `INSERT INTO "SRSItem" (id, subjectMain, subjectSub, createdAt, semester, currentLevel, nextReviewDate, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [itemId, m.name, "Allgemein", createdAt, m.sem, m.level, nextReviewDate, "cmpx6nyg10000s601i49ivn3t"]
    });

    let currentSimAge = m.age;
    for (let l = 0; l < m.level; l++) {
      currentSimAge -= (l === 0 ? 1 : l * 3);
      if (currentSimAge < 0) currentSimAge = 0;
      
      // simulate occasional fail
      if (Math.random() > 0.8) {
        const failDate = dateDaysAgo(currentSimAge);
        await client.execute({
          sql: `INSERT INTO "ReviewLog" (id, subjectMain, subjectSub, level, passed, completedAt, itemId, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [cuid(), m.name, "Allgemein", l, 0, failDate, itemId, "cmpx6nyg10000s601i49ivn3t"]
        });
        currentSimAge -= 1;
      }
      
      const successDate = dateDaysAgo(currentSimAge);
      await client.execute({
        sql: `INSERT INTO "ReviewLog" (id, subjectMain, subjectSub, level, passed, completedAt, itemId, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [cuid(), m.name, "Allgemein", l, 1, successDate, itemId, "cmpx6nyg10000s601i49ivn3t"]
      });
    }
  }

  console.log("Done! Simulation data seeded.");
}

run();
