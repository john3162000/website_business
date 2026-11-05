import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { checkQuery, textUpTo } from "@/lib/query-guard";
import { ensureNutritionColumns } from "@/lib/ensure-schema";

export const dynamic = "force-dynamic";

/**
 * Static FNRI Food Composition Table data for the SarapSulit site.
 * Optional `?q=` filters by food name (case-insensitive contains).
 */
export async function GET(request: Request) {
  const check = checkQuery(request.url, { q: textUpTo(60) });
  if (!check.ok) return corsJson({ error: check.error }, { status: 400 });
  const q = check.params.get("q")?.trim();
  await ensureNutritionColumns();

  const facts = await prisma.nutritionFact.findMany({
    where: q ? { foodName: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { foodName: "asc" },
    select: {
      foodCode: true,
      foodName: true,
      calories: true,
      protein: true,
      fat: true,
      carbohydrates: true,
      fiber: true,
      calcium: true,
      iron: true,
      vitaminA: true,
      vitaminB1: true,
      vitaminB2: true,
      vitaminC: true,
      sodium: true,
      altNames: true,
      scientificName: true,
      ediblePortion: true,
    },
  });

  return corsJson({ count: facts.length, facts });
}

export function OPTIONS() {
  return corsPreflight();
}
