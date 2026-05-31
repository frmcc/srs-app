import { google } from "googleapis";
import { Readable } from "stream";

// Initialize Google Drive API
function getDriveClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  
  if (!privateKey || !clientEmail) {
    throw new Error("Missing Google Service Account credentials in .env");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

export async function createDriveFolder(name: string, parentFolderId?: string): Promise<string> {
  const drive = getDriveClient();
  const parentId = parentFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
  
  if (!parentId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID is missing in .env");
  }

  const fileMetadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    fields: "id",
  });

  return file.data.id!;
}

export async function uploadToDrive(
  name: string,
  mimeType: string,
  bufferOrBase64: Buffer | string,
  parentFolderId: string
): Promise<string> {
  const drive = getDriveClient();

  const fileMetadata = {
    name,
    parents: [parentFolderId],
  };

  let buffer: Buffer;
  if (typeof bufferOrBase64 === "string") {
    // If it's a base64 string
    buffer = Buffer.from(bufferOrBase64, "base64");
  } else {
    buffer = bufferOrBase64;
  }

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const media = {
    mimeType,
    body: stream,
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
  });

  return file.data.id!;
}

export async function createGoogleDoc(
  name: string,
  content: string,
  parentFolderId: string
): Promise<string> {
  const drive = getDriveClient();

  const fileMetadata = {
    name,
    mimeType: "application/vnd.google-apps.document", // Automatically converts text to Google Doc
    parents: [parentFolderId],
  };

  const stream = new Readable();
  stream.push(content);
  stream.push(null);

  const media = {
    mimeType: "text/plain",
    body: stream,
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
  });

  return file.data.id!;
}

export async function downloadFromDrive(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(response.data as ArrayBuffer);
}
