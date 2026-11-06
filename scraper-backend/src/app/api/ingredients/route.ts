import { corsJson, corsPreflight } from "@/lib/cors";
import { checkQuery } from "@/lib/query-guard";
import { ingredientList } from "@/lib/recipe-compile/load";

export const dynamic = "force-dynamic";

/** Catalog ingredients for the personal dish picker (label, slug, units, price source). */
export async function GET(request: Request) {
  const q = checkQuery(request.url);
  if (!q.ok) return corsJson({ error: q.error }, { status: 400 });
  const ingredients = await ingredientList();
  return corsJson(
    { count: ingredients.length, ingredients },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
