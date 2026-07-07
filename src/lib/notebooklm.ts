import { prisma } from "./db";
import fs from "fs/promises";
import path from "path";
import { sendPushNotification } from "./push";
import { downloadFromDrive } from "./google-drive";

const getApiUrl = () => {
  const url = process.env.NOTEBOOKLM_API_URL;
  if (!url) throw new Error("NOTEBOOKLM_API_URL not set in .env");
  return url.replace(/\/$/, ""); // Remove trailing slash
};

// Every NotebookLM call gets a hard client-side timeout via AbortSignal so a
// black-holed NOTEBOOKLM_API_URL can't hang the worker for undici's ~5-min
// default (a worker doing upload + sleep + askChat could otherwise pin
// resources far past maxDuration).
const FETCH_TIMEOUT_MS = 120_000;
async function nlmFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Parse sourceMaterialContent; legacy rows may hold plain text (not JSON). */
function parseSourceMaterial(content: string | null): { driveFileId?: string } | null {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null; // legacy plain text → no structured driveFileId
  }
}

/** Atomically append an entry to the videoUrl JSON history (avoids lost updates
 *  when two grade workers for the same item run concurrently). */
async function appendVideoHistory(itemId: string, level: number, url: string) {
  await prisma.$transaction(async (tx) => {
    const cur = await tx.sRSItem.findUnique({ where: { id: itemId }, select: { videoUrl: true } });
    let history: { level: number; url: string; date: string }[] = [];
    if (cur?.videoUrl) {
      try {
        const parsed = JSON.parse(cur.videoUrl);
        history = Array.isArray(parsed)
          ? parsed
          : [{ level, url: cur.videoUrl, date: new Date().toISOString() }];
      } catch {
        history = [{ level, url: cur.videoUrl, date: new Date().toISOString() }];
      }
    }
    history.push({ level, url, date: new Date().toISOString() });
    await tx.sRSItem.update({ where: { id: itemId }, data: { videoUrl: JSON.stringify(history) } });
  });
}

/**
 * Background worker that automates NotebookLM for Video Prompts.
 * Creates a notebook, uploads the PDF, and automatically asks the two video prompts.
 */
