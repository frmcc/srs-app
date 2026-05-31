import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { GRADE_PROMPTS } from "./prompts";
import { sendPushNotification } from "@/lib/push";
import { generateContentWithRetry } from "@/lib/gemini-retry";
import fs from "fs/promises";

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
    return NextResponse.json({
      error: "Missing GEMINI_API_KEY. Please set the GEMINI_API_KEY environment variable in your .env file and restart the server."
    }, { status: 400 });
  }

  const { itemId, studentAnswers } = await req.json();

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

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ event, data }) + "\n"));
      };

      try {
        // Re-upload source material files to Gemini File API (they expire after 48h)
        const sourceMaterialParts: any[] = [];
        if (srsItem.sourceMaterialContent) {
          try {
            const parsed = JSON.parse(srsItem.sourceMaterialContent);
            // Re-upload files from local disk
            if (parsed.files && Array.isArray(parsed.files)) {
              for (const fileInfo of parsed.files) {
                try {
                  await fs.access(fileInfo.path); // Check file exists
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
                } catch (fileErr: any) {
                  console.error(`Could not re-upload file ${fileInfo.path}:`, fileErr.message);
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
          srsItem.quiz5DocId
        ];
        const quizQuestions = quizFields[srsItem.currentLevel] || srsItem.quiz1DocId || "";

        // Extract student quiz section to count tasks and avoid matching metadata
        const studentQuizMatch = quizQuestions.match(/===STUDENT_QUIZ_START===([\s\S]*?)===STUDENT_QUIZ_END===/);
        const studentQuizText = studentQuizMatch ? studentQuizMatch[1] : quizQuestions;

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
        const mismatchCheckRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [{ text: `Studenten-Antworten:\n${studentAnswers}` }] }],
          config: {
            systemInstruction: formatPrompt(GRADE_PROMPTS.mismatch_check, {
              QUIZ_QUESTIONS: studentQuizText
            })
          }
        }, (msg) => sendEvent("progress", { step: 0, message: msg }), "Submission Check");
        
        const mismatchCheckText = (mismatchCheckRes.text || "").toUpperCase();
        if (mismatchCheckText.includes("MISMATCH")) {
          throw new Error("Falsches Quiz hochgeladen. Bitte überprüfe deine Antworten.");
        }

        // Step 1: Run grading halves in parallel
        sendEvent("progress", { step: 1, message: "Parallel Grading: Co-Prüfer 1 & 2 evaluating answers..." });

        const [res1, res2] = await Promise.all([
          generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: [...sourceMaterialParts, { text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." }] }],
            config: {
              systemInstruction: formatPrompt(GRADE_PROMPTS.co_pruefer_1, {
                TOTAL_TASKS: totalTasks,
                SPLIT_POINT: splitPoint,
                SUBJECT: subject,
                INTERVAL: interval,
                QUIZ_QUESTIONS: studentQuizText,
                STUDENT_ANSWERS: studentAnswers
              })
            }
          }, (msg) => sendEvent("progress", { step: 1, message: msg }), "Co-Prüfer 1"),
          generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: [...sourceMaterialParts, { text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." }] }],
            config: {
              systemInstruction: formatPrompt(GRADE_PROMPTS.co_pruefer_2, {
                TOTAL_TASKS: totalTasks,
                START_INDEX: startIdx2,
                SUBJECT: subject,
                INTERVAL: interval,
                QUIZ_QUESTIONS: studentQuizText,
                STUDENT_ANSWERS: studentAnswers
              })
            }
          }, (msg) => sendEvent("progress", { step: 1, message: msg }), "Co-Prüfer 2")
        ]);

        const part1Feedback = res1.text || "";
        const part2Feedback = res2.text || "";

        // Step 2: Consolidate via Chief Assessor
        sendEvent("progress", { step: 2, message: "Chief Assessor: Consolidating final decision & generating brief..." });
        const chefRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [...sourceMaterialParts, { text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." }] }],
          config: {
            systemInstruction: formatPrompt(GRADE_PROMPTS.chef_pruefer, {
              SUBJECT: subject,
              INTERVAL: interval,
              PART_1_ASSESSMENT: part1Feedback,
              PART_2_ASSESSMENT: part2Feedback
            })
          }
        }, (msg) => sendEvent("progress", { step: 2, message: msg }), "Chief Assessor");

        const chefFeedback = chefRes.text || "";

        // Extract decision
        const decisionMatch = chefFeedback.match(/===ASSESSMENT_DECISION_START===([\s\S]*?)===ASSESSMENT_DECISION_END===/);
        const decisionStr = (decisionMatch ? decisionMatch[1] : "").trim().toUpperCase();
        const isPass = decisionStr === "PASS" || decisionStr === "PASSED" || decisionStr.startsWith("PASS");

        // Step 3: Spaced repetition logic & generating follow-up material
        sendEvent("progress", { step: 3, message: `Spacing Logic: Calculating intervals & generating follow-ups...` });

        // Generate NotebookLM Prompts
        const lmInstruction = isPass ? GRADE_PROMPTS.video_pass : GRADE_PROMPTS.video_repeat;
        const lmPromptCall = generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [...sourceMaterialParts, { text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." }] }],
          config: {
            systemInstruction: formatPrompt(lmInstruction, {
              SUBJECT: subject,
              INTERVAL: interval,
              QUIZ_QUESTIONS: studentQuizText,
              GRADER_OUTPUT: chefFeedback
            })
          }
        }, (msg) => sendEvent("progress", { step: 3, message: msg }), "Video Prompts");

        // Generate dynamic Quiz only on REPEAT (decision is not PASS)
        let nextQuizText = "";
        let lmRes;

        if (isPass) {
          // On PASS, we generate both NotebookLM prompts and the tailored next quiz
          const isMastery = srsItem.currentLevel >= 4; // Level 4 corresponds to Tag 60
          const passQuizInstruction = isMastery ? GRADE_PROMPTS.mastery_quiz : GRADE_PROMPTS.next_quiz_pass;
          const nextIntervalStr = intervals[Math.min(srsItem.currentLevel + 1, 6)];
          
          const nextQuizCall = generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: [...sourceMaterialParts, { text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." }] }],
            config: {
              systemInstruction: formatPrompt(passQuizInstruction, {
                SUBJECT: subject,
                NEXT_INTERVAL: nextIntervalStr,
                NEXT_INTERVAL_LABEL: nextIntervalStr,
                QUIZ_QUESTIONS: studentQuizText,
                GRADER_OUTPUT: chefFeedback
              })
            }
          }, (msg) => sendEvent("progress", { step: 3, message: msg }), "Next Quiz (PASS)");

          const [lmResult, nextQuizRes] = await Promise.all([lmPromptCall, nextQuizCall]);
          lmRes = lmResult;
          nextQuizText = nextQuizRes.text || "";
        } else {
          // On REPEAT, we generate both NotebookLM prompts and the custom remedial quiz
          const nextQuizCall = generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: [...sourceMaterialParts, { text: "Hier sind die Dateien. Bitte führe deine System-Instruktionen aus." }] }],
            config: {
              systemInstruction: formatPrompt(GRADE_PROMPTS.retry_quiz_fail, {
                SUBJECT: subject,
                INTERVAL: interval,
                QUIZ_QUESTIONS: studentQuizText,
                GRADER_OUTPUT: chefFeedback
              })
            }
          }, (msg) => sendEvent("progress", { step: 3, message: msg }), "Next Quiz (REPEAT)");

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
            case 5: intervalDays = 365; break;
            case 6: intervalDays = 365; break;
          }
        } else {
          switch (srsItem.currentLevel) {
            case 0: intervalDays = 1; break;
            case 1: intervalDays = 3; break;
            case 2: intervalDays = 7; break;
            case 3: intervalDays = 7; break;
            case 4: intervalDays = 7; break;
            case 5: intervalDays = 7; break;
            case 6: intervalDays = 7; break;
          }
        }

        const nextReviewDate = new Date();
        nextReviewDate.setDate(now.getDate() + intervalDays);

        // Prep database update payload
        const updatePayload: any = {
          nextReviewDate,
          lastFeedback: chefFeedback,
          lastVideoPrompt1,
          lastVideoPrompt2,
        };

        if (isPass) {
          const nextLevel = Math.min(srsItem.currentLevel + 1, 6);
          updatePayload.currentLevel = nextLevel;
          // Note: On PASS, we overwrite the next level's quiz with the dynamically generated targeted quiz.
          const nextQuizField = nextLevel === 0 ? "quiz1DocId" :
                                nextLevel === 1 ? "quiz2DocId" :
                                nextLevel === 2 ? "quiz3DocId" :
                                nextLevel === 3 ? "quiz4DocId" : "quiz5DocId";
          updatePayload[nextQuizField] = nextQuizText;
        } else {
          const quizField = srsItem.currentLevel === 0 ? "quiz1DocId" :
                            srsItem.currentLevel === 1 ? "quiz2DocId" :
                            srsItem.currentLevel === 2 ? "quiz3DocId" :
                            srsItem.currentLevel === 3 ? "quiz4DocId" : "quiz5DocId";
          updatePayload[quizField] = nextQuizText;
        }

        // Step 4: Save DB & Complete
        sendEvent("progress", { step: 4, message: "Saving records to database..." });
        const updatedItem = await prisma.sRSItem.update({
          where: { id: itemId },
          data: updatePayload
        });

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

        controller.close();
      } catch (error: any) {
        console.error("Grading execution error:", error);
        sendEvent("error", { message: error.message });
        controller.close();
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
