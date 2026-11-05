import type { DishInput } from "./recipe-compile/load.ts";

/** POST /api/dish takes at most this many ingredient lines. */
export const MAX_LINES = 60;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : null);
// Catalog slugs are lower-case words joined by "_" (pork_belly); anything else is ignored.
const slugOf = (v: unknown) => (typeof v === "string" && /^[a-z0-9_]{1,60}$/.test(v) ? v : null);

/** Checks and trims a personal dish from the request body; null when it isn't one. */
export function parseDish(body: unknown): DishInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.ingredients) || b.ingredients.length > MAX_LINES) return null;
  const servings = typeof b.servings === "number" || typeof b.servings === "string" ? Number(b.servings) : NaN;
  const ingredients = b.ingredients.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const i = x as Record<string, unknown>;
    const name = str(i.name, 120);
    if (!name) return [];
    return [{ name, amount: str(i.amount, 20) || null, unit: str(i.unit, 20) || null, slug: slugOf(i.slug) }];
  });
  return {
    title: str(b.title, 120) || "My dish",
    servings: Number.isFinite(servings) && servings >= 1 && servings <= 50 ? Math.round(servings) : null,
    ingredients,
    instructions: Array.isArray(b.instructions) ? b.instructions.slice(0, 30).map((s) => str(s, 500) ?? "").filter(Boolean) : [],
  };
}
