const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = fs.readFileSync('src/app/api/quiz/prompts.ts', 'utf8');
  const podcastPrompts = prompt.split('export const podcast_prompts = `')[1].split('`;')[0];
  
  const res = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [{ role: "user", parts: [{ text: "Hier ist ein Blueprint:\n\n===BLUEPRINT_START===\n# 1. Metadaten\n- Kurs/Modul: Psychologie\n- Vorlesungstitel: KI Ethik\n- Inhaltszusammenfassung: KI Ethik ist wichtig.\n===BLUEPRINT_END===" }] }],
    config: { systemInstruction: podcastPrompts }
  });
  
  console.log("RESPONSE:", res.text);
}
run().catch(console.error);
