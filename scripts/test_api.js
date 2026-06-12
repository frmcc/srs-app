const url = "https://notebooklm-api-150434442017.us-central1.run.app";

async function main() {
  console.log("Creating notebook...");
  let res = await fetch(`${url}/v1/notebooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Test Audio Generation" }) });
  let data = await res.json();
  const nbId = data.notebook_id;
  console.log("Notebook:", nbId);
  
  console.log("Adding text source...");
  res = await fetch(`${url}/v1/notebooks/${nbId}/sources/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Source 1", text: "Dies ist ein Testtext über Künstliche Intelligenz. KI ist sehr cool und nützlich." }) });
  console.log("Source added:", await res.json());

  console.log("Generating audio...");
  res = await fetch(`${url}/v1/notebooks/${nbId}/artifacts/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "audio", options: { instructions: "Erstelle mir einen podcast hier die Regieanweisung: \nCRITICAL: Sprich Deutsch! Formuliere den Podcast als interaktive, leicht verständliche Vorlesung auf Deutsch." } }) });
  data = await res.json();
  console.log("Task:", data);
  
  // Clean up
  await fetch(`${url}/v1/notebooks/${nbId}`, { method: "DELETE" });
}
main().catch(console.error);
