import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse / pdfjs-dist out of the webpack bundle so their internal
  // worker module ("pdf.worker.mjs") resolves from node_modules at runtime
  // instead of a broken bundled relative path.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
