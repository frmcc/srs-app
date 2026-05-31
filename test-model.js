const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const fs = require('fs');

async function run() {
  try {
    fs.writeFileSync('test.txt', 'Hello world');
    const uploadRes = await ai.files.upload({
      file: 'test.txt',
      mimeType: 'text/plain',
    });
    console.log("File URI:", uploadRes.uri);
    
    const res = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri: uploadRes.uri, mimeType: "text/plain" } },
            { text: "What is this file?" }
          ]
        }
      ]
    });
    console.log("Success:", res.text);
  } catch (e) {
    console.log("Error 1:", e.message);
  }
}
run();
