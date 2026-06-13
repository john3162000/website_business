import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse / pdfjs-dist out of the webpack bundle so their internal
  // worker module ("pdf.worker.mjs") resolves from node_modules at runtime
  // instead of a broken bundled relative path.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // pdfjs loads pdf.worker.mjs via a runtime dynamic import that the serverless
  // file tracer can't follow, so it gets left out of the deployed function.
  // Force it (and the rest of pdfjs's build dir) to be included.
  outputFileTracingIncludes: {
    "/api/scrape/da": ["./node_modules/pdfjs-dist/legacy/build/**"],
  },
};

export default nextConfig;
