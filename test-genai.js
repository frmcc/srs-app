const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: "test", baseUrl: "http://localhost:7860" });
console.log(ai.apiKey);
console.log(ai.baseUrl);
