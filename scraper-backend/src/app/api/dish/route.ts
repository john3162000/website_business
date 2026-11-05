import { corsJson, corsPreflight } from "@/lib/cors";
import { compileDish } from "@/lib/recipe-compile/load";
import { MAX_LINES, parseDish } from "@/lib/dish-input";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const METHODS = "POST, OPTIONS";
const MAX_BODY = 64_000;

/**
 * Cost and nutrition of a personal dish, with the same engine as the site's
 * recipes, and its cost per serving on each day of stored DA prices. Nothing is
 * stored: the site keeps dishes on the device.
 *
 * POST /api/dish  { title, servings, ingredients: [{ amount, unit, name, slug? }], instructions? }
 */
export async function POST(request: Request) {
  // 60 lines of short fields fit in a few KB; refuse anything far bigger before parsing it.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return corsJson({ error: "Body too large" }, { status: 413 }, METHODS);
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return corsJson({ error: "Body too large" }, { status: 413 }, METHODS);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return corsJson({ error: "Body must be JSON" }, { status: 400 }, METHODS);
  }
  const dish = parseDish(body);
  if (!dish) return corsJson({ error: `Send { servings, ingredients: [{ amount, unit, name, slug? }] } with up to ${MAX_LINES} lines` }, { status: 400 }, METHODS);
  return corsJson(await compileDish(dish), undefined, METHODS);
}

export function OPTIONS() {
  return corsPreflight(METHODS);
}
