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
  stepLabel: string,
  proxyAttachments?: { mimeType: string; base64: string }[]
) {
  const maxRetries = 5;
  let delayMs = 10000; // start with 10s delay

  const openaiProxyUrl = process.env.OPENAI_PROXY_URL;
  const openaiProxyKey = process.env.OPENAI_PROXY_KEY || "123456";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // FIRST LINE: Try OpenAI Proxy format if URL is configured
      if (openaiProxyUrl && attempt === 1) {
        try {
          console.log(`[Gemini Proxy] Trying OpenAI Proxy (${openaiProxyUrl}) for ${stepLabel}...`);
          
          const messages: any[] = [];
          
          if (request.config && request.config.systemInstruction) {
              let sysText = "";
              if (typeof request.config.systemInstruction === "string") sysText = request.config.systemInstruction;
              else if ((request.config.systemInstruction as any).parts) sysText = (request.config.systemInstruction as any).parts.map((p: any) => p.text).join("\n");
              messages.push({ role: "system", content: sysText });
          }
          
          const openAiAttachments: string[] = [];

          if (proxyAttachments && proxyAttachments.length > 0) {
              proxyAttachments.forEach(a => openAiAttachments.push(`data:${a.mimeType};base64,${a.base64}`));
          }

          if (request.contents) {
              const contentsArr = Array.isArray(request.contents) ? request.contents : [request.contents];
              for (const c of contentsArr as any[]) {
                  if (typeof c === "string") {
                      messages.push({ role: "user", content: c });
                      continue;
                  }
                  let role = c.role === "model" ? "assistant" : "user";
                  let contentText = "";
                  if (Array.isArray(c.parts)) {
                      contentText = c.parts.map((p: any) => {
                          if (p.text) return p.text;
                          if (p.inlineData) {
                              openAiAttachments.push(`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`);
                          }
                          return "";
                      }).join("\n");
                  }
                  messages.push({ role, content: contentText });
              }
          }
          
          const payload: any = {
              model: modelName,
              messages
          };
          
          if (openAiAttachments.length > 0) {
              payload.attachments = openAiAttachments;
          }
          
          const proxyRes = await fetch(`${openaiProxyUrl}/chat/completions`, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${openaiProxyKey}`
              },
              body: JSON.stringify(payload)
          });
          
          if (!proxyRes.ok) {
              const errText = await proxyRes.text();
              throw new Error(`OpenAI Proxy HTTP ${proxyRes.status}: ${errText}`);
          }
          
          const proxyData = await proxyRes.json();
          const textResponse = proxyData.choices?.[0]?.message?.content || "";
          console.log(`[Gemini Proxy] Success via OpenAI Proxy for ${stepLabel}`);
          
          return { text: textResponse };
        } catch (proxyErr) {
          console.warn(`[Gemini Proxy] OpenAI Proxy failed for ${stepLabel}. Falling back to old system...`, proxyErr instanceof Error ? proxyErr.message : String(proxyErr));
        }
      }

      // SECOND LINE: Try AIStudioToAPI Gemini Wrapper
      try {
        console.log(`[Gemini Wrapper] Trying AIStudioToAPI for ${stepLabel}...`);
        return await aiWrapper.models.generateContent({ model: modelName, ...request });
      } catch (wrapperError) {
        // THIRD LINE: Try Official Gemini API (Fallback)
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
