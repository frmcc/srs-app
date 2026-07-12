import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { createHash } from "crypto";

const wrapperUrl = process.env.OPENAI_PROXY_URL || process.env.AISTUDIO_BASE_URL || "http://127.0.0.1:7860";
const wrapperKey = process.env.OPENAI_PROXY_KEY || process.env.AISTUDIO_API_KEY || "";

// Only instantiate the proxy client when it's actually configured — a hardcoded
// dummy key used to mask misconfiguration until the first real request failed.
const aiWrapper = wrapperKey
  ? new GoogleGenAI({ apiKey: wrapperKey, httpOptions: { baseUrl: wrapperUrl } })
  : null;

/**
 * How file bytes travel to Gemini THROUGH THE WRAPPER (AppConfig.fileTransport):
 *  - "inline":   base64 `inlineData` parts inside the request JSON. Verified in
 *                the AIStudioToAPI source: the native /v1beta passthrough relays
 *                `contents` verbatim, so the model genuinely sees the bytes.
 *  - "file_api": upload once through the wrapper's `/upload/*` proxy (resumable
 *                protocol; upload-url headers are rewritten to point back at the
 *                proxy) and reference the `fileData` URI instead.
 *
 * The OFFICIAL API ignores this setting: it always gets sizable files via its
 * own native File API upload (small parts like scribble PNGs stay inline —
 * an upload round-trip per sketch would cost more than it saves). File API
 * URIs are account-scoped, so each backend always gets its own upload
 * (see mintedUriBackend).
 */
export type FileTransport = "inline" | "file_api";

export function normalizeFileTransport(v: string | null | undefined): FileTransport {
  return v === "file_api" ? "file_api" : "inline";
}

/** Thrown when a file could not be delivered via the File API and inlining was impossible. */
export class FileUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileUploadError";
  }
}

/**
 * Thrown when the response's prompt-token count is far below what the attached
 * files must have produced — i.e. the backend silently discarded the file and
 * the model answered without ever seeing the document.
 */
export class FileDroppedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileDroppedError";
  }
}

/**
 * The app's internal model ids don't all match the Gemini API's model names.
 * "gemini-3.1-pro" is a short id used in the picker/pricing, but BOTH backends —
 * the official /v1beta API AND the AI-Studio wrapper (which is /v1beta-
 * compatible) — only know "gemini-3.1-pro-preview" and return 404 NOT_FOUND on
 * the short form (verified against each with a live generateContent probe:
 * gemini-3.1-pro -> 404, gemini-3.1-pro-preview -> 200 on both). So map to the
 * real API name at EVERY generateContent call. The internal id is kept for
 * credit metering/pricing and the UI. gemini-3.5-flash and gemini-3.1-flash-lite
 * are already valid API names on both backends.
 */
const API_MODEL_ALIASES: Record<string, string> = {
  "gemini-3.1-pro": "gemini-3.1-pro-preview",
};
function apiModelName(modelName: string): string {
  return API_MODEL_ALIASES[modelName] ?? modelName;
}

const MAX_RETRIES = 3;
/**
 * Backoff schedule between attempts. Kept SHORT and bounded so the total time
 * (waits + calls) stays within the route budgets — translate has
 * maxDuration=60, and the old [10s,25s,50s]≈85s schedule blew straight past it
 * and got the function killed mid-retry (after quota was already spent).
 * Worst-case wait here ≈ 1.5+4+9 = 14.5s.
 */
const RETRY_DELAYS_MS = [1_500, 4_000, 9_000];

/** Per-call soft deadline: a hung upstream socket must not consume the whole
 *  route. On timeout we reject with a transient error so the loop can retry. */
const CALL_TIMEOUT_MS = 180_000;
/** Uploads move megabytes (through a browser relay in the wrapper case) — give
 *  them more room than a generate call, but still bounded. */
const UPLOAD_TIMEOUT_MS = 120_000;

class CallTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`timeout: ${label} exceeded ${Math.round(ms / 1000)}s`);
    this.name = "CallTimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, label: string, ms: number = CALL_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new CallTimeoutError(label, ms)), ms)),
  ]);
}

