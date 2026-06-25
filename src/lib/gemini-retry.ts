import { GoogleGenAI } from "@google/genai";
import { runAgent } from "./agent";

const wrapperUrl = process.env.OPENAI_PROXY_URL || process.env.AISTUDIO_BASE_URL || "http://127.0.0.1:7860";
const wrapperKey = process.env.OPENAI_PROXY_KEY || process.env.AISTUDIO_API_KEY || "";

// Only instantiate the proxy client when it's actually configured — a hardcoded
// dummy key used to mask misconfiguration until the first real request failed.
const aiWrapper = wrapperKey
  ? new GoogleGenAI({ apiKey: wrapperKey, httpOptions: { baseUrl: wrapperUrl } })
  : null;

const MAX_RETRIES = 4;
/** Backoff schedule between attempts. Total worst-case wait ≈ 85s per step. */
const RETRY_DELAYS_MS = [10_000, 25_000, 50_000];

function isTransient(error: Error & { status?: number }): boolean {
  // Prefer the structured status when the SDK provides one.
  if (error.status === 503 || error.status === 429) return true;
  if (typeof error.status === "number" && error.status >= 400 && error.status < 500) return false;
  const msg = error.message || "";
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("quota") ||
    msg.includes("Resource has been exhausted") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout")
  );
}

/** Flatten the text parts of a request (the agent is text-only — no PDF/inlineData). */
function extractRequestText(request: { contents?: unknown }): string {
  const contents = request.contents;
  if (!Array.isArray(contents)) return "";
  const out: string[] = [];
  for (const c of contents) {
    const parts = c && typeof c === "object" && "parts" in c ? (c as { parts?: unknown }).parts : undefined;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string") {
          out.push((p as { text: string }).text);
        }
      }
    }
  }
  return out.join("\n\n");
}

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  modelName: string,
  request: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">,
  progressCallback: (message: string) => void,
  stepLabel: string,
  useAiWrapper: boolean = true,
  agentMode: boolean = false
) {
  // Agent Mode (opt-in): run THIS step with the managed agent, using the SAME
  // system instruction + text material as the normal call. On ANY failure it
  // returns null and we fall through to the normal model call below — so Agent
  // Mode can never break or empty a step.
  if (agentMode) {
    const instruction = typeof request.config?.systemInstruction === "string" ? request.config.systemInstruction : "";
    const agentOut = await runAgent({
      instruction,
      material: extractRequestText(request),
      label: stepLabel,
      onProgress: progressCallback,
    });
    if (agentOut !== null) {
      return { text: agentOut } as unknown as Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
    }
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (!useAiWrapper || !aiWrapper) {
        return await ai.models.generateContent({ model: modelName, ...request });
      }

      // FIRST LINE: AIStudioToAPI proxy. Strip fileData (File API URIs) since
      // proxies don't support the File API — text/inlineData parts carry the content.
      try {
        const wrapperRequest = { ...request };
        if (Array.isArray(wrapperRequest.contents)) {
          wrapperRequest.contents = wrapperRequest.contents.map((content) => {
            if (typeof content !== "object" || content === null || !("parts" in content)) return content;
            const parts = (content as { parts?: unknown }).parts;
            return {
              ...content,
              parts: Array.isArray(parts) ? parts.filter((part) => !(part && typeof part === "object" && "fileData" in part)) : parts,
            };
          }) as typeof wrapperRequest.contents;
        }
        return await aiWrapper.models.generateContent({ model: modelName, ...wrapperRequest });
      } catch (wrapperError) {
        // SECOND LINE: official Gemini API with the FULL request (native PDFs included).
        const errMsg = wrapperError instanceof Error ? wrapperError.message : String(wrapperError);
        console.warn(`[Gemini Wrapper] Failed for ${stepLabel}, falling back to standard Gemini API...`, errMsg);
        progressCallback(`Proxy nicht erreichbar — wechsle zur offiziellen Gemini API (${stepLabel})...`);
        return await ai.models.generateContent({ model: modelName, ...request });
      }
    } catch (err) {
      const error = err as Error & { status?: number };
      if (attempt === MAX_RETRIES || !isTransient(error)) {
        throw error;
      }
      const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      progressCallback(`Hohe Auslastung (${stepLabel}). Neuer Versuch in ${Math.round(delayMs / 1000)}s (Versuch ${attempt}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Unreachable");
}
