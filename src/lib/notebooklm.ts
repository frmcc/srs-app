import { prisma } from "./db";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { sendPushNotification } from "./push";
import { downloadFromDrive } from "./google-drive";

const getApiUrl = () => {
  const url = process.env.NOTEBOOKLM_API_URL;
  if (!url) throw new Error("NOTEBOOKLM_API_URL not set in .env");
  return url.replace(/\/$/, ""); // Remove trailing slash
};

export async function createNotebook(title: string): Promise<string> {
  const res = await fetch(`${getApiUrl()}/v1/notebooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
  if (!res.ok) throw new Error(`Failed to create notebook: ${await res.text()}`);
  const data = await res.json();
  return data.notebook.id;
}

export async function uploadText(notebookId: string, title: string, content: string) {
  const res = await fetch(`${getApiUrl()}/v1/notebooks/${notebookId}/sources/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content })
  });
  if (!res.ok) throw new Error(`Failed to upload text: ${await res.text()}`);
  return await res.json();
}

export async function uploadFile(notebookId: string, filePath: string, base64Data?: string, originalName?: string) {
  const formData = new FormData();
  
  let fileBuffer: Buffer;
  const fileName = originalName || path.basename(filePath);
  
  if (base64Data) {
    fileBuffer = Buffer.from(base64Data, "base64");
  } else {
    // Read file as Blob for fetch API
    fileBuffer = await fs.readFile(filePath);
  }
  
  const blob = new Blob([new Uint8Array(fileBuffer)]);
  formData.append("upload", blob, fileName);

  const res = await fetch(`${getApiUrl()}/v1/notebooks/${notebookId}/sources/file`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error(`Failed to upload file: ${await res.text()}`);
  return await res.json();
}

export async function askChat(notebookId: string, question: string) {
  const res = await fetch(`${getApiUrl()}/v1/notebooks/${notebookId}/chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });
  if (!res.ok) throw new Error(`Failed to ask chat: ${await res.text()}`);
  return await res.json();
}

export async function generateArtifact(notebookId: string, type: "audio" | "video", instructions?: string) {
  const res = await fetch(`${getApiUrl()}/v1/notebooks/${notebookId}/artifacts/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      options: {
        instructions: instructions || "CRITICAL: Sprich Deutsch! Formuliere den Podcast als interaktive, leicht verständliche Vorlesung.",
        language: "de"
      }
    })
  });
  if (!res.ok) throw new Error(`Failed to trigger generation: ${await res.text()}`);
  return await res.json();
}

