import { NextResponse } from "next/server";

/**
 * Read APIs are consumed by the static SarapSulit site (GitHub Pages / a
 * different origin), so responses need permissive CORS. These are public,
 * read-only endpoints, so `*` is fine.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Successful public GETs are kept by Vercel's CDN for 15 minutes (prices change
 * once a day), so repeat visits and scripted loops don't each recompile every
 * recipe against the database. A route can still send its own Cache-Control.
 */
export const PUBLIC_CACHE = "public, s-maxage=900, stale-while-revalidate=86400";

export function corsJson(data: unknown, init?: ResponseInit, methods = "GET, OPTIONS"): NextResponse {
  const res = NextResponse.json(data, init);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  res.headers.set("Access-Control-Allow-Methods", methods);
  if (methods.startsWith("GET") && res.status < 400 && !res.headers.has("Cache-Control")) {
    res.headers.set("Cache-Control", PUBLIC_CACHE);
  }
  return res;
}

/** methods: e.g. "POST, OPTIONS" for /api/dish, which computes but stores nothing. */
export function corsPreflight(methods = "GET, OPTIONS"): NextResponse {
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": methods } });
}
