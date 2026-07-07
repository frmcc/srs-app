import { GoogleGenAI } from "@google/genai";

const wrapperUrl = process.env.OPENAI_PROXY_URL || process.env.AISTUDIO_BASE_URL || "http://127.0.0.1:7860";
const wrapperKey = process.env.OPENAI_PROXY_KEY || process.env.AISTUDIO_API_KEY || "";

// Only instantiate the proxy client when it's actually configured — a hardcoded
// dummy key used to mask misconfiguration until the first real request failed.
const aiWrapper = wrapperKey
  ? new GoogleGenAI({ apiKey: wrapperKey, httpOptions: { baseUrl: wrapperUrl } })
  : null;

const MAX_RETRIES = 3;
/**
 * Backoff schedule between attempts. Kept SHORT and bounded so the total time
 * (waits + calls) stays within the route budgets — translate has
 * maxDuration=60, and the old [10s,25s,50s]≈85s schedule blew straight past it
 * and got the function killed mid-retry (after quota was already spent).
 * Worst-case wait here ≈ 1.5+4+9 = 14.5s.
 */
const RETRY_DELAYS_MS = [1_500, 4_000, 9_000];

/** Per-call soft deadline: a hung upstream socket must not consume the whole
 *  route. On timeout we reject with a transient error so the loop can retry. */
const CALL_TIMEOUT_MS = 45_000;

class CallTimeoutError extends Error {
  constructor(label: string) {
    super(`timeout: ${label} exceeded ${Math.round(CALL_TIMEOUT_MS / 1000)}s`);
    this.name = "CallTimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new CallTimeoutError(label)), CALL_TIMEOUT_MS)),
  ]);
}

function isTransient(error: Error & { status?: number }): boolean {
  if (error instanceof CallTimeoutError) return true;
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

/**
 * True for wrapper errors that are the wrapper's own fault (unreachable proxy,
 * connectivity, 5xx, timeout, rate-limit) — those are worth re-sending to the
 * official API. A permanent content/4xx error (e.g. a safety block) is NOT:
 * the official API would reject it too, so re-sending just wastes a call.
 */
function wrapperFallbackWorthwhile(error: Error & { status?: number }): boolean {
  if (isTransient(error)) return true;
  const msg = error.message || "";
  return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|proxy|socket|ECONNRESET/i.test(msg);
}

/** Does this request still carry usable content after fileData parts are stripped? */
function hasSubstantiveParts(contents: unknown): boolean {
  if (!Array.isArray(contents)) return true; // non-array shapes: don't block
  for (const content of contents) {
    const parts = (content as { parts?: unknown })?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (part && typeof part === "object" && !("fileData" in part)) return true;
    }
  }
  return false;
}

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  modelName: string,
  request: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">,
  progressCallback: (message: string) => void,
  stepLabel: string,
  useAiWrapper: boolean = true
) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (!useAiWrapper || !aiWrapper) {
        return await withTimeout(ai.models.generateContent({ model: modelName, ...request }), stepLabel);
      }

      // FIRST LINE: AIStudioToAPI proxy. Strip fileData (File API URIs) since
      // proxies don't support the File API — text/inlineData parts carry the content.
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

      // If stripping fileData left the wrapper request with NO usable content
      // (a legacy item whose only source is a File API upload), the wrapper would
      // "succeed" on nothing. Skip it and use the official API, which supports
      // fileData, with the full request.
      if (!hasSubstantiveParts(wrapperRequest.contents)) {
        return await withTimeout(ai.models.generateContent({ model: modelName, ...request }), stepLabel);
      }

      try {
        return await withTimeout(aiWrapper.models.generateContent({ model: modelName, ...wrapperRequest }), stepLabel);
      } catch (wrapperErr) {
        const wrapperError = wrapperErr as Error & { status?: number };
        // Only re-send to the official API when the wrapper failure was the
        // wrapper's own fault (unreachable/5xx/timeout). A permanent content/4xx
        // (e.g. safety block) would be rejected there too — rethrow it instead.
        if (!wrapperFallbackWorthwhile(wrapperError)) throw wrapperError;
        const reason = isTransient(wrapperError) ? "Proxy überlastet" : "Proxy nicht erreichbar";
        console.warn(`[Gemini Wrapper] ${reason} for ${stepLabel}, falling back to official Gemini API...`, wrapperError.message);
        progressCallback(`${reason} — wechsle zur offiziellen Gemini API (${stepLabel})...`);
        return await withTimeout(ai.models.generateContent({ model: modelName, ...request }), stepLabel);
      }
    } catch (err) {
      const error = err as Error & { status?: number };
      if (attempt === MAX_RETRIES || !isTransient(error)) {
        throw error;
      }
      // The wording used to always say "Hohe Auslastung", which hid network
      // errors, proxy failures and timeouts behind a "high demand" label.
      // Classify the REAL reason and log it (status + message) so the true cause
      // is visible in the server logs instead of a generic "high demand".
      const m = error.message || "";
      const reason =
        error.status === 429 || /quota|Resource has been exhausted/i.test(m)
          ? "Rate-Limit / Kontingent"
          : /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network/i.test(m)
          ? "Netzwerk-/Verbindungsfehler"
          : /timeout|ETIMEDOUT/i.test(m)
          ? "Zeitüberschreitung"
          : "Hohe Auslastung";
      console.warn(`[Gemini Retry] ${stepLabel} Versuch ${attempt}/${MAX_RETRIES} fehlgeschlagen — ${reason} (status=${error.status ?? "n/a"}): ${m}`);
      const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      progressCallback(`${reason} (${stepLabel}). Neuer Versuch in ${Math.round(delayMs / 1000)}s (Versuch ${attempt}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Unreachable");
}
