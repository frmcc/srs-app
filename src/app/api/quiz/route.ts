export const maxDuration = 300;
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse, after } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { PROMPTS, podcast_prompts } from "./prompts";
import { sendPushNotification } from "@/lib/push";
import { generatePodcastWorker } from "@/lib/notebooklm";
import { generateContentWithRetry } from "@/lib/gemini-retry";
import fs from "fs/promises";
import path from "path";

const modelName = "gemini-3.1-flash-lite";

const extractSection = (text: string | undefined, startMarker: string, endMarker: string) => {
  if (!text) return "";
  const regex = new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`);
  const match = text.match(regex);
  return match ? match[1].trim() : text.trim();
};

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ 
      error: "Missing API Key", 
      details: "Set GEMINI_API_KEY in your .env file." 
    }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const encoder = new TextEncoder();
  
  try {
    const formData = await req.formData();
    const subjectMain = formData.get("subjectMain") as string;
    const subjectSub = (formData.get("subjectSub") as string) || "Module";
    const textContent = (formData.get("content") as string) || "";
    
    // Process uploaded files
    const files = formData.getAll("files") as File[];
    
    if (!subjectMain || (!textContent && files.length === 0)) {
      return NextResponse.json({ error: "Missing subject or content." }, { status: 400 });
    }

    const uploadedFilesData: { path: string, mimeType: string }[] = [];
    const dbFilesData: { name: string, mimeType: string, base64: string }[] = [];
    const geminiFileParts: any[] = [];
    
    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Generate a unique filename and save locally
      const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const localFilePath = path.join(uploadsDir, uniqueFileName);
      await fs.writeFile(localFilePath, buffer);
      
      uploadedFilesData.push({ path: localFilePath, mimeType: file.type || "application/octet-stream" });
      dbFilesData.push({ 
        name: file.name, 
        mimeType: file.type || "application/octet-stream", 
        base64: buffer.toString("base64") 
      });

      try {
        // Upload to Gemini File API
        const uploadResult = await ai.files.upload({
          file: localFilePath,
          config: { mimeType: file.type || "application/octet-stream" }
        });
        
        geminiFileParts.push({
          fileData: {
            fileUri: uploadResult.uri,
            mimeType: uploadResult.mimeType
          }
        });
      } catch (err: unknown) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        console.error(`Error uploading file ${file.name} to Gemini:`, errObj);
      }
    }

    // Build the master parts array for the prompt
    const masterContextParts = [...geminiFileParts];
    if (textContent.trim()) {
      masterContextParts.push({ text: `\n\nZusätzliches Textmaterial:\n${textContent}` });
    }
    
    // Serialize sourceMaterialContent to store in DB
    const sourceMaterialContentPayload = JSON.stringify({
      text: textContent,
      files: dbFilesData
    });

    let generationSuccess = false;

    const stream = new ReadableStream({
      async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ event, data }) + "\n"));
      };

      try {
        sendEvent("progress", { step: 1, message: "Analyzing material & Generating Blueprint..." });
        const blueprintRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
          config: { systemInstruction: PROMPTS.blueprint + `\n\nModul/Vorlesungsthema:\n${subjectMain} - ${subjectSub}` }
        }, (msg) => sendEvent("progress", { step: 1, message: msg }), "Blueprint");
        const blueprint = blueprintRes.text;

        const quizPrompts = [PROMPTS.quiz_tag_1, PROMPTS.quiz_tag_3, PROMPTS.quiz_tag_7, PROMPTS.quiz_tag_21, PROMPTS.quiz_tag_60];
        const quizResults = [];
        let lastQuiz = "";
        let lastLedger = "";

        for (let i = 0; i < quizPrompts.length; i++) {
          sendEvent("progress", { step: 2 + i, message: `Generating Quiz ${i + 1}...` });
          const res = await generateContentWithRetry(ai, modelName, {
            contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
            config: { systemInstruction: quizPrompts[i] + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}\n\nVorheriger Quiz-Agent-Output:\n${lastQuiz}\n\nBisheriges Coverage Ledger:\n${lastLedger}` }
          }, (msg) => sendEvent("progress", { step: 2 + i, message: msg }), `Quiz ${i + 1}`);
          const text = res.text;
          quizResults.push(text);
          lastQuiz = extractSection(text, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===");
          lastLedger = extractSection(text, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");
        }

        sendEvent("progress", { step: 7, message: "Generating Tutor Prompt System..." });
        const tutorRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [...masterContextParts, { text: "Bitte generiere den Tutor-Prompt basierend auf dem bereitgestellten Blueprint." }] }],
          config: { systemInstruction: PROMPTS.tutor_prompt + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` }
        }, (msg) => sendEvent("progress", { step: 7, message: msg }), "Tutor Prompt");
        const tutorPrompt = tutorRes.text;

        sendEvent("progress", { step: 8, message: "Generating Podcast Prompts..." });
        const podcastRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [...masterContextParts, { text: "Bitte generiere die zwei Regieanweisungen basierend auf dem bereitgestellten Blueprint." }] }],
          config: { systemInstruction: podcast_prompts + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` }
        }, (msg) => sendEvent("progress", { step: 8, message: msg }), "Podcast Prompts");
        const podcastOutput = podcastRes.text;
        const prePodcastPrompt = extractSection(podcastOutput, "===PRE_PODCAST_START===", "===PRE_PODCAST_END===");
        const postPodcastPrompt = extractSection(podcastOutput, "===POST_PODCAST_START===", "===POST_PODCAST_END===");

        sendEvent("progress", { step: 9, message: "Saving records to database..." });

        const appConfig = await prisma.appConfig.findUnique({ where: { id: 1 } });
        const currentSemester = appConfig?.currentSemester || 1;

        const createdItem = await prisma.sRSItem.create({
          data: {
            subjectMain: subjectMain,
            subjectSub: subjectSub,
            semester: currentSemester,
            currentLevel: 0,
            nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tag 1
            quiz1DocId: quizResults[0],
            quiz2DocId: quizResults[1],
            quiz3DocId: quizResults[2],
            quiz4DocId: quizResults[3],
            quiz5DocId: quizResults[4],
            tutorPromptContent: tutorPrompt,
            tutorPromptDocId: "pending", // Will be set to item ID after creation
            prePodcastPrompt: prePodcastPrompt || null,
            postPodcastPrompt: postPodcastPrompt || null,
            sourceMaterialContent: sourceMaterialContentPayload
          }
        });

        // Set tutorPromptDocId to the item's own ID (used for /tutor/[id] URL)
        await prisma.sRSItem.update({
          where: { id: createdItem.id },
          data: { tutorPromptDocId: createdItem.id }
        });

        sendEvent("done", { success: true, srsItem: createdItem });
        generationSuccess = true;

        // Send push notification
        sendPushNotification({
          title: "✅ Quiz fertig generiert!",
          body: `${subjectMain} - ${subjectSub}: 5 Quizze + Tutor-Prompt erstellt.`,
          tag: `quiz-done-${createdItem.id}`,
          url: "/",
        }).catch((e) => console.error("Push notification failed:", e));

        // Automatically trigger podcast generation in the background
        after(async () => {
          try {
            await Promise.allSettled([
              generatePodcastWorker(createdItem.id, "pre"),
              generatePodcastWorker(createdItem.id, "post")
            ]);
          } catch (e) {
            console.error("Error in background podcast worker:", e);
          } finally {
            // Delete temp files after background workers are completely finished
            for (const fileInfo of uploadedFilesData) {
              try {
                await fs.unlink(fileInfo.path);
              } catch (e) {
                console.error("Failed to delete temp file:", fileInfo.path, e);
              }
            }
          }
        });

        controller.close();
      } catch (error: any) {
        console.error("Quiz generation error:", error);
        sendEvent("error", { message: error.message });
        controller.close();
      } finally {
        if (!generationSuccess) {
          for (const fileInfo of uploadedFilesData) {
            try {
              await fs.unlink(fileInfo.path);
            } catch (e) {
              console.error("Failed to delete temp file:", fileInfo.path, e);
            }
          }
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    }
  });
  } catch (err: any) {
    console.error("Form parsing error:", err);
    return NextResponse.json({ error: "Failed to parse form data." }, { status: 500 });
  }
}
