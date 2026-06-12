export const maxDuration = 300;
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse, after } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { GRADE_PROMPTS } from "./prompts";
import { PROMPTS } from "../quiz/prompts";
import { downloadFromDrive, createGoogleDoc } from "@/lib/google-drive";
import { sendPushNotification } from "@/lib/push";
import { generateContentWithRetry } from "@/lib/gemini-retry";
import { generateVideoPromptsWorker } from "@/lib/notebooklm";
import fs from "fs/promises";

const modelName = "gemini-3.5-flash";

const formatPrompt = (template: string, vars: Record<string, any>) => {
  let formatted = template;
  for (const [key, val] of Object.entries(vars)) {
    formatted = formatted.replace(new RegExp(`{${key}}`, "g"), String(val));
  }
  return formatted;
};

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      error: "Missing GEMINI_API_KEY. Please set the GEMINI_API_KEY environment variable in your .env file and restart the server."
    }, { status: 400 });
  }

  const { itemId, studentAnswers, language } = await req.json();

  if (!itemId) {
    return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
  }

  if (!studentAnswers || studentAnswers.trim().length === 0) {
    return NextResponse.json({ error: "Student answers are required" }, { status: 400 });
  }

  const srsItem = await prisma.sRSItem.findUnique({
    where: { id: itemId }
  });

  if (!srsItem) {
    return NextResponse.json({ error: "SRS item not found" }, { status: 404 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const appConfig = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const wrapperMode = appConfig?.wrapperMode || "all";
  const useAiWrapper = wrapperMode === "all";

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        try {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ event, data }) + "\n"));
        } catch (e) {
          // Ignore stream errors (e.g. client disconnected) so background task continues
        }
      };

      try {
        // Re-upload source material files to Gemini File API (they expire after 48h)
        const sourceMaterialParts: any[] = [];
        if (srsItem.sourceMaterialContent) {
          try {
            const parsed = JSON.parse(srsItem.sourceMaterialContent);
            // Re-upload files from local disk
            if (parsed.driveFileId) {
              try {
                // Download from Google Drive into memory
                const buffer = await downloadFromDrive(parsed.driveFileId);
                const base64Data = buffer.toString("base64");
                
                // Pass directly to Gemini via inlineData
                sourceMaterialParts.push({
                  inlineData: {
                    data: base64Data,
                    mimeType: "application/pdf" // Assuming PDF since the user uploads PDFs
                  }
                });
                
                // Fallback: Parse text for the Wrapper
                try {
                  if (typeof global.DOMMatrix === "undefined") {
                    (global as any).DOMMatrix = class DOMMatrix {};
                  }
                  const { PDFParse } = require("pdf-parse");
                  const parser = new PDFParse(new Uint8Array(buffer));
                  await parser.load();
                  const pdfText = await parser.getText();
                  sourceMaterialParts.push({ text: `Vorlesungsmaterial (Text):\n${pdfText}` });
                } catch (e) {
                  console.error("PDF parse failed during grading:", e);
                }
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
                  } else {
                    await fs.access(fileInfo.path); 
                    const uploadResult = await ai.files.upload({
                      file: fileInfo.path,
                      config: { mimeType: fileInfo.mimeType }
                    });
                    sourceMaterialParts.push({
                      fileData: {
                        fileUri: uploadResult.uri,
                        mimeType: uploadResult.mimeType
                      }
                    });
                  }
                } catch (fileErr: unknown) {
                  const errObj = fileErr instanceof Error ? fileErr : new Error(String(fileErr));
                  console.error(`Could not use file ${fileInfo.name || fileInfo.path}:`, errObj.message);
                }
              }
            }
            // Add text content if present
            if (parsed.text && parsed.text.trim()) {
              sourceMaterialParts.push({ text: `Vorlesungsmaterial (Text):\n${parsed.text}` });
            }
          } catch {
            // Legacy: sourceMaterialContent is plain text (not JSON)
            sourceMaterialParts.push({ text: `Vorlesungsmaterial:\n${srsItem.sourceMaterialContent}` });
          }
        }

        const quizFields = [
          srsItem.quiz1DocId,
          srsItem.quiz2DocId,
          srsItem.quiz3DocId,
          srsItem.quiz4DocId,
          srsItem.quiz5DocId,
          srsItem.quiz6DocId,
          srsItem.quiz7DocId
        ];
        const quizQuestions = (srsItem.currentLevel >= 6 ? srsItem.quiz7DocId : quizFields[srsItem.currentLevel]) || srsItem.quiz1DocId || "";

        // Extract student quiz section tolerantly to count tasks and avoid matching metadata
        const safeStart = "===STUDENT_QUIZ_START===".replace(/===/g, '={3,}');
        const safeEnd = "===STUDENT_QUIZ_END===".replace(/===/g, '={3,}');
        const regex = new RegExp(`[\\s\\S]*?${safeStart}\\s*([\\s\\S]*?)\\s*${safeEnd}`, "i");
        const studentQuizMatch = quizQuestions.match(regex);
        const studentQuizText = studentQuizMatch && studentQuizMatch[1] ? studentQuizMatch[1].trim() : quizQuestions;

        // Count tasks in the student quiz section
        const taskMatches = studentQuizText.match(/Aufgabe \d+/g) || [];
        const totalTasks = taskMatches.length || 10;
        const splitPoint = Math.floor(totalTasks / 2) || 5;
        const startIdx2 = splitPoint + 1;

        const subject = `${srsItem.subjectMain} - ${srsItem.subjectSub}`;
        const intervals = ["Tag 1", "Tag 3", "Tag 7", "Tag 21", "Tag 60", "Tag 180", "Tag 365"];
        const interval = intervals[srsItem.currentLevel] || "Tag 1";

        // Step 0: Verify Submission
        sendEvent("progress", { step: 0, message: "Verifying submission (MATCH/MISMATCH check)..." });
        const languageInstruction = language ? `\n\nCRITICAL: You must generate ALL text, output, and responses strictly in ${language.toUpperCase()}. This applies to every section of the generated content.` : "";
        const mismatchCheckRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [{ text: `Studenten-Antworten:\n${studentAnswers}` }] }],
          config: {
            systemInstruction: formatPrompt(GRADE_PROMPTS.mismatch_check, {
              QUIZ_QUESTIONS: studentQuizText
            }) + languageInstruction
          }
        }, (msg) => sendEvent("progress", { step: 0, message: msg }), "Submission Check", useAiWrapper);
        
        const mismatchCheckText = (mismatchCheckRes.text || "").toUpperCase();
        if (mismatchCheckText.includes("MISMATCH")) {
          throw new Error("Falsches Quiz hochgeladen. Bitte überprüfe deine Antworten.");
        }

        // Step 1: Run grading halves in parallel
        sendEvent("progress", { step: 1, message: "Parallel Grading: Co-Prüfer 1 & 2 evaluating answers..." });

        const co1UserParts = [...sourceMaterialParts];
        if (srsItem.blueprint) co1UserParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
        co1UserParts.push({ text: `Original-Quizfragen:\n${studentQuizText}` });
        co1UserParts.push({ text: `Beantwortetes Quiz des Studenten:\n${studentAnswers}` });
        co1UserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

        const [res1, res2] = await Promise.all([
          generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: co1UserParts }],
            config: {
              systemInstruction: formatPrompt(GRADE_PROMPTS.co_pruefer_1, {
                TOTAL_TASKS: totalTasks,
                SPLIT_POINT: splitPoint,
                SUBJECT: subject,
                INTERVAL: interval
              }) + languageInstruction
            }
          }, (msg) => sendEvent("progress", { step: 1, message: msg }), "Co-Prüfer 1", useAiWrapper),
          generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: co1UserParts }],
            config: {
              systemInstruction: formatPrompt(GRADE_PROMPTS.co_pruefer_2, {
                TOTAL_TASKS: totalTasks,
                START_INDEX: startIdx2,
                SUBJECT: subject,
                INTERVAL: interval
              }) + languageInstruction
            }
          }, (msg) => sendEvent("progress", { step: 1, message: msg }), "Co-Prüfer 2", useAiWrapper)
        ]);

        const part1Feedback = res1.text || "";
        const part2Feedback = res2.text || "";

        // Step 2: Consolidate via Chief Assessor
        sendEvent("progress", { step: 2, message: "Chief Assessor: Consolidating final decision & generating brief..." });
        
        const chefUserParts = [...sourceMaterialParts];
        chefUserParts.push({ text: `Bewertung der ersten Quiz-Hälfte (von Co-Prüfer 1):\n${part1Feedback}` });
        chefUserParts.push({ text: `Bewertung der zweiten Quiz-Hälfte (von Co-Prüfer 2):\n${part2Feedback}` });
        chefUserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

        const chefRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: chefUserParts }],
          config: {
            systemInstruction: formatPrompt(GRADE_PROMPTS.chef_pruefer, {
              SUBJECT: subject,
              INTERVAL: interval
            }) + languageInstruction
          }
        }, (msg) => sendEvent("progress", { step: 2, message: msg }), "Chief Assessor", useAiWrapper);

        const chefFeedback = chefRes.text || "";

        // Extract decision
        const decisionMatch = chefFeedback.match(/===ASSESSMENT_DECISION_START===([\s\S]*?)===ASSESSMENT_DECISION_END===/);
        const decisionStr = (decisionMatch ? decisionMatch[1] : "").trim().toUpperCase();
        const isPass = decisionStr === "PASS" || decisionStr === "PASSED" || decisionStr.startsWith("PASS");

        // Step 3: Spaced repetition logic & generating follow-up material
        sendEvent("progress", { step: 3, message: `Spacing Logic: Calculating intervals & generating follow-ups...` });

        // Generate NotebookLM Prompts
        const lmInstruction = isPass ? GRADE_PROMPTS.video_pass : GRADE_PROMPTS.video_repeat;
        const lmUserParts = [...sourceMaterialParts];
        if (srsItem.blueprint) lmUserParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
        lmUserParts.push({ text: `Original Quizfragen:\n${quizQuestions}` });
        lmUserParts.push({ text: `Studenten-Antwort:\n${studentQuizText}` });
        lmUserParts.push({ text: `Output des Assessment-Grader-AIs:\n${chefFeedback}` });
        lmUserParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

        const lmPromptCall = generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: lmUserParts }],
          config: {
            systemInstruction: formatPrompt(lmInstruction, {
              SUBJECT: subject,
              INTERVAL: interval
            }) + languageInstruction
          }
        }, (msg) => sendEvent("progress", { step: 3, message: msg }), "Video Prompts", useAiWrapper);

        // Generate dynamic Quiz only on REPEAT (decision is not PASS)
        let nextQuizText = "";
        let newLedgerText = "";
        let lmRes;

        if (isPass) {
          const nextLevel = Math.min(srsItem.currentLevel + 1, 6);
          
          let nextQuizParts: any[] = [];
          let nextPrompt = "";
          let nextIntervalLabel = "";

          if (nextLevel <= 4) {
            // For standard Spaced Repetition levels, use the exact context the quiz-generator used previously
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
            // For Mastery levels (Tag 180, Tag 365), use the original Mastery context which includes Grader feedback
            nextQuizParts = [...sourceMaterialParts];
            if (srsItem.blueprint) nextQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
            if (srsItem.coverageLedger) nextQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
            nextQuizParts.push({ text: `Original Quizfragen:\n${quizQuestions}` });
            nextQuizParts.push({ text: `Studenten-Antwort:\n${studentQuizText}` });
            nextQuizParts.push({ text: `Output des Assessment-Grader-AIs:\n${chefFeedback}` });
            nextQuizParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });
            
            nextPrompt = GRADE_PROMPTS.next_quiz_pass;
            nextIntervalLabel = nextLevel === 5 ? "Tag 180" : "Tag 365";
          }

          const nextQuizCall = generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: nextQuizParts }],
            config: {
              systemInstruction: formatPrompt(nextPrompt, {
                SUBJECT: subject,
                NEXT_INTERVAL: nextIntervalLabel,
                NEXT_INTERVAL_LABEL: nextIntervalLabel
              }) + languageInstruction
            }
          }, (msg) => sendEvent("progress", { step: 3, message: msg }), `Next Quiz (${nextIntervalLabel})`, useAiWrapper);

          const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
          lmRes = lmResult;
          nextQuizText = nextQuizRes.text || "";
          
          // Extract new ledger if generated (usually for levels 1-4 using PROMPTS)
          const safeStart = "===COVERAGE_LEDGER_START===".replace(/===/g, '={3,}');
          const safeEnd = "===COVERAGE_LEDGER_END===".replace(/===/g, '={3,}');
          const ledgerRegex = new RegExp(`[\\s\\S]*?${safeStart}\\s*([\\s\\S]*?)\\s*${safeEnd}`, "i");
          const ledgerMatch = nextQuizText.match(ledgerRegex);
          if (ledgerMatch && ledgerMatch[1]) {
            newLedgerText = ledgerMatch[1].trim();
          }
        } else {
          // On REPEAT, we generate both NotebookLM prompts and the custom remedial quiz
          
          const remedialQuizParts = [...sourceMaterialParts];
          if (srsItem.blueprint) remedialQuizParts.push({ text: `Didaktischer Blueprint:\n${srsItem.blueprint}` });
          if (srsItem.coverageLedger) remedialQuizParts.push({ text: `Bisheriges Coverage Ledger:\n${srsItem.coverageLedger}` });
          remedialQuizParts.push({ text: `Original Quizfragen:\n${quizQuestions}` });
          remedialQuizParts.push({ text: `Studenten-Antwort:\n${studentQuizText}` });
          remedialQuizParts.push({ text: `Fehleranalyse des Graders:\n${chefFeedback}` });
          remedialQuizParts.push({ text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." });

          const nextQuizCall = generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: remedialQuizParts }],
            config: {
              systemInstruction: formatPrompt(GRADE_PROMPTS.retry_quiz_fail, {
                SUBJECT: subject,
                INTERVAL: interval
              }) + languageInstruction
            }
          }, (msg) => sendEvent("progress", { step: 3, message: msg }), "Next Quiz (REPEAT)", useAiWrapper);

          const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
          lmRes = lmResult;
          nextQuizText = nextQuizRes.text || "";
        }

        const videoPromptsText = lmRes.text || "";

        // Parse NotebookLM Prompts
        const v1Match = videoPromptsText.match(/===VIDEO_1_START===([\s\S]*?)===VIDEO_1_END===/);
        const v2Match = videoPromptsText.match(/===VIDEO_2_START===([\s\S]*?)===VIDEO_2_END===/);
        const lastVideoPrompt1 = v1Match ? v1Match[1].trim() : videoPromptsText;
        const lastVideoPrompt2 = v2Match ? v2Match[1].trim() : "";

        // Calculate Next Review Date
        const now = new Date();
        let intervalDays = 1;
        if (isPass) {
          switch (srsItem.currentLevel) {
            case 0: intervalDays = 3; break;
            case 1: intervalDays = 7; break;
            case 2: intervalDays = 21; break;
            case 3: intervalDays = 60; break;
            case 4: intervalDays = 180; break;
            default: intervalDays = 365; break; // Level 5 and beyond
          }
        } else {
          switch (srsItem.currentLevel) {
            case 0: intervalDays = 1; break;
            case 1: intervalDays = 3; break;
            default: intervalDays = 7; break; // Level 2 and beyond
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

        // Prep database update payload
        const updatePayload: any = {
          nextReviewDate,
          lastFeedback: cleanFeedback,
          lastVideoPrompt1,
          lastVideoPrompt2,
        };

        if (isPass) {
          const nextLevel = srsItem.currentLevel + 1; // Uncapped mastery stages!
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
            
            // Upload the newly generated quiz to Google Drive
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
                            srsItem.currentLevel === 5 ? "quiz6DocId" : "quiz7DocId"; // Level 6+ rolls over in quiz7DocId
          
          if (nextQuizText) {
            // Save the raw text to the database so the frontend can render it!
            updatePayload[quizField] = nextQuizText;
            
            // Upload the remedial quiz to Google Drive for the user's records
            let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
            if (srsItem.sourceMaterialContent) {
              try {
                const parsedSrc = JSON.parse(srsItem.sourceMaterialContent);
                if (parsedSrc.driveFolderId) folderId = parsedSrc.driveFolderId;
              } catch(e) {}
            }
            const docName = `Wiederholungs-Quiz (Level ${srsItem.currentLevel})`;
            try {
              // We intentionally don't save newDocId to the DB to prevent frontend crashes
              await createGoogleDoc(docName, nextQuizText, folderId);
            } catch(e) {
              console.error("Failed to upload remedial quiz to drive", e);
            }
          }
        }

        // Step 4: Save DB & Complete
        sendEvent("progress", { step: 4, message: "Saving records to database..." });
        const updatedItem = await prisma.sRSItem.update({
          where: { id: itemId },
          data: updatePayload
        });

        // Log the completed review for the "Done" calendar (fail gracefully if Prisma client is stale)
        try {
          if (prisma.reviewLog) {
            await prisma.reviewLog.create({
              data: {
                subjectMain: srsItem.subjectMain,
                subjectSub: srsItem.subjectSub,
                level: srsItem.currentLevel,
                passed: isPass,
                userId: srsItem.userId
              }
            });
          } else {
            console.warn("Prisma ReviewLog model not found on client. Skipping review log creation.");
          }
        } catch (logError) {
          console.error("Failed to create review log:", logError);
        }

        sendEvent("done", { success: true, srsItem: updatedItem, isPass });

        // Send push notification
        const emoji = isPass ? "✅" : "🔄";
        const status = isPass ? "PASS" : "REPEAT";
        sendPushNotification({
          title: `${emoji} Bewertung fertig: ${status}`,
          body: `${subject} (${interval}) — ${isPass ? "Weiter zum nächsten Level!" : "Wiederholung nötig."}`,
          tag: `grade-done-${itemId}`,
          url: "/",
        }).catch((e) => console.error("Push notification failed:", e));

        // Trigger background worker to automatically process NotebookLM for video prompts
        after(async () => {
          try {
            await generateVideoPromptsWorker(
              itemId,
              isPass,
              subject,
              lastVideoPrompt1,
              lastVideoPrompt2
            );
          } catch (e) {
            console.error("Failed to start video worker:", e);
          }
        });

        try { controller.close(); } catch (e) {}
      } catch (error: any) {
        console.error("Grading execution error:", error);
        sendEvent("error", { message: error.message });
        try { controller.close(); } catch (e) {}
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    }
  });
}
