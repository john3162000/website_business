import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { ensureFeedbackTable } from "@/lib/ensure-schema";
import { parseFeedback } from "@/lib/feedback";

export const dynamic = "force-dynamic";

const METHODS = "GET, POST, OPTIONS";
const MAX_BODY = 8_000;
const PER_HOUR = 5;

/**
 * POST /api/feedback  { kind: "review"|"suggestion"|"problem", rating?, message, name?, contact?, page?, lang? }
 * Saves a review or suggestion from the site. At most 5 an hour from one address; the address
 * is kept only as a hash for that limit.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return corsJson({ error: "Too long" }, { status: 413 }, METHODS);
  const text = await request.text();
  if (text.length > MAX_BODY) return corsJson({ error: "Too long" }, { status: 413 }, METHODS);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return corsJson({ error: "Body must be JSON" }, { status: 400 }, METHODS);
  }
  const fb = parseFeedback(body);
  // A bot gets the same answer as a person, so it doesn't learn to skip the hidden field.
  if ("spam" in fb) return corsJson({ ok: true }, undefined, METHODS);
  if ("error" in fb) return corsJson({ error: fb.error }, { status: 400 }, METHODS);

  await ensureFeedbackTable();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const ipHash = createHash("sha256").update(`sarapsulit:${ip}`).digest("hex").slice(0, 32);
  const recent = await prisma.feedback.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= PER_HOUR) return corsJson({ error: "Thank you! You've sent a lot this hour; please try again later." }, { status: 429 }, METHODS);
  await prisma.feedback.create({ data: { ...fb, ipHash } });
  return corsJson({ ok: true }, undefined, METHODS);
}

/** GET /api/feedback: the latest 300, newest first (admin only, `x-admin-token`). */
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  await ensureFeedbackTable();
  const rows = await prisma.feedback.findMany({ orderBy: { id: "desc" }, take: 300, omit: { ipHash: true } });
  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}

export function OPTIONS() {
  return corsPreflight(METHODS);
}
