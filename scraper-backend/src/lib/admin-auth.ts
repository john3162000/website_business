/**
 * Scrape POST routes start or restart long jobs, so they are admin-only once
 * ADMIN_TOKEN is set in the environment. The admin page sends it in the
 * `x-admin-token` header. Without ADMIN_TOKEN the routes stay open (local dev).
 */
export function requireAdmin(request: Request): Response | null {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return null;
  if (request.headers.get("x-admin-token") === token) return null;
  return Response.json({ error: "Admin token missing or wrong. Enter it at the top of /admin." }, { status: 401 });
}
