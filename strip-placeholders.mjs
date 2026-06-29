import fs from "fs/promises";

async function stripLines() {
  const files = [
    "src/app/api/grade/prompts.ts",
    "src/app/api/quiz/prompts.ts"
  ];

  for (const file of files) {
    let content = await fs.readFile(file, "utf8");
    // Match the exact line pattern and remove it, along with any leading/trailing empty lines that were left behind if desired
    // Actually, just removing the exact string is safer.
    content = content.replace(/\[FÜGE HIER ZWINGEND \d+ LEERE ZEILEN EIN(?:, DAMIT DER STUDENT PLATZ HAT, SEINE ANTWORT HANDSCHRIFTLICH HINZUSCHREIBEN)?\]/g, "");
    
    // Clean up multiple consecutive empty lines that might have been left
    content = content.replace(/\n{3,}/g, "\n\n");
    
    await fs.writeFile(file, content, "utf8");
    console.log(`Stripped placeholders from ${file}`);
  }
}
stripLines();
