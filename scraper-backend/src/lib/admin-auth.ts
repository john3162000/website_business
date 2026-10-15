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
  const sent = (request.headers.get("x-admin-token") ?? "").trim();
  if (sent === token) return null;
  // Say how the two differ without revealing the token: lengths, and whether the
  // saved value is wrapped in quotes (a common copy-paste mistake in Vercel).
  const quoted = /^["'].*["']$/.test(token) ? " The token saved in Vercel is wrapped in quotes; remove them there." : "";
  const hint = sent ? ` You entered ${sent.length} characters; the server's token has ${token.length}.${quoted}` : " No token was entered.";
  return Response.json({ error: `Admin token missing or wrong.${hint} Enter it at the top of /admin.` }, { status: 401 });
}