function isTransient(error: Error & { status?: number }): boolean {
  if (error instanceof CallTimeoutError) return true;
  // Prefer the structured status when the SDK provides one.
  if (error.status === 503 || error.status === 429) return true;
  if (typeof error.status === "number" && error.status >= 400 && error.status < 500) return false;
  const msg = error.message || "";
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("quota") ||
    msg.includes("Resource has been exhausted") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout")
  );
}

/**
 * True for wrapper errors that are the wrapper's own fault (unreachable proxy,
 * connectivity, 5xx, timeout, rate-limit) — those are worth re-sending to the
 * official API. A permanent content/4xx error (e.g. a safety block) is NOT:
 * the official API would reject it too, so re-sending just wastes a call.
 */
function wrapperFallbackWorthwhile(error: Error & { status?: number }): boolean {
  if (isTransient(error)) return true;
  // A dropped/vanished file is a wrapper-side delivery failure — the official
  // API gets a fresh adaptation (new upload or inline bytes), so retrying
  // there is meaningful. Same for File-API permission errors: the wrapper
  // rotates AI Studio accounts, and an upload made under account A 403s when
  // the generate call lands on account B.
  if (error instanceof FileDroppedError || error instanceof FileUploadError) return true;
  const msg = error.message || "";
  if (/file .*(not found|does not exist)|PERMISSION_DENIED|FAILED_PRECONDITION.*file/i.test(msg)) return true;
  return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|proxy|socket|ECONNRESET/i.test(msg);
}

// ---------------------------------------------------------------------------
// File transport: upload cache + per-backend request adaptation
// ---------------------------------------------------------------------------

type BackendId = "wrapper" | "official";

type PartLike = {
  text?: string;
  inlineData?: { data: string; mimeType: string };
  fileData?: { fileUri: string; mimeType: string };
} & Record<string, unknown>;

/** Official request-size ceiling is 20 MB — stay under it with headroom for
 *  the prompt text. Above this, inline mode auto-promotes parts to uploads. */
const INLINE_SOFT_LIMIT_B64 = 19_000_000;
/** Tiny payloads (scribble PNGs etc.) are cheaper inline than as an upload
 *  round-trip — file_api mode only uploads parts at least this big. */
const FILE_API_MIN_B64 = 64_000;

/** File API objects live 48h; refresh well before that. */
const UPLOAD_CACHE_TTL_MS = 40 * 60 * 60 * 1000;

interface CachedUpload {
  uri: string;
  mimeType: string;
  expiresAt: number;
}

/** content-hash+backend → uploaded file, so one PDF is uploaded once per
 *  backend instead of once per pipeline step (a grading run makes ~6 calls). */
const uploadCache = new Map<string, CachedUpload>();
/** URIs WE uploaded, and to which backend — distinguishes our fileData parts
 *  from foreign ones (e.g. legacy items holding official File API URIs). */
const mintedUriBackend = new Map<string, BackendId>();

