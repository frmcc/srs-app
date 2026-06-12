/**
 * Shared PDF→text extraction (used by the grading pipeline and the
 * quiz generator). pdf-parse is loaded lazily via dynamic import so it
 * only initializes when a PDF actually arrives, and the DOMMatrix shim
 * it needs on Node is applied exactly once.
 */

function ensureDomMatrixShim() {
  if (typeof (global as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
    (global as { DOMMatrix?: unknown }).DOMMatrix = class DOMMatrix {};
  }
}

export async function pdfToText(buffer: Buffer): Promise<string> {
  ensureDomMatrixShim();
  const { PDFParse } = await import("pdf-parse");
  // NB: the previous require()-based code passed the Uint8Array directly and
  // returned getText() unawaited-unwrapped — i.e. "[object Object]". The
  // correct v2 API is { data } + TextResult.text.
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
