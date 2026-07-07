import { google } from "googleapis";
import { Readable } from "stream";

// Initialize Google Drive API with OAuth2
function getDriveClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google OAuth2 credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) in .env");
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });

  return google.drive({ version: "v3", auth: oauth2Client });
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

// Serialize list-then-create per (parent, name) so two concurrent generations
// can't both miss the lookup and create duplicate sibling folders.
const folderLocks = new Map<string, Promise<string>>();

export function getOrCreateDriveFolder(name: string, parentFolderId?: string): Promise<string> {
  const parentId = parentFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!parentId) {
    return Promise.reject(new Error("GOOGLE_DRIVE_FOLDER_ID is missing in .env"));
  }

  const lockKey = `${parentId}/${name}`;
  const existing = folderLocks.get(lockKey);
  if (existing) return existing;

  const task = (async () => {
    const drive = getDriveClient();
    // Escape backslashes FIRST, then single quotes — order matters, otherwise a
    // name containing a backslash produces a malformed query.
    const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const query = `name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await drive.files.list({
      q: query,
      // Order by creation time so that, if duplicate folders already exist, the
      // SAME (oldest) one wins every call instead of a nondeterministic pick.
      orderBy: 'createdTime',
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const files = response.data.files;
    if (files && files.length > 0) {
      console.log(`[Google Drive] Found existing folder: ${name} (ID: ${files[0].id})`);
      return files[0].id!;
    }

    console.log(`[Google Drive] Creating new folder: ${name}`);
    return createDriveFolder(name, parentId);
  })();

  folderLocks.set(lockKey, task);
  // Drop the lock on settle: successes are re-resolved instantly by the list
  // call next time; failures shouldn't poison future attempts.
  task.finally(() => folderLocks.delete(lockKey)).catch(() => {});
  return task;
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

  if (buffer.length === 0) {
    // A 0-byte "source material" file silently poisons every later grading run.
    throw new Error(`Refusing to upload empty file "${name}" to Drive.`);
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

  // 1. Check if it's a Google Workspace document
  const fileMeta = await drive.files.get({
    fileId: fileId,
    fields: 'mimeType'
  });

  if (fileMeta.data.mimeType === 'application/vnd.google-apps.document') {
    // Google Docs CANNOT be downloaded directly, they must be exported!
    // We export it as a PDF since the Gemini Grader expects a PDF buffer.
    const response = await drive.files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data as ArrayBuffer);
  } else {
    // Normal files (like uploaded PDFs) can be downloaded directly
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(response.data as ArrayBuffer);
  }
}

/** Best-effort delete of a Drive file (used when a module is deleted). */
export async function deleteFromDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}
