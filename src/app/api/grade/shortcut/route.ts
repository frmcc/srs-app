import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { GRADE_PROMPTS } from "../prompts";
import { PROMPTS } from "../../quiz/prompts";
import { downloadFromDrive, createGoogleDoc } from "@/lib/google-drive";
import { sendPushNotification } from "@/lib/push";
import { generateContentWithRetry } from "@/lib/gemini-retry";
import { generateVideoPromptsWorker } from "@/lib/notebooklm";
import fs from "fs/promises";
import path from "path";
import os from "os";

export const maxDuration = 300;

const modelName = "gemini-3.1-flash-lite";

const formatPrompt = (template: string, vars: Record<string, any>) => {
  let formatted = template;
  for (const [key, val] of Object.entries(vars)) {
    formatted = formatted.replace(new RegExp(`{${key}}`, "g"), String(val));
  }
  return formatted;
};

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 400 });
  }

  const formData = await req.formData();
  const notes = formData.get("notes") as string | null;
  const file = formData.get("file") as File | null;

  if (!notes) {
    return NextResponse.json({ error: "Missing calendar notes" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
  }

  const match = notes.match(/quizId=([a-zA-Z0-9_-]+)/);
  if (!match) {
    return NextResponse.json({ error: "Could not find quizId in notes", notes }, { status: 400 });
  }

  const itemId = match[1];

  const srsItem = await prisma.sRSItem.findUnique({
    where: { id: itemId }
  });

  if (!srsItem) {
    return NextResponse.json({ error: "SRS item not found for ID: " + itemId }, { status: 404 });
  }

  // We have the file and the item. 
  // We will process this asynchronously to prevent the Shortcut from timing out.
  after(async () => {
    try {
      console.log(`[Shortcut Grade] Starting background grading for item ${itemId}`);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      // 1. Upload the submitted student PDF to Gemini File API
      const buffer = Buffer.from(await file.arrayBuffer());
      const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const localFilePath = path.join(os.tmpdir(), uniqueFileName);
      await fs.writeFile(localFilePath, buffer);

      const studentPdfUpload = await ai.files.upload({
        file: localFilePath,
        config: { mimeType: file.type || "application/pdf" }
      });
      
      const studentPdfFileData = {
        fileData: { fileUri: studentPdfUpload.uri as string, mimeType: studentPdfUpload.mimeType as string }
      };

      // 2. Fetch Source Material
      let sourceMaterialParts: any[] = [];
      if (srsItem.sourceMaterialContent) {
        try {
          const parsed = JSON.parse(srsItem.sourceMaterialContent);
          // Load files from Google Drive using inlineData (Gemini cache expires after 48h)
          if (parsed.driveFileId) {
            try {
              const buffer = await downloadFromDrive(parsed.driveFileId);
              const base64Data = buffer.toString("base64");
              
              sourceMaterialParts.push({
                inlineData: {
                  data: base64Data,
                  mimeType: "application/pdf"
                }
              });
            } catch (err: unknown) {
              const errObj = err instanceof Error ? err : new Error(String(err));
              console.error(`Could not download file from Drive:`, errObj.message);
            }
          } else if (parsed.files && Array.isArray(parsed.files)) {
            // Legacy fallback logic for older items
            for (const fileInfo of parsed.files) {
              try {
                if (fileInfo.base64) {
                  sourceMaterialParts.push({
                    inlineData: {
                      data: fileInfo.base64,
                      mimeType: fileInfo.mimeType
                    }
                  });
                }
              } catch (fileErr: unknown) {
                const errObj = fileErr instanceof Error ? fileErr : new Error(String(fileErr));
                console.error(`Could not use legacy file:`, errObj.message);
              }
            }
          }
          
          // If there are no gemini files, but there is text content
          if (sourceMaterialParts.length === 0 && parsed.text) {
            sourceMaterialParts.push({ text: `Vorlesungsmaterial:\n${parsed.text}` });
          }
        } catch (e) {
          console.error("Failed to parse sourceMaterialContent", e);
        }
      }

      // 3. Fetch the Quiz Questions (we need to know what the student answered)
      const quizField = srsItem.currentLevel === 0 ? "quiz1DocId" :
                        srsItem.currentLevel === 1 ? "quiz2DocId" :
                        srsItem.currentLevel === 2 ? "quiz3DocId" :
                        srsItem.currentLevel === 3 ? "quiz4DocId" :
                        srsItem.currentLevel === 4 ? "quiz5DocId" :
                        srsItem.currentLevel === 5 ? "quiz6DocId" : "quiz7DocId";
      const quizQuestions = (srsItem as any)[quizField] || "Unbekanntes Quiz";

      const safeStartExt = "===STUDENT_QUIZ_START===".replace(/===/g, '={3,}');
      const safeEndExt = "===STUDENT_QUIZ_END===".replace(/===/g, '={3,}');
      const studentQuizRegex = new RegExp(`[\\s\\S]*?${safeStartExt}\\s*([\\s\\S]*?)\\s*${safeEndExt}`, "i");
      const studentQuizMatch = quizQuestions.match(studentQuizRegex);
      const studentQuizText = studentQuizMatch && studentQuizMatch[1] ? studentQuizMatch[1].trim() : quizQuestions;

      // 4. Mismatch Check
      const mismatchCheckRes = await generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: [studentPdfFileData, { text: "Studenten-Antwort (siehe PDF)" }] }],
        config: {
          systemInstruction: formatPrompt(GRADE_PROMPTS.mismatch_check, { QUIZ_QUESTIONS: quizQuestions })
        }
      }, () => {}, "Submission Check");
      
      const mismatchCheckText = (mismatchCheckRes.text || "").toUpperCase();
      if (mismatchCheckText.includes("MISMATCH")) {
        throw new Error("Falsches Dokument hochgeladen (MISMATCH). Bitte überprüfe die PDF.");
      }

      // 5. Grading Setup
      const totalTasks = (quizQuestions.match(/^\d+\.|^\*\s/gm) || []).length || 5;
      const splitPoint = Math.max(1, Math.floor(totalTasks / 2));
      const startIdx2 = splitPoint + 1;
      const subject = srsItem.subjectMain;
      const interval = `Level ${srsItem.currentLevel}`;

      // 6. Co-Prüfer
      const co1UserParts = [...sourceMaterialParts];
      if (srsItem.blueprint) co1UserParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
      co1UserParts.push({ text: `Original-Quizfragen:\n${quizQuestions}` });
      co1UserParts.push({ text: `Beantwortetes Quiz des Studenten (handschriftlich gescannt):` });
      co1UserParts.push(studentPdfFileData);
      co1UserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

      console.log(`[Shortcut Grade] Running Co-Prüfer for item ${itemId}`);
      const [res1, res2] = await Promise.all([
        generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: co1UserParts }],
          config: { systemInstruction: formatPrompt(GRADE_PROMPTS.co_pruefer_1, { TOTAL_TASKS: totalTasks, SPLIT_POINT: splitPoint, SUBJECT: subject, INTERVAL: interval }) }
        }, () => {}, "Co-Prüfer 1"),
        generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: co1UserParts }],
          config: { systemInstruction: formatPrompt(GRADE_PROMPTS.co_pruefer_2, { TOTAL_TASKS: totalTasks, START_INDEX: startIdx2, SUBJECT: subject, INTERVAL: interval }) }
        }, () => {}, "Co-Prüfer 2")
      ]);

      const part1Feedback = res1.text || "";
      const part2Feedback = res2.text || "";

      // 6. Chief Assessor
      const chefUserParts = [...sourceMaterialParts];
      chefUserParts.push({ text: `Bewertung der ersten Quiz-Hälfte (von Co-Prüfer 1):\n${part1Feedback}` });
      chefUserParts.push({ text: `Bewertung der zweiten Quiz-Hälfte (von Co-Prüfer 2):\n${part2Feedback}` });
      chefUserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

      const chefRes = await generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: chefUserParts }],
        config: { systemInstruction: formatPrompt(GRADE_PROMPTS.chef_pruefer, { SUBJECT: subject, INTERVAL: interval }) }
      }, () => {}, "Chief Assessor");

      const chefFeedback = chefRes.text || "";
      const decisionMatch = chefFeedback.match(/===ASSESSMENT_DECISION_START===([\s\S]*?)===ASSESSMENT_DECISION_END===/);
      const decisionStr = (decisionMatch ? decisionMatch[1] : "").trim().toUpperCase();
      const isPass = decisionStr === "PASS" || decisionStr === "PASSED" || decisionStr.startsWith("PASS");

      // 7. Video Prompts & Remedial logic
      const lmInstruction = isPass ? GRADE_PROMPTS.video_pass : GRADE_PROMPTS.video_repeat;
      const lmUserParts = [...sourceMaterialParts];
      if (srsItem.blueprint) lmUserParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
      lmUserParts.push({ text: `Original Quizfragen:\n${quizQuestions}` });
      lmUserParts.push({ text: `Studenten-Antwort (als PDF angehängt):` });
      lmUserParts.push(studentPdfFileData);
      lmUserParts.push({ text: `Output des Assessment-Grader-AIs:\n${chefFeedback}` });
      lmUserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

      const lmPromptCall = generateContentWithRetry(ai, modelName, {
        contents: [{ role: "user", parts: lmUserParts }],
        config: { systemInstruction: formatPrompt(lmInstruction, { SUBJECT: subject, INTERVAL: interval }) }
      }, () => {}, "Video Prompts");

      let nextQuizText = "";
      let newLedgerText = "";
      let lmRes;

      if (isPass) {
        const nextLevel = Math.min(srsItem.currentLevel + 1, 6);
        
        let nextQuizParts: any[] = [];
        let nextPrompt = "";
        let nextIntervalLabel = "";

        if (nextLevel <= 4) {
          nextQuizParts = [...sourceMaterialParts];
          nextQuizParts.push({ text: `Modul/Vorlesungsthema:\n${srsItem.subjectMain}` });
          if (srsItem.blueprint) nextQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
          if (studentQuizText) nextQuizParts.push({ text: `Vorheriger Quiz-Agent-Output:\n${studentQuizText}` });
          if (srsItem.coverageLedger) nextQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
          nextQuizParts.push({ text: "Hier sind die Materialien und der bisherige Kontext. Bitte führe deine System-Instruktionen präzise aus." });
          
          if (nextLevel === 1) { nextPrompt = PROMPTS.quiz_tag_3; nextIntervalLabel = "Tag 3"; }
          else if (nextLevel === 2) { nextPrompt = PROMPTS.quiz_tag_7; nextIntervalLabel = "Tag 7"; }
          else if (nextLevel === 3) { nextPrompt = PROMPTS.quiz_tag_21; nextIntervalLabel = "Tag 21"; }
          else if (nextLevel === 4) { nextPrompt = PROMPTS.quiz_tag_60; nextIntervalLabel = "Tag 60"; }
        } else {
          nextQuizParts = [...sourceMaterialParts];
          if (srsItem.blueprint) nextQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
          if (srsItem.coverageLedger) nextQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
          nextQuizParts.push({ text: `Original Quizfragen:\n${quizQuestions}` });
          nextQuizParts.push({ text: `Studenten-Antwort (als PDF angehängt):` });
          nextQuizParts.push(studentPdfFileData);
          nextQuizParts.push({ text: `Output des Assessment-Grader-AIs:\n${chefFeedback}` });
          nextQuizParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });
          
          nextPrompt = GRADE_PROMPTS.next_quiz_pass;
          nextIntervalLabel = nextLevel === 5 ? "Tag 180" : "Tag 365";
        }

        const nextQuizCall = generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: nextQuizParts }],
          config: { systemInstruction: formatPrompt(nextPrompt, { SUBJECT: subject, NEXT_INTERVAL: nextIntervalLabel, NEXT_INTERVAL_LABEL: nextIntervalLabel }) }
        }, () => {}, `Next Quiz (${nextIntervalLabel})`);

        const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
        lmRes = lmResult;
        nextQuizText = nextQuizRes.text || "";
        
        // Extract new ledger
        const safeStart = "===COVERAGE_LEDGER_START===".replace(/===/g, '={3,}');
        const safeEnd = "===COVERAGE_LEDGER_END===".replace(/===/g, '={3,}');
        const ledgerRegex = new RegExp(`[\\s\\S]*?${safeStart}\\s*([\\s\\S]*?)\\s*${safeEnd}`, "i");
        const ledgerMatch = nextQuizText.match(ledgerRegex);
        if (ledgerMatch && ledgerMatch[1]) {
          newLedgerText = ledgerMatch[1].trim();
        }
      } else {
        const nextQuizCall = generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: lmUserParts }],
          config: { systemInstruction: formatPrompt(GRADE_PROMPTS.retry_quiz_fail, { SUBJECT: subject, INTERVAL: interval }) }
        }, () => {}, "Next Quiz (REPEAT)");
        const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
        lmRes = lmResult;
        nextQuizText = nextQuizRes.text || "";
      }

      const videoPromptsText = lmRes.text || "";
      const v1Match = videoPromptsText.match(/===VIDEO_1_START===([\s\S]*?)===VIDEO_1_END===/);
      const v2Match = videoPromptsText.match(/===VIDEO_2_START===([\s\S]*?)===VIDEO_2_END===/);
      const lastVideoPrompt1 = v1Match ? v1Match[1].trim() : videoPromptsText;
      const lastVideoPrompt2 = v2Match ? v2Match[1].trim() : "";

      // 8. Calculate Next Review Date
      const now = new Date();
      let intervalDays = 1;
      if (isPass) {
        switch (srsItem.currentLevel) {
          case 0: intervalDays = 3; break;
          case 1: intervalDays = 7; break;
          case 2: intervalDays = 21; break;
          case 3: intervalDays = 60; break;
          case 4: intervalDays = 180; break;
          default: intervalDays = 365; break;
        }
      } else {
        switch (srsItem.currentLevel) {
          case 0: intervalDays = 1; break;
          case 1: intervalDays = 3; break;
          default: intervalDays = 7; break;
        }
      }

      const nextReviewDate = new Date();
      nextReviewDate.setDate(now.getDate() + intervalDays);

      // Clean up the feedback for the UI
      const summaryMatch = chefFeedback.match(/===ASSESSMENT_SUMMARY_START===([\s\S]*?)===ASSESSMENT_SUMMARY_END===/);
      const briefMatch = chefFeedback.match(/===REMEDIATION_BRIEF_START===([\s\S]*?)===REMEDIATION_BRIEF_END===/);
      
      let cleanFeedback = "";
      if (summaryMatch) cleanFeedback += summaryMatch[1].trim() + "\n\n---\n\n";
      if (briefMatch) cleanFeedback += briefMatch[1].trim();
      if (!cleanFeedback) cleanFeedback = chefFeedback;

      const updatePayload: any = {
        nextReviewDate,
        lastFeedback: cleanFeedback,
        lastVideoPrompt1,
        lastVideoPrompt2,
      };

      if (isPass) {
        const nextLevel = srsItem.currentLevel + 1;
        updatePayload.currentLevel = nextLevel;
        if (newLedgerText) {
          updatePayload.coverageLedger = newLedgerText;
        }
        if (nextQuizText) {
          const nextQuizField = nextLevel === 1 ? "quiz2DocId" :
                                nextLevel === 2 ? "quiz3DocId" :
                                nextLevel === 3 ? "quiz4DocId" :
                                nextLevel === 4 ? "quiz5DocId" :
                                nextLevel === 5 ? "quiz6DocId" : "quiz7DocId";
          updatePayload[nextQuizField] = nextQuizText;
          
          let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
          if (srsItem.sourceMaterialContent) {
            try {
              const parsedSrc = JSON.parse(srsItem.sourceMaterialContent);
              if (parsedSrc.driveFolderId) folderId = parsedSrc.driveFolderId;
            } catch(e) {}
          }
          const intervalsArr = ["Tag 1", "Tag 3", "Tag 7", "Tag 21", "Tag 60", "Tag 180", "Tag 365"];
          const docInterval = nextLevel <= 6 ? intervalsArr[nextLevel] : "Tag 365+";
          const docName = `Quiz ${nextLevel + 1} (${docInterval})`;
          try {
            await createGoogleDoc(docName, nextQuizText, folderId);
          } catch(e) {
            console.error("Failed to upload next quiz to drive", e);
          }
        }
      } else {
        const quizField = srsItem.currentLevel === 0 ? "quiz1DocId" :
                          srsItem.currentLevel === 1 ? "quiz2DocId" :
                          srsItem.currentLevel === 2 ? "quiz3DocId" :
                          srsItem.currentLevel === 3 ? "quiz4DocId" :
                          srsItem.currentLevel === 4 ? "quiz5DocId" :
                          srsItem.currentLevel === 5 ? "quiz6DocId" : "quiz7DocId";
        if (nextQuizText) {
          updatePayload[quizField] = nextQuizText;
          
          let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
          if (srsItem.sourceMaterialContent) {
            try {
              const parsedSrc = JSON.parse(srsItem.sourceMaterialContent);
              if (parsedSrc.driveFolderId) folderId = parsedSrc.driveFolderId;
            } catch(e) {}
          }
          const docName = `Wiederholungs-Quiz (Level ${srsItem.currentLevel})`;
          try {
            await createGoogleDoc(docName, nextQuizText, folderId);
          } catch(e) {
            console.error("Failed to upload remedial quiz to drive", e);
          }
        }
      }

      await prisma.sRSItem.update({
        where: { id: itemId },
        data: updatePayload
      });

      try {
        if (prisma.reviewLog) {
          await prisma.reviewLog.create({
            data: { subjectMain: srsItem.subjectMain, subjectSub: srsItem.subjectSub, level: srsItem.currentLevel, passed: isPass, userId: srsItem.userId }
          });
        }
      } catch (logError) {}

      // 9. Send push notification & trigger NotebookLM
      const emoji = isPass ? "✅" : "🔄";
      const status = isPass ? "PASS" : "REPEAT";
      sendPushNotification({
        title: `${emoji} Shortcut Grading: ${status}`,
        body: `${subject} (${interval}) — ${isPass ? "Weiter zum nächsten Level!" : "Wiederholung nötig."}`,
        url: "/"
      });

      // Kick off Video Generation worker
      try {
        await generateVideoPromptsWorker(itemId, isPass, srsItem.subjectMain, lastVideoPrompt1, lastVideoPrompt2);
      } catch (e) {
        console.error("Worker error:", e);
      }

      // Cleanup
      try { await fs.unlink(localFilePath); } catch(e){}
      console.log(`[Shortcut Grade] Finished grading item ${itemId}`);
      
    } catch (e) {
      console.error("[Shortcut Grade] Error during background grading:", e);
      sendPushNotification({
        title: `❌ Shortcut Grading Failed`,
        body: `Fehler beim Auswerten von Item ${itemId}. Siehe Server-Logs für Details.`,
        url: "/"
      });
    }
  });

  return NextResponse.json({ success: true, message: "Grading started in the background" });
}