export async function generateVideoPromptsWorker(
  itemId: string,
  isPass: boolean,
  subjectMain: string,
  prompt1: string,
  prompt2: string
) {
  console.log(`[NotebookLM Video] Starting worker for item ${itemId} (Pass: ${isPass})`);
  
  try {
    const item = await prisma.sRSItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error("Item not found");

    // 1. Create a new notebook
    const title = `${isPass ? "Pass" : "Repeat"}: ${subjectMain}`;
    console.log(`[NotebookLM Video] Creating notebook: ${title}`);
    const notebookId = await createNotebook(title);
    const newVideoUrl = `https://notebooklm.google.com/notebook/${notebookId}`;

    // 2. Upload the original PDF
    const sourceMaterial = parseSourceMaterial(item.sourceMaterialContent);
    if (sourceMaterial?.driveFileId) {
      console.log(`[NotebookLM Video] Downloading file from Google Drive: ${sourceMaterial.driveFileId}`);
      const buffer = await downloadFromDrive(sourceMaterial.driveFileId);
      await uploadFile(notebookId, "Vorlesungsmaterial.pdf", buffer.toString("base64"), "Vorlesungsmaterial.pdf");
    } else {
      console.log(`[NotebookLM Video] No Drive File ID found, skipping PDF upload.`);
    }

    // 3. Wait for the notebook to process the file
    console.log(`[NotebookLM Video] Waiting 20 seconds for notebook to process file...`);
    await new Promise(resolve => setTimeout(resolve, 20000));

    // 4. Send prompts separately to trigger video generation for each. Track
    //    whether at least one succeeded — we only persist the link if real work
    //    landed, so a hard failure doesn't leave the UI pointing at an empty
    //    notebook. (Errors here rethrow to the outer catch, which notifies.)
    let anySucceeded = false;
    if (prompt1) {
      console.log(`[NotebookLM Video] Asking Prompt 1...`);
      await askChat(notebookId, `Erstelle ein Video, Whiteboard Style auf Deutsch.\n\n${prompt1}`);
      anySucceeded = true;
    }
    if (prompt2) {
      console.log(`[NotebookLM Video] Asking Prompt 2...`);
      await askChat(notebookId, `Erstelle ein Video, Whiteboard Style auf Deutsch.\n\n${prompt2}`);
      anySucceeded = true;
    }

    // 5. Persist the link atomically, only now that the notebook is populated.
    if (anySucceeded || !prompt1) {
      await appendVideoHistory(itemId, item.currentLevel, newVideoUrl);
    }

    console.log(`[NotebookLM Video] Success! Prompts generated.`);
  } catch (err) {
    // Surface the failure instead of swallowing it — otherwise the run looks
    // "done" with no video and no signal.
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[NotebookLM Video] Worker Error:`, error);
    await sendPushNotification({
      title: "❌ Video-Prompts Fehler",
      body: `Fehler bei der Video-Generierung für ${subjectMain}.`,
      tag: `video-error-${itemId}`,
    }).catch(() => {});
  }
}

export async function createNotebook(title: string): Promise<string> {
  const res = await nlmFetch(`${getApiUrl()}/v1/notebooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
  if (!res.ok) throw new Error(`Failed to create notebook: ${await res.text()}`);
  const data = await res.json();
  return data.notebook.id;
}

export async function uploadText(notebookId: string, title: string, content: string) {
  const res = await nlmFetch(`${getApiUrl()}/v1/notebooks/${notebookId}/sources/text`, {
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

  const res = await nlmFetch(`${getApiUrl()}/v1/notebooks/${notebookId}/sources/file`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error(`Failed to upload file: ${await res.text()}`);
  return await res.json();
}

export async function askChat(notebookId: string, question: string) {
  const res = await nlmFetch(`${getApiUrl()}/v1/notebooks/${notebookId}/chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });
  if (!res.ok) throw new Error(`Failed to ask chat: ${await res.text()}`);
  return await res.json();
}

export async function generateArtifact(notebookId: string, type: "audio" | "video", instructions?: string) {
  const res = await nlmFetch(`${getApiUrl()}/v1/notebooks/${notebookId}/artifacts/generate`, {
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
  const res = await nlmFetch(`${getApiUrl()}/v1/notebooks/${notebookId}/artifacts/download?type=${type}`, {
    method: "GET"
  });
  
  if (!res.ok) {
    // 404/400 = genuinely "not ready yet" (expected while polling). A 500 is a
    // real server error and shouldn't be masked as "not ready".
    if (res.status === 404 || res.status === 400) {
      throw new Error("Artifact not ready");
    }
    throw new Error(`Failed to download artifact (status ${res.status})`);
  }
  
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Background worker that handles the full NotebookLM orchestration.
 * We run this detached from the main request because it takes 3-5 minutes.
 */
export async function generatePodcastWorker(
  itemId: string, 
  podcastType: "pre" | "post", 
  notebookId: string,
  textContent?: string,
  memoryFiles?: {name?: string, base64?: string, mimeType: string, path?: string}[]
) {
  console.log(`[NotebookLM] Starting worker for item ${itemId} (Type: ${podcastType}, Notebook: ${notebookId})`);
  
  try {
    const item = await prisma.sRSItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error("Item not found");
    
    // Upload texts
    if (textContent) {
      console.log(`[NotebookLM] Uploading text material...`);
      await uploadText(notebookId, "Vorlesungsskript", textContent);
    }
    
    // Upload files from memory (base64) or disk (path) — uploadFile falls back
    // to fs.readFile(path) when no base64 is given. The old `if (!file.base64)
    // continue;` silently skipped every disk-backed file.
    if (memoryFiles && memoryFiles.length > 0) {
      for (const file of memoryFiles) {
        if (!file.base64 && !file.path) continue;
        console.log(`[NotebookLM] Uploading file: ${file.name || file.path}`);
        try {
          await uploadFile(notebookId, file.path || file.name || "fallback.pdf", file.base64, file.name);
        } catch(e) {
          console.error(`[NotebookLM] Failed to upload file ${file.name || file.path}`, e);
        }
      }
    } else {
      // Fallback: If no memory files were passed, try to fetch from Drive!
      const sourceMaterial = parseSourceMaterial(item.sourceMaterialContent);
      if (sourceMaterial && sourceMaterial.driveFileId) {
        console.log(`[NotebookLM] Downloading file from Google Drive: ${sourceMaterial.driveFileId}`);
        try {
          const buffer = await downloadFromDrive(sourceMaterial.driveFileId);
          await uploadFile(notebookId, "Vorlesungsmaterial.pdf", buffer.toString("base64"), "Vorlesungsmaterial.pdf");
        } catch (e) {
          console.error(`[NotebookLM] Failed to download/upload file from Drive ${sourceMaterial.driveFileId}`, e);
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

  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[NotebookLM] Worker error for item ${itemId}:`, error);
    
    // Attempt error push
    await sendPushNotification({
      title: "❌ Podcast Fehler",
      body: `Fehler bei der Generierung: ${error.message}`,
      tag: `podcast-error-${itemId}`,
    }).catch(() => {});
  }
}
