import { corsJson, corsPreflight } from "@/lib/cors";
import { ingredientList } from "@/lib/recipe-compile/load";

export const dynamic = "force-dynamic";

/** Catalog ingredients for the personal dish picker (label, slug, units, price source). */
export async function GET() {
  const ingredients = await ingredientList();
  return corsJson(
    { count: ingredients.length, ingredients },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
