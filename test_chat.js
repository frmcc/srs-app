const fetch = require('node-fetch');

async function test() {
  const notebookId = "1426d3fc-254f-46d1-bf7e-5cdcfa4c1990"; // the one I created
  const res = await fetch(`https://notebooklm-api-150434442017.us-central1.run.app/v1/notebooks/${notebookId}/chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Erstelle mir einen podcast auf deutsch" })
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}
test();
