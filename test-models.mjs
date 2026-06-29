import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"];
  
  for (const model of models) {
    try {
      console.log(`Testing ${model}...`);
      const res = await ai.models.generateContent({
        model,
        contents: "Hello",
      });
      console.log(`${model} SUCCESS:`, res.text.slice(0, 50));
    } catch (e) {
      console.log(`${model} FAILED:`, e.status, e.message);
    }
  }
}
run();
