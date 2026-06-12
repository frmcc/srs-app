require('dotenv').config({ path: '.env' });
const { google } = require('googleapis');
const { Readable } = require('stream');

async function test() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });

  try {
    const parentFolderId = "1yv1FQ0YefZw7Zv4kVSnnmgMRFUOtHx_6"; // the test folder
    const content = "Hello world quiz";
    const name = "Quiz 1 Test";
    const stream = new Readable();
    stream.push(content);
    stream.push(null);

    const file = await drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.document",
        parents: [parentFolderId],
      },
      media: {
        mimeType: "text/plain",
        body: stream,
      },
      fields: "id",
    });
    console.log("Success! ID:", file.data.id);
  } catch (err) {
    console.error("Failed:", err);
  }
}
test();
