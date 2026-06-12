require('dotenv').config({ path: '.env' });
const { google } = require('googleapis');

async function test() {
  try {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    
    if (!privateKey || !clientEmail) {
      console.log("Missing credentials");
      return;
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });
    
    const res = await drive.files.list({
      pageSize: 5,
      fields: 'nextPageToken, files(id, name)',
    });
    
    console.log("SUCCESS! Found files:");
    res.data.files.forEach((file) => {
      console.log(`${file.name} (${file.id})`);
    });
    
    // Test folder creation
    console.log("Testing folder creation in", process.env.GOOGLE_DRIVE_FOLDER_ID);
    const file = await drive.files.create({
      requestBody: {
        name: "Test Folder",
        mimeType: "application/vnd.google-apps.folder",
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      fields: "id",
    });
    console.log("SUCCESS! Created folder with ID:", file.data.id);
    
  } catch (err) {
    console.error("FAILED:", err.message);
  }
}

test();
