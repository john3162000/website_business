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
    "/api/cron/da-daily": ["./node_modules/pdfjs-dist/legacy/build/**"],
  },
  poweredByHeader: false,
  // Basic hardening on every response. No page here is meant to be framed, and
  // /admin keeps the admin token in the browser, so framing is refused.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
      {
        // The admin page holds the admin token: only its own scripts may run there. Next's
        // hydration needs inline scripts, so 'unsafe-inline' stays; outside code can't load.
        source: "/admin/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
