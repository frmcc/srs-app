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

  try {
    const res = await drive.permissions.list({
      fileId: "1yv1FQ0YefZw7Zv4kVSnnmgMRFUOtHx_6",
      fields: "permissions(id, emailAddress, role, type)"
    });
    console.log("Permissions for Test Folder:", JSON.stringify(res.data.permissions, null, 2));
  } catch (err) {
    console.error("Error getting metadata:", err.message);
  }
}
check();
