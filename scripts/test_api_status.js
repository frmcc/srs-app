const url = "https://notebooklm-api-150434442017.us-central1.run.app";
const nbId = "6967b6b3-997a-49eb-b7b0-5a5aba85f065";
const taskId = "21282266-6e9d-4375-a336-ae5144f3ea84";

async function main() {
  let res = await fetch(`${url}/v1/notebooks/${nbId}/artifacts/tasks/${taskId}`);
  console.log("Status:", await res.json());
}
main().catch(console.error);
