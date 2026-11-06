/**
 * Where the next hop is sent: the production domain. Inside a function `request.url` can be the
 * deployment's own *.vercel.app URL, which Vercel Authentication guards ("all except custom
 * domains"), while the production domains stay public. The likely reason the 2026-10-29 crawl
 * stopped after its first hop.
 */
export function hopOrigin(request: Request, url: URL, prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL, vercelEnv = process.env.VERCEL_ENV): string | null {
  // In production the hop carries the cron secret: never send it to a host taken from the request.
  if (!prodHost?.trim() && vercelEnv === "production") return null;
  const host = prodHost?.trim() || request.headers.get("x-forwarded-host")?.split(",")[0].trim() || url.host;
  return `https://${host.replace(/^https?:\/\//, "")}`;
}
