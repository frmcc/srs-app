import { GoogleGenAI } from "@google/genai";

const wrapperUrl = process.env.OPENAI_PROXY_URL || process.env.AISTUDIO_BASE_URL || "http://127.0.0.1:7860";
const wrapperKey = process.env.OPENAI_PROXY_KEY || process.env.AISTUDIO_API_KEY || "123456";

const aiWrapper = new GoogleGenAI({
  apiKey: wrapperKey,
  httpOptions: { baseUrl: wrapperUrl }
});

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  modelName: string,
  request: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">,
  progressCallback: (message: string) => void,
  stepLabel: string,
  useAiWrapper: boolean = true
) {
  const maxRetries = 5;
  let delayMs = 10000; // start with 10s delay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!useAiWrapper) {
        progressCallback(`Verwende offizielles Google Fallback System (${stepLabel})...`);
        return await ai.models.generateContent({ model: modelName, ...request });
      }
      
      // FIRST LINE: Try AIStudioToAPI Gemini Wrapper
      try {
        console.log(`[Gemini Wrapper] Trying AIStudioToAPI for ${stepLabel}...`);
        
        // Strip fileData (File API URIs) for the wrapper, since proxies usually don't support the File API.
        // It will rely on the parsed text we appended in the route, or inlineData if provided.
        const wrapperRequest = { ...request };
        if (Array.isArray(wrapperRequest.contents)) {
          wrapperRequest.contents = wrapperRequest.contents.map((content: any) => ({
            ...content,
            parts: Array.isArray(content.parts) ? content.parts.filter((part: any) => {
              if (part.fileData) return false;
              return true;
            }) : content.parts
          }));
        }
        
        return await aiWrapper.models.generateContent({ model: modelName, ...wrapperRequest });
      } catch (wrapperError) {
        // SECOND LINE: Try Official Gemini API (Fallback)
        // The native API receives the FULL request (including native PDFs!)
        const errMsg = wrapperError instanceof Error ? wrapperError.message : String(wrapperError);
        console.warn(`[Gemini Wrapper] Failed for ${stepLabel}, falling back to standard Gemini API...`, errMsg);
        progressCallback(`Proxy Error! Switching to official Google Fallback API (${stepLabel})...`);
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
