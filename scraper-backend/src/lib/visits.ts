/**
 * Counting SarapSulit's users by IP address (POST /api/visit), without keeping the address:
 * each IP becomes a salted SHA-256 code, so the same visitor counts once per day and can be
 * recognised as returning, but the code can't be turned back into the IP. Location is the
 * country / region / city Vercel derives from the IP (x-vercel-ip-* headers).
 *
 * Pure: the route and the tests share these.
 */
import { createHash } from "node:crypto";

/** The visitor's IP: the first address in x-forwarded-for, or x-real-ip. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || null;
}

/** A salted hash of the IP: stable for the same IP and salt, not reversible. 32 hex characters. */
export function visitorCode(ip: string, salt: string): string {
  return createHash("sha256").update(`sarapsulit-visit:${salt}:${ip}`).digest("hex").slice(0, 32);
}

const decode = (v: string | null) => {
  if (!v) return null;
  try {
    return decodeURIComponent(v).slice(0, 80) || null;
  } catch {
    return v.slice(0, 80) || null;
  }
};

/** Country (ISO code), region code and city from Vercel's geolocation headers (city is URL-encoded). */
export function geoFrom(headers: Headers): { country: string | null; region: string | null; city: string | null } {
  return {
    country: decode(headers.get("x-vercel-ip-country")),
    region: decode(headers.get("x-vercel-ip-country-region")),
    city: decode(headers.get("x-vercel-ip-city")),
  };
}

// Crawlers, link previews and monitoring: not people.
const BOT_UA = /bot|crawler|spider|crawling|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|curl|wget|python-requests|node-fetch|axios/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}

/** The day in Manila time (UTC+8), "2026-11-03", so a visit at 7am Manila counts that day. */
export function manilaDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** The days from `days - 1` days before `today` up to `today`, oldest first. */
export function lastDays(today: string, days: number): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86400_000).toISOString().slice(0, 10));
}
