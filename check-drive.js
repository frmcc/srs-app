require('dotenv').config({ path: '.env' });
const { google } = require('googleapis');

async function check() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });

  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  console.log(`Checking ID: ${id}`);
  try {
    const file = await drive.files.get({
      fileId: id,
      fields: 'name, mimeType, parents, owners'
    });
    console.log("Metadata:", JSON.stringify(file.data, null, 2));
  } catch (err) {
    console.error("Error getting metadata:", err.message);
  }
}
check();