export async function downloadArtifact(notebookId: string, type: "audio" | "video") {
  const res = await fetch(`${getApiUrl()}/v1/notebooks/${notebookId}/artifacts/download?type=${type}`, {
    method: "GET"
  });
  
  if (!res.ok) {
    if (res.status === 404 || res.status === 400 || res.status === 500) {
      throw new Error("Artifact not ready or error");
    }
    throw new Error(`Failed to download: ${res.statusText}`);
  }
  
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Background worker that handles the full NotebookLM orchestration.
 * We run this detached from the main request because it takes 3-5 minutes.
 */
export async function generatePodcastWorker(itemId: string, podcastType: "pre" | "post") {
  console.log(`[NotebookLM] Starting worker for item ${itemId} (Type: ${podcastType})`);
  
  try {
    const item = await prisma.sRSItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error("Item not found");
    
    // Parse source material
    const sourceMaterial = item.sourceMaterialContent ? JSON.parse(item.sourceMaterialContent) : null;
    if (!sourceMaterial) throw new Error("No source material found");

    // Create the notebook first
    console.log(`[NotebookLM] Creating notebook...`);
    const notebookTitle = `${podcastType === "pre" ? "Pre" : "Post"} - ${item.subjectMain}`.substring(0, 50);
    const notebookId = await createNotebook(notebookTitle);
    
    if (!notebookId) {
      throw new Error("Failed to create NotebookLM notebook");
    }
    
    // Save notebookId to DB
    await prisma.sRSItem.update({
      where: { id: itemId },
      data: { notebookId }
    });
    
    // Upload texts
    if (sourceMaterial.text) {
      console.log(`[NotebookLM] Uploading text material...`);
      await uploadText(notebookId, "Vorlesungsskript", sourceMaterial.text);
    }
    
    // Upload files
    if (sourceMaterial.driveFileId) {
      console.log(`[NotebookLM] Downloading file from Google Drive: ${sourceMaterial.driveFileId}`);
      try {
        const buffer = await downloadFromDrive(sourceMaterial.driveFileId);
        await uploadFile(notebookId, "Vorlesungsmaterial.pdf", buffer.toString("base64"), "Vorlesungsmaterial.pdf");
      } catch (e) {
        console.error(`[NotebookLM] Failed to download/upload file from Drive ${sourceMaterial.driveFileId}`, e);
      }
    } else if (sourceMaterial.files && sourceMaterial.files.length > 0) {
      // Legacy fallback
      for (const file of sourceMaterial.files) {
        console.log(`[NotebookLM] Uploading file: ${file.name || file.path}`);
        try {
          await uploadFile(notebookId, file.path || "fallback.pdf", file.base64, file.name);
        } catch(e) {
          console.error(`[NotebookLM] Failed to upload file ${file.name || file.path}`, e);
        }
      }
    }
    
    // Select the prompt based on podcastType
    const aiPrompt = podcastType === "pre" ? item.prePodcastPrompt : item.postPodcastPrompt;
    let finalInstructions = aiPrompt || "CRITICAL: Sprich Deutsch! Formuliere den Podcast als interaktive, leicht verständliche Vorlesung.";
    
    // Ensure German is always enforced even if the AI forgot it
    if (aiPrompt && !aiPrompt.includes("Sprich Deutsch")) {
      finalInstructions = `CRITICAL: Sprich Deutsch! Formuliere den Podcast als interaktive, leicht verständliche Vorlesung auf Deutsch.\n\n${aiPrompt}`;
    }
    
    // NotebookLM needs time to ingest and index the uploaded PDF before we can ask questions about it.
    console.log(`[NotebookLM] Waiting 30 seconds for NotebookLM to index the uploaded materials...`);
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // As per user instructions: JUST put the Regieanweisung into askChat
    console.log(`[NotebookLM] Sending chat/ask to NotebookLM...`);
    const makeComQuestion = `Erstelle mir einen podcast  hier die Regieanweisung: ${finalInstructions}`;
    await askChat(notebookId, makeComQuestion);

    console.log(`[NotebookLM] Finished configuring NotebookLM for ${podcastType}. User can now generate audio in the NotebookLM UI if desired.`);
    // Update DB with just a placeholder to mark it as configured
    // Update DB with the actual link to the Notebook
    const notebookUrl = `https://notebooklm.google.com/notebook/${notebookId}`;
    if (podcastType === "pre") {
      await prisma.sRSItem.update({
        where: { id: itemId },
        data: { prePodcastUrl: notebookUrl }
      });
    } else {
      await prisma.sRSItem.update({
        where: { id: itemId },
        data: { postPodcastUrl: notebookUrl }
      });
    }
    
    console.log(`[NotebookLM] Success! Notebook configured.`);
    
    // Push Notification
    const label = podcastType === "pre" ? "Pre-Lecture Teaser" : "Post-Lecture Deep Dive";
    await sendPushNotification({
      title: "🎙️ Podcast fertig!",
      body: `Dein ${label} für ${item.subjectMain} ist bereit!`,
      tag: `podcast-done-${itemId}-${podcastType}`,
      url: "/"
    }).catch(console.error);

  } catch (error: any) {
    console.error(`[NotebookLM] Worker error for item ${itemId}:`, error);
    
    // Attempt error push
    await sendPushNotification({
      title: "❌ Podcast Fehler",
      body: `Fehler bei der Generierung: ${error.message}`,
      tag: `podcast-error-${itemId}`,
    }).catch(() => {});
  }
}
