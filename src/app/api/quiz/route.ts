export const maxDuration = 300;
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse, after } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { PROMPTS, podcast_prompts } from "./prompts";
import { sendPushNotification } from "@/lib/push";
import { generatePodcastWorker, createNotebook } from "@/lib/notebooklm";
import { generateContentWithRetry } from "@/lib/gemini-retry";
import { createDriveFolder, getOrCreateDriveFolder, uploadToDrive, createGoogleDoc } from "@/lib/google-drive";
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
    const language = (formData.get("language") as string) || "german";
    
    // Process uploaded files
    const files = formData.getAll("files") as File[];
    
    if (!subjectMain || (!textContent && files.length === 0)) {
      return NextResponse.json({ error: "Missing subject or content." }, { status: 400 });
    }

    const uploadedFilesData: { path: string, mimeType: string }[] = [];
    const dbFilesData: { name: string, mimeType: string, base64: string }[] = [];
    const geminiFileParts: { fileData: { fileUri: string, mimeType: string } }[] = [];
    
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
          fileData: { fileUri: uploadResult.uri as string, mimeType: uploadResult.mimeType as string }
        });
      } catch (err: unknown) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        console.error(`Error uploading file ${file.name} to Gemini:`, errObj);
      }
    }

    // Build the master parts array for the prompt
    const masterContextParts: Array<{ text: string } | { fileData: { fileUri: string, mimeType: string } }> = [...geminiFileParts];
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
      const sendEvent = (event: string, data: Record<string, unknown> | unknown) => {
        try {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ event, data }) + "\n"));
        } catch (e) {
          // Ignore stream errors (e.g. client disconnected) so background task continues
        }
      };

      try {
        const languageInstruction = `\n\nCRITICAL: You must generate ALL text, output, and responses strictly in ${language.toUpperCase()}. This applies to every section of the generated content.`;
        sendEvent("progress", { step: 1, message: "Analyzing material & Generating Blueprint..." });
        const blueprintRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
          config: { systemInstruction: PROMPTS.blueprint + `\n\nModul/Vorlesungsthema:\n${subjectMain} - ${subjectSub}` + languageInstruction }
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
            config: { systemInstruction: quizPrompts[i] + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}\n\nVorheriger Quiz-Agent-Output:\n${lastQuiz}\n\nBisheriges Coverage Ledger:\n${lastLedger}` + languageInstruction }
          }, (msg) => sendEvent("progress", { step: 2 + i, message: msg }), `Quiz ${i + 1}`);
          const text = res.text;
          quizResults.push(text);
          lastQuiz = extractSection(text, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===");
          lastLedger = extractSection(text, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");
        }

        sendEvent("progress", { step: 7, message: "Generating Tutor Prompt System..." });
        const tutorRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [...masterContextParts, { text: "Bitte generiere den Tutor-Prompt basierend auf dem bereitgestellten Blueprint." }] }],
          config: { systemInstruction: PROMPTS.tutor_prompt + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` + languageInstruction }
        }, (msg) => sendEvent("progress", { step: 7, message: msg }), "Tutor Prompt");
        const tutorPrompt = tutorRes.text;

        sendEvent("progress", { step: 8, message: "Generating Podcast Prompts..." });
        const podcastRes = await generateContentWithRetry(ai, modelName, {
          contents: [{ role: "user", parts: [...masterContextParts, { text: "Bitte generiere die zwei Regieanweisungen basierend auf dem bereitgestellten Blueprint." }] }],
          config: { systemInstruction: podcast_prompts + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` + languageInstruction }
        }, (msg) => sendEvent("progress", { step: 8, message: msg }), "Podcast Prompts");
        const podcastOutput = podcastRes.text;
        const prePodcastPrompt = extractSection(podcastOutput, "===PRE_PODCAST_START===", "===PRE_PODCAST_END===");
        const postPodcastPrompt = extractSection(podcastOutput, "===POST_PODCAST_START===", "===POST_PODCAST_END===");

        sendEvent("progress", { step: 9, message: "Creating NotebookLM Podcasts..." });

        let preNotebookId = "";
        let postNotebookId = "";
        try {
          const preTitle = `Pre - ${subjectMain}`.substring(0, 50);
          const postTitle = `Post - ${subjectMain}`.substring(0, 50);
          const [preId, postId] = await Promise.all([
            createNotebook(preTitle),
            createNotebook(postTitle)
          ]);
          if (preId) preNotebookId = preId;
          if (postId) postNotebookId = postId;
        } catch (e) {
          console.error("NotebookLM creation failed:", e);
        }

        sendEvent("progress", { step: 10, message: "Uploading to Google Drive..." });

        const appConfig = await prisma.appConfig.findUnique({ where: { id: 1 } });
        const currentSemester = appConfig?.currentSemester || 1;

        let folderId = "";
        let mainPdfId = "";
        try {
          // Build the hierarchy: Root -> Semester X -> Module -> Topic
          const semesterFolderName = `Semester ${currentSemester}`;
          const semesterFolderId = await getOrCreateDriveFolder(semesterFolderName);
          
          const moduleFolderId = await getOrCreateDriveFolder(subjectMain, semesterFolderId);
          
          folderId = await getOrCreateDriveFolder(subjectSub, moduleFolderId);
          
          if (dbFilesData.length > 0) {
            const firstFile = dbFilesData[0];
            mainPdfId = await uploadToDrive(
              firstFile.name || "Vorlesungsmaterial.pdf",
              firstFile.mimeType,
              firstFile.base64 ? Buffer.from(firstFile.base64, "base64") : Buffer.from(""),
              folderId
            );
          } else if (textContent) {
            mainPdfId = await createGoogleDoc("Vorlesungsmaterial", textContent, folderId);
          }

          await Promise.allSettled([
            createGoogleDoc("Quiz 1 (Tag 1)", quizResults[0] || "", folderId),
            createGoogleDoc("Quiz 2 (Tag 3)", quizResults[1] || "", folderId),
            createGoogleDoc("Quiz 3 (Tag 7)", quizResults[2] || "", folderId),
            createGoogleDoc("Quiz 4 (Tag 21)", quizResults[3] || "", folderId),
            createGoogleDoc("Quiz 5 (Tag 60)", quizResults[4] || "", folderId),
            createGoogleDoc("Tutor Prompt", tutorPrompt || "", folderId)
          ]);
        } catch (e) {
          console.error("Google Drive upload failed:", e);
        }

        sendEvent("progress", { step: 11, message: "Saving records to database..." });

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
            prePodcastUrl: preNotebookId ? `https://notebooklm.google.com/notebook/${preNotebookId}` : null,
            postPodcastUrl: postNotebookId ? `https://notebooklm.google.com/notebook/${postNotebookId}` : null,
            sourceMaterialContent: JSON.stringify({ driveFileId: mainPdfId, driveFolderId: folderId }),
            blueprint: blueprint,
            coverageLedger: lastLedger
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

        // Automatically trigger podcast generation in the background with in-memory files
        after(async () => {
          try {
            const uploadTasks = [];
            if (preNotebookId) {
              uploadTasks.push(generatePodcastWorker(createdItem.id, "pre", preNotebookId, textContent, dbFilesData));
            }
            if (postNotebookId) {
              uploadTasks.push(generatePodcastWorker(createdItem.id, "post", postNotebookId, textContent, dbFilesData));
            }
            await Promise.allSettled(uploadTasks);
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

        try { controller.close(); } catch (e) {}
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("Quiz generation error:", error);
        sendEvent("error", { message: error.message });
        try { controller.close(); } catch (e) {}
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
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("Form parsing error:", error);
    return NextResponse.json({ error: "Failed to parse form data." }, { status: 500 });
  }
}
