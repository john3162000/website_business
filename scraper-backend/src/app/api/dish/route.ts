import { corsJson, corsPreflight } from "@/lib/cors";
import { compileDish, type DishInput } from "@/lib/recipe-compile/load";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const METHODS = "POST, OPTIONS";
const MAX_LINES = 60;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : null);

/** Checks and trims a personal dish from the request body; null when it isn't one. */
function parseDish(body: unknown): DishInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.ingredients) || b.ingredients.length > MAX_LINES) return null;
  const servings = Number(b.servings);
  const ingredients = b.ingredients.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const i = x as Record<string, unknown>;
    const name = str(i.name, 120);
    if (!name) return [];
    return [{ name, amount: str(i.amount, 20) || null, unit: str(i.unit, 20) || null, slug: str(i.slug, 60) }];
  });
  return {
    title: str(b.title, 120) || "My dish",
    servings: Number.isFinite(servings) && servings >= 1 && servings <= 50 ? Math.round(servings) : null,
    ingredients,
    instructions: Array.isArray(b.instructions) ? b.instructions.slice(0, 30).map((s) => str(s, 500) ?? "").filter(Boolean) : [],
  };
}

/**
 * Cost and nutrition of a personal dish, with the same engine as the site's
 * recipes, and its cost per serving on each day of stored DA prices. Nothing is
 * stored: the site keeps dishes on the device.
 *
 * POST /api/dish  { title, servings, ingredients: [{ amount, unit, name, slug? }], instructions? }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
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
