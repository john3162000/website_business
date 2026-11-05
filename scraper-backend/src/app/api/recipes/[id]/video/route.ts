import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { checkQuery, isId } from "@/lib/query-guard";
import { extractVideoLinks, videoSearchLinks } from "@/lib/scrapers/video-links.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// A recipe's video rarely changes: let the CDN keep the answer for a week.
const CACHE = { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" };
// The same honest name as the recipe crawl.
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; SarapSulitBot/1.0; +https://john3162000.github.io/website_business/)" };

/**
 * "How to cook" videos for one recipe, read from its Panlasang Pinoy page when asked.
 *
 * GET /api/recipes/123/video → { youtube, tiktok, search: { youtube, tiktok } }
 * `youtube` / `tiktok` are the recipe's own videos (null when the page has none); `search`
 * always has YouTube and TikTok search links for the dish.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const q = checkQuery(request.url);
  if (!q.ok) return corsJson({ error: q.error }, { status: 400 });
  const raw = (await params).id;
  if (!isId(raw)) return corsJson({ error: "Invalid recipe id" }, { status: 400 });
  const id = Number(raw);
  const recipe = await prisma.recipe.findUnique({ where: { id }, select: { title: true, url: true } });
  if (!recipe) return corsJson({ error: "Recipe not found" }, { status: 404 });
  const search = videoSearchLinks(recipe.title);
  try {
    const res = await fetch(recipe.url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return corsJson({ ...extractVideoLinks(await res.text()), search }, { headers: CACHE });
  } catch {
    // The page couldn't be read: search links only, cached briefly so it is retried soon.
    return corsJson({ youtube: null, tiktok: null, search }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  }
}

export function OPTIONS() {
  return corsPreflight();
}
