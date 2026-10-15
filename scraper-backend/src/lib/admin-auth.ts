/**
 * Scrape POST routes start or restart long jobs, so they are admin-only once
 * ADMIN_TOKEN is set in the environment. The admin page sends it in the
 * `x-admin-token` header. Without ADMIN_TOKEN the routes stay open (local dev).
 */
export function requireAdmin(request: Request): Response | null {
  // Trim both sides: values pasted into Vercel or the admin box often carry a
  // stray space or newline that makes an otherwise correct token fail.
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) return null;
  if ((request.headers.get("x-admin-token") ?? "").trim() === token) return null;
  return Response.json({ error: "Admin token missing or wrong. Enter it at the top of /admin." }, { status: 401 });
}