function pruneUploadCache() {
  const now = Date.now();
  for (const [key, entry] of uploadCache) {
    if (entry.expiresAt <= now) {
      uploadCache.delete(key);
      mintedUriBackend.delete(entry.uri);
    }
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadToBackend(
  client: GoogleGenAI,
  backendId: BackendId,
  b64: string,
  mimeType: string,
  progressCallback: (message: string) => void,
  stepLabel: string
): Promise<CachedUpload> {
  pruneUploadCache();
  const key = `${backendId}:${createHash("sha256").update(b64).digest("hex")}`;
  const hit = uploadCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit;

  const bytes = Buffer.from(b64, "base64");
  progressCallback(`Lade Datei hoch (${Math.round(bytes.length / 1024)} KB, ${backendId === "wrapper" ? "Proxy" : "Gemini API"})…`);
  const uploaded = await withTimeout(
    client.files.upload({ file: new Blob([new Uint8Array(bytes)], { type: mimeType }), config: { mimeType } }),
    `${stepLabel} file upload`,
    UPLOAD_TIMEOUT_MS
  );

  // Files enter PROCESSING before they are usable — wait for ACTIVE, or the
  // generate call would 400 with "file is not in an ACTIVE state".
  let file = uploaded;
  const deadline = Date.now() + 90_000;
  while (file.state === "PROCESSING" && file.name && Date.now() < deadline) {
    await sleep(2_000);
    file = await client.files.get({ name: file.name });
  }
  if (!file.uri || (file.state && file.state !== "ACTIVE")) {
    throw new FileUploadError(`File upload for ${stepLabel} ended in state ${file.state ?? "unknown"} (no usable URI).`);
  }

  const entry: CachedUpload = {
    uri: file.uri,
    mimeType: file.mimeType || mimeType,
    expiresAt: Date.now() + UPLOAD_CACHE_TTL_MS,
  };
  uploadCache.set(key, entry);
  mintedUriBackend.set(entry.uri, backendId);
  return entry;
}

type GenerateRequest = Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">;

interface AdaptedRequest {
  request: GenerateRequest;
  /** Number of file parts (inline or fileData) the model is EXPECTED to see. */
  fileCount: number;
  /** Rough floor of prompt tokens the attached files must contribute. */
  fileTokenFloor: number;
  /** Total characters of text parts + system instruction (for drop detection). */
  textChars: number;
  /** Human-readable notes about anything that was dropped or downgraded. */
  degraded: string[];
}

/** Gemini bills ≈258 tokens per PDF page. Page count is unknown here, so the
 *  floor assumes VERY heavy pages (1 MB/page — iPhone scans) at half credit:
 *  129 tokens per MB, minimum one page. Deliberately lowballed — a false
 *  "file dropped" alarm on a legitimate response would be worse than a miss;
 *  the floor still catches whole-file drops on file-dominated prompts. */
function fileTokenFloorFor(b64Length: number, mimeType: string): number {
  if (mimeType === "application/pdf") {
    const approxBytes = (b64Length * 3) / 4;
    return Math.max(129, Math.round((approxBytes / 1_000_000) * 129));
  }
  // Images and everything else: at least one 258-token tile at half credit.
  return 129;
}

function collectSystemInstructionChars(request: GenerateRequest): number {
  const si = (request as { config?: { systemInstruction?: unknown } }).config?.systemInstruction;
  if (!si) return 0;
  if (typeof si === "string") return si.length;
  const parts = (si as { parts?: unknown }).parts;
  if (Array.isArray(parts)) {
    return parts.reduce((sum: number, p) => sum + (typeof (p as PartLike)?.text === "string" ? ((p as PartLike).text as string).length : 0), 0);
  }
  return 0;
}

/**
 * Rewrites a request's parts for one backend under one transport mode:
 *  - inline mode keeps inlineData as-is, auto-promoting to uploads only when
 *    the total would blow Google's 20 MB request cap;
 *  - file_api mode uploads every non-trivial inlineData part to THIS backend
 *    (cached) and swaps in the fileData URI, falling back to inline when an
 *    upload fails but the bytes still fit;
 *  - foreign fileData URIs (not uploaded by us to this backend) are kept for
 *    the official API but stripped for the wrapper — its AI Studio account
 *    cannot read files that belong to the official API key's project.
 */
async function adaptRequestForBackend(
  client: GoogleGenAI,
  backendId: BackendId,
  request: GenerateRequest,
  transport: FileTransport,
  progressCallback: (message: string) => void,
  stepLabel: string
): Promise<AdaptedRequest> {
  const degraded: string[] = [];
  let fileCount = 0;
  let fileTokenFloor = 0;
  let textChars = collectSystemInstructionChars(request);
  let inlineTotal = 0;

  if (!Array.isArray(request.contents)) {
    return { request, fileCount, fileTokenFloor, textChars, degraded };
  }

  // Pass 1: adapt each part. `parts: null` = leave the content untouched.
  type Adapted = { part: PartLike; inlineB64Len: number };
  const adaptedContents: { content: Record<string, unknown>; parts: Adapted[] | null }[] = [];
  for (const content of request.contents) {
    if (typeof content !== "object" || content === null || !("parts" in content) || !Array.isArray((content as { parts?: unknown }).parts)) {
      adaptedContents.push({ content: content as Record<string, unknown>, parts: null });
      continue;
    }
    const outParts: Adapted[] = [];
    for (const rawPart of (content as { parts: PartLike[] }).parts) {
      const part = rawPart as PartLike;
      if (typeof part?.text === "string") {
        textChars += part.text.length;
        outParts.push({ part, inlineB64Len: 0 });
        continue;
      }
      if (part?.inlineData?.data) {
        const b64 = part.inlineData.data;
        const mime = part.inlineData.mimeType || "application/octet-stream";
        if (transport === "file_api" && b64.length >= FILE_API_MIN_B64) {
          try {
            const up = await uploadToBackend(client, backendId, b64, mime, progressCallback, stepLabel);
            fileCount++;
            fileTokenFloor += fileTokenFloorFor(b64.length, mime);
            outParts.push({ part: { fileData: { fileUri: up.uri, mimeType: up.mimeType } }, inlineB64Len: 0 });
            continue;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (b64.length <= INLINE_SOFT_LIMIT_B64) {
              console.warn(`[Gemini Files] Upload failed for ${stepLabel} (${backendId}) — sending inline instead: ${msg}`);
              degraded.push(`Upload fehlgeschlagen, Datei wird inline gesendet (${Math.round((b64.length * 3) / 4 / 1024)} KB).`);
              // fall through to inline handling below
            } else {
              throw new FileUploadError(`Upload failed for ${stepLabel} and the file is too large to inline: ${msg}`);
            }
          }
        }
        fileCount++;
        fileTokenFloor += fileTokenFloorFor(b64.length, mime);
        inlineTotal += b64.length;
        outParts.push({ part, inlineB64Len: b64.length });
        continue;
      }
      if (part?.fileData?.fileUri) {
        const mintedFor = mintedUriBackend.get(part.fileData.fileUri);
        if (mintedFor === backendId || backendId === "official") {
          // Ours for this backend, or official (which can read its own
          // project's files — legacy items reference exactly those).
          fileCount++;
          fileTokenFloor += 129;
          outParts.push({ part, inlineB64Len: 0 });
        } else {
          // Foreign URI on the wrapper: its AI Studio account cannot read it.
          // Dropping silently is exactly the failure mode we refuse to have —
          // record it and let the caller-visible note explain the downgrade.
          degraded.push(`fileData-Verweis (${part.fileData.fileUri.split("/").pop()}) ist für den Proxy nicht lesbar und wurde entfernt.`);
          console.warn(`[Gemini Wrapper] Stripped foreign fileData URI for ${stepLabel}: ${part.fileData.fileUri}`);
        }
        continue;
      }
      outParts.push({ part, inlineB64Len: 0 });
    }
    adaptedContents.push({ content: content as Record<string, unknown>, parts: outParts });
  }

  // Pass 2 (inline mode): if the combined inline payload would exceed the
  // request cap, promote the biggest parts to uploads until it fits.
  if (inlineTotal > INLINE_SOFT_LIMIT_B64) {
    const allInline = adaptedContents
      .flatMap((c) => c.parts ?? [])
      .filter((p) => p.inlineB64Len > 0)
      .sort((a, b) => b.inlineB64Len - a.inlineB64Len);
    for (const entry of allInline) {
      if (inlineTotal <= INLINE_SOFT_LIMIT_B64) break;
      const inline = entry.part.inlineData!;
      const up = await uploadToBackend(client, backendId, inline.data, inline.mimeType, progressCallback, stepLabel);
      progressCallback(`Datei zu groß für Inline-Versand — per File-Upload angehängt (${stepLabel}).`);
      inlineTotal -= entry.inlineB64Len;
      entry.part = { fileData: { fileUri: up.uri, mimeType: up.mimeType } };
      entry.inlineB64Len = 0;
    }
  }

  const rebuiltContents = adaptedContents.map(({ content, parts }) =>
    parts === null ? content : { ...content, parts: parts.map((p) => p.part) }
  );

  return {
    request: { ...request, contents: rebuiltContents as GenerateRequest["contents"] },
    fileCount,
    fileTokenFloor,
    textChars,
    degraded,
  };
}

/** Does this request still carry usable content after adaptation? */
function hasSubstantiveParts(contents: unknown): boolean {
  if (!Array.isArray(contents)) return true; // non-array shapes: don't block
  for (const content of contents) {
    const parts = (content as { parts?: unknown })?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (part && typeof part === "object" && Object.keys(part).length > 0) return true;
    }
  }
  return false;
}

/**
 * WRAPPER-only: pin thinking to HIGH for Gemini 3.x text models so wrapper
 * runs match the official API's pro-level depth deterministically.
 *
 * Constraints that shape the gate:
 *  - Gemini 2.5 models reject thinkingLevel with 400 INVALID_ARGUMENT
 *    (probe-verified), and a 400 from the wrapper is NOT fallback-worthy —
 *    it would fail the whole call. The gate must only match Gemini 3.x.
 *  - "lite" tiers stay untouched: they are chosen for latency (translate runs
 *    under maxDuration=60) and HIGH thinking would defeat that choice.
 *  - A caller-provided thinkingConfig always wins.
 *  - The official-API request must stay pristine so the fallback path re-sends
 *    exactly what the caller built.
 */
function withWrapperThinkingHigh(request: GenerateRequest, modelName: string): GenerateRequest {
  const isGemini3Text =
    /^gemini-3/.test(modelName) && !/lite|image|tts|robotics|embed|computer-use/.test(modelName);
  if (!isGemini3Text || request.config?.thinkingConfig) return request;
  return {
    ...request,
    config: { ...request.config, thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } },
  };
}

