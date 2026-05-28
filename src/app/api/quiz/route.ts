import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { PROMPTS } from "./prompts";
import { sendPushNotification } from "@/lib/push";
import fs from "fs/promises";
import path from "path";

const modelName = "gemini-3.0-flash";

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
    const uploadedFilesData: { path: string, mimeType: string }[] = [];
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
      } catch (err: any) {
        console.error(`Error uploading file ${file.name} to Gemini:`, err);
      }
    }

    if (!subjectMain || (!textContent && files.length === 0)) {
      return NextResponse.json({ error: "Missing subject or content." }, { status: 400 });
    }

    // Build the master parts array for the prompt
    const masterContextParts = [...geminiFileParts];
    if (textContent.trim()) {
      masterContextParts.push({ text: `\n\nZusätzliches Textmaterial:\n${textContent}` });
    }
    
    // Serialize sourceMaterialContent to store in DB
    const sourceMaterialContentPayload = JSON.stringify({
      text: textContent,
      files: uploadedFilesData
    });

    const stream = new ReadableStream({
      async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ event, data }) + "\n"));
      };

      try {
        sendEvent("progress", { step: 1, message: "Analyzing material & Generating Blueprint..." });
        const blueprintRes = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
          config: { systemInstruction: PROMPTS.blueprint + `\n\nModul/Vorlesungsthema:\n${subjectMain} - ${subjectSub}` }
        });
        const blueprint = blueprintRes.text;

        const quizPrompts = [PROMPTS.quiz_tag_1, PROMPTS.quiz_tag_3, PROMPTS.quiz_tag_7, PROMPTS.quiz_tag_21, PROMPTS.quiz_tag_60];
        const quizResults = [];
        let lastQuiz = "";
        let lastLedger = "";

        for (let i = 0; i < quizPrompts.length; i++) {
          sendEvent("progress", { step: 2 + i, message: `Generating Quiz ${i + 1}...` });
          const res = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
            config: { systemInstruction: quizPrompts[i] + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}\n\nVorheriger Quiz-Agent-Output:\n${lastQuiz}\n\nBisheriges Coverage Ledger:\n${lastLedger}` }
          });
          const text = res.text;
          quizResults.push(text);
          lastQuiz = extractSection(text, "===STUDENT_QUIZ_START===", "===STUDENT_QUIZ_END===");
          lastLedger = extractSection(text, "===COVERAGE_LEDGER_START===", "===COVERAGE_LEDGER_END===");
        }

        sendEvent("progress", { step: 7, message: "Generating Tutor Prompt System..." });
        const tutorRes = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [...masterContextParts, { text: "Hier sind die Materialien. Bitte führe deine System-Instruktionen aus." }] }],
          config: { systemInstruction: PROMPTS.tutor_prompt + `\n\nModul/Vorlesungsthema:\n${subjectMain}\n\nBlueprint:\n${blueprint}` }
        });
        const tutorPrompt = tutorRes.text;

        sendEvent("progress", { step: 8, message: "Saving records to database..." });

        const createdItem = await prisma.sRSItem.create({
          data: {
            subjectMain: subjectMain,
            subjectSub: subjectSub,
            currentLevel: 0,
            nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tag 1
            quiz1DocId: quizResults[0],
            quiz2DocId: quizResults[1],
            quiz3DocId: quizResults[2],
            quiz4DocId: quizResults[3],
            quiz5DocId: quizResults[4],
            tutorPromptDocId: tutorPrompt,
            sourceMaterialContent: sourceMaterialContentPayload
          }
        });

        sendEvent("done", { success: true, srsItem: createdItem });

        // Send push notification
        sendPushNotification({
          title: "✅ Quiz fertig generiert!",
          body: `${subjectMain} - ${subjectSub}: 5 Quizze + Tutor-Prompt erstellt.`,
          tag: `quiz-done-${createdItem.id}`,
          url: "/",
        }).catch((e) => console.error("Push notification failed:", e));

        controller.close();
      } catch (error: any) {
        console.error("Quiz generation error:", error);
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
  } catch (err: any) {
    console.error("Form parsing error:", err);
    return NextResponse.json({ error: "Failed to parse form data." }, { status: 500 });
  }
}
