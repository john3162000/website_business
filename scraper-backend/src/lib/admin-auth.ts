import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string compare: hashing first gives both sides the same length. */
export function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

// A missing secret locks the route in production instead of opening it; local dev stays open.
const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Scrape routes start or restart long jobs and show the job logs, so they are
 * admin-only. The admin page sends ADMIN_TOKEN in the `x-admin-token` header.
 * Without ADMIN_TOKEN the routes are closed in production and open in local dev.
 */
export function requireAdmin(request: Request): Response | null {
  // Trim both sides: values pasted into Vercel or the admin box often carry a
  // stray space or newline that makes an otherwise correct token fail.
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) {
    if (!isProduction()) return null;
    return Response.json({ error: "Admin routes are off: set ADMIN_TOKEN in Vercel, then redeploy." }, { status: 503 });
  }
  const sent = (request.headers.get("x-admin-token") ?? "").trim();
  if (sent && safeEqual(sent, token)) return null;
  // Point at the common copy-paste mistake without saying anything about the token itself.
  const quoted = /^["'].*["']$/.test(token) ? " The token saved in Vercel is wrapped in quotes; remove them there." : "";
  const hint = sent ? quoted : " No token was entered.";
  return Response.json({ error: `Admin token missing or wrong.${hint} Enter it at the top of /admin.` }, { status: 401 });
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET
 * the cron routes are closed in production and open in local dev.
 */
export function requireCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (!isProduction()) return null;
    return Response.json({ error: "Cron is off: set CRON_SECRET in Vercel, then redeploy." }, { status: 503 });
  }
  if (safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
