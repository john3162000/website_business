import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

/**
 * Static FNRI Food Composition Table data for the SarapSulit site.
 * Optional `?q=` filters by food name (case-insensitive contains).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

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
    },
  });

  return corsJson({ count: facts.length, facts });
}

export function OPTIONS() {
  return corsPreflight();
}
