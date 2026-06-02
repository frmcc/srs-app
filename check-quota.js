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
    const res = await drive.about.get({
      fields: "storageQuota, user"
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
  }
}
check();
