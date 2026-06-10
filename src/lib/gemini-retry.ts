import { GoogleGenAI } from "@google/genai";

const wrapperUrl = process.env.AISTUDIO_BASE_URL || "http://127.0.0.1:7860/v1beta";
const wrapperKey = process.env.AISTUDIO_API_KEY || "123456";

const aiWrapper = new GoogleGenAI({
  apiKey: wrapperKey,
  httpOptions: { baseUrl: wrapperUrl }
});

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  modelName: string,
  request: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">,
  progressCallback: (message: string) => void,
  stepLabel: string
) {
  const maxRetries = 5;
  let delayMs = 10000; // start with 10s delay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // FIRST LINE: Try AIStudioToAPI Gemini Wrapper
      try {
        console.log(`[Gemini Wrapper] Trying AIStudioToAPI for ${stepLabel}...`);
        return await aiWrapper.models.generateContent({ model: modelName, ...request });
      } catch (wrapperError) {
        // SECOND LINE: Try Official Gemini API (Fallback)
        console.warn(`[Gemini Wrapper] Failed for ${stepLabel}, falling back to standard Gemini API...`, wrapperError instanceof Error ? wrapperError.message : String(wrapperError));
        return await ai.models.generateContent({ model: modelName, ...request });
      }
    } catch (err: unknown) {
      const error = err as Error & { status?: number };
      if (attempt === maxRetries) {
        throw error; // throw on the final failed attempt
      }

      // Check if the error is a temporary overload (503, 429, or fetch timeout)
      const is503 = error.status === 503 || error.message?.includes("503") || error.message?.includes("high demand") || error.message?.includes("UNAVAILABLE");
      const is429 = error.status === 429 || error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("Resource has been exhausted");
      const isFetchError = error.message?.includes("fetch failed") || error.message?.includes("timeout");

      if (is503 || is429 || isFetchError) {
        const waitSeconds = delayMs / 1000;
        progressCallback(`Hohe Auslastung (${stepLabel}). Versuche es erneut in ${waitSeconds}s (Versuch ${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs = 60000; // bump to 60 seconds for tries 2, 3, 4, 5
      } else {
        // Unrecoverable error (e.g. 400 Bad Request, missing API key, syntax error)
        throw error;
      }
    }
  }
  throw new Error("Unreachable");
}
