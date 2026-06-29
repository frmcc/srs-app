import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse"],
  // pdf-parse pulls in pdfjs-dist, which loads its worker (pdf.worker.mjs) via a
  // runtime import Next's file tracer can't follow. In the standalone build that
  // file is omitted, so PDF text extraction crashes on Cloud Run with
  // "Cannot find module .../pdfjs-dist/legacy/build/pdf.worker.mjs". Force-include
  // the worker for the API routes that read PDFs (quiz generation + grading).
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ],
  },
};

export default nextConfig;
