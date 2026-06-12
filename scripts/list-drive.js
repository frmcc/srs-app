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

  const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  console.log(`Checking contents of: ${parentId}`);
  try {
    const res = await drive.files.list({
      q: `'${parentId}' in parents`,
      fields: 'files(id, name, createdTime)'
    });
    console.log(JSON.stringify(res.data.files, null, 2));
  } catch (err) {
    console.error("Error getting metadata:", err.message);
  }
}
check();