type GenerateResponse = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

/**
 * Silent-drop tripwire. Preferred signal: usageMetadata.promptTokensDetails —
 * a request whose files reached the model bills a non-TEXT modality (DOCUMENT
 * for PDFs, IMAGE for sketches) with a non-zero token count. Exact: no
 * byte-based estimation, so image-heavy scans (whose bytes-per-page dwarf
 * their billed ~258 tokens/page) can't false-alarm now that the extracted-text
 * ride-along no longer pads the prompt. Backends that omit the per-modality
 * breakdown fall back to the old lowballed byte floor; no usageMetadata at
 * all ⇒ no verdict (lenient by design).
 */
function assertFilesWereSeen(response: GenerateResponse, adapted: AdaptedRequest, backendId: BackendId, stepLabel: string) {
  if (adapted.fileCount === 0) return;
  const usage = response.usageMetadata;
  const promptTokens = usage?.promptTokenCount;
  if (!usage || typeof promptTokens !== "number") {
    console.warn(`[Gemini Files] ${stepLabel} (${backendId}): no usageMetadata — cannot verify the file reached the model.`);
    return;
  }
  const details = usage.promptTokensDetails;
  if (Array.isArray(details) && details.length > 0) {
    // Modality may arrive enum-styled (TEXT vs MODALITY_TEXT); treating any
    // "TEXT"-containing name as text errs toward leniency, never a false alarm.
    const fileTokens = details
      .filter((d) => d.modality && !String(d.modality).includes("TEXT"))
      .reduce((sum, d) => sum + (d.tokenCount ?? 0), 0);
    if (fileTokens === 0) {
      throw new FileDroppedError(
        `${stepLabel} (${backendId}): the ${adapted.fileCount} attached file(s) billed 0 non-text prompt tokens — the file was silently discarded.`
      );
    }
    return;
  }
  // Fallback: text at ~4 chars/token, discounted; file floor already halved.
  const floor = Math.round(adapted.textChars / 4 / 2) + adapted.fileTokenFloor;
  if (promptTokens < floor) {
    throw new FileDroppedError(
      `${stepLabel} (${backendId}): prompt was only ${promptTokens} tokens but the ${adapted.fileCount} attached file(s) require ≥${floor} — the file was silently discarded.`
    );
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  modelName: string,
  request: GenerateRequest,
  progressCallback: (message: string) => void,
  stepLabel: string,
  useAiWrapper: boolean = true,
  /** WRAPPER-only file transport — the official API always uses its native File API (see FileTransport docs). */
  fileTransport: FileTransport = "inline"
) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const callOfficial = async () => {
        // Native Gemini: no base64 toggle — sizable files always go through the
        // official File API; only small parts (scribbles) stay inline.
        const adapted = await adaptRequestForBackend(ai, "official", request, "file_api", progressCallback, stepLabel);
        const res = await withTimeout(ai.models.generateContent({ model: apiModelName(modelName), ...adapted.request }), stepLabel);
        assertFilesWereSeen(res, adapted, "official", stepLabel);
        return res;
      };

      if (!useAiWrapper || !aiWrapper) {
        return await callOfficial();
      }

      // FIRST LINE: AIStudioToAPI proxy, with its own adaptation (its account
      // cannot read official File API URIs; in file_api mode uploads go through
      // the wrapper's /upload proxy instead).
      let adaptedWrapper: AdaptedRequest;
      try {
        adaptedWrapper = await adaptRequestForBackend(aiWrapper, "wrapper", withWrapperThinkingHigh(request, modelName), fileTransport, progressCallback, stepLabel);
      } catch (adaptErr) {
        // Wrapper-side upload failed beyond repair — the official API gets a
        // fresh adaptation (own upload or inline), so this is recoverable.
        const msg = adaptErr instanceof Error ? adaptErr.message : String(adaptErr);
        console.warn(`[Gemini Wrapper] Adaptation failed for ${stepLabel}, falling back to official Gemini API: ${msg}`);
        progressCallback(`Proxy-Upload fehlgeschlagen — wechsle zur offiziellen Gemini API (${stepLabel})...`);
        return await callOfficial();
      }

      // If adaptation left the wrapper request with NO usable content (a legacy
      // item whose only source is an official File API upload), the wrapper
      // would "succeed" on nothing. Use the official API with the full request.
      if (!hasSubstantiveParts(adaptedWrapper.request.contents)) {
        return await callOfficial();
      }
      for (const note of adaptedWrapper.degraded) {
        console.warn(`[Gemini Wrapper] ${stepLabel}: ${note}`);
      }

      try {
        const res = await withTimeout(aiWrapper.models.generateContent({ model: apiModelName(modelName), ...adaptedWrapper.request }), stepLabel);
        assertFilesWereSeen(res, adaptedWrapper, "wrapper", stepLabel);
        return res;
      } catch (wrapperErr) {
        const wrapperError = wrapperErr as Error & { status?: number };
        // Only re-send to the official API when the wrapper failure was the
        // wrapper's own fault (unreachable/5xx/timeout) or a file-delivery
        // failure (dropped file, unreadable upload). A permanent content/4xx
        // (e.g. safety block) would be rejected there too — rethrow it instead.
        if (!wrapperFallbackWorthwhile(wrapperError)) throw wrapperError;
        const reason = wrapperError instanceof FileDroppedError
          ? "Proxy hat die Datei verworfen"
          : isTransient(wrapperError) ? "Proxy überlastet" : "Proxy nicht erreichbar";
        console.warn(`[Gemini Wrapper] ${reason} for ${stepLabel}, falling back to official Gemini API...`, wrapperError.message);
        progressCallback(`${reason} — wechsle zur offiziellen Gemini API (${stepLabel})...`);
        return await callOfficial();
      }
    } catch (err) {
      const error = err as Error & { status?: number };
      // A dropped file on the official API is NOT transient — retrying the
      // identical request would drop it again. Surface it immediately.
      if (error instanceof FileDroppedError || error instanceof FileUploadError) {
        throw error;
      }
      if (attempt === MAX_RETRIES || !isTransient(error)) {
        throw error;
      }
      // The wording used to always say "Hohe Auslastung", which hid network
      // errors, proxy failures and timeouts behind a "high demand" label.
      // Classify the REAL reason and log it (status + message) so the true cause
      // is visible in the server logs instead of a generic "high demand".
      const m = error.message || "";
      const reason =
        error.status === 429 || /quota|Resource has been exhausted/i.test(m)
          ? "Rate-Limit / Kontingent"
          : /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network/i.test(m)
          ? "Netzwerk-/Verbindungsfehler"
          : /timeout|ETIMEDOUT/i.test(m)
          ? "Zeitüberschreitung"
          : "Hohe Auslastung";
      console.warn(`[Gemini Retry] ${stepLabel} Versuch ${attempt}/${MAX_RETRIES} fehlgeschlagen — ${reason} (status=${error.status ?? "n/a"}): ${m}`);
      const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      progressCallback(`${reason} (${stepLabel}). Neuer Versuch in ${Math.round(delayMs / 1000)}s (Versuch ${attempt}/${MAX_RETRIES})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Unreachable");
}
