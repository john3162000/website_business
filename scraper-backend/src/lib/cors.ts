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

export function corsJson(data: unknown, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(data, init);
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
