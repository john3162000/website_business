import { computeAndSaveScores } from "@/lib/scoring";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const count = await computeAndSaveScores();
    return Response.json({ success: true, count });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const sortBy = searchParams.get("sortBy") ?? "valueScore";
  const minProtein = searchParams.get("minProtein");
  const maxCost = searchParams.get("maxCost");
  const produce = searchParams.get("produce");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const where: Record<string, unknown> = {};
  if (minProtein) where.protein = { gte: parseFloat(minProtein) };
  if (maxCost) where.costPerServing = { lte: parseFloat(maxCost) };

  const validSortFields = ["valueScore", "nutritionScore", "costPerServing", "protein", "calories"];
  const orderField = validSortFields.includes(sortBy) ? sortBy : "valueScore";

  const scores = await prisma.recipeScore.findMany({
    where,
    orderBy: { [orderField]: "desc" },
    take: limit,
    include: {
      recipe: {
        select: {
          id: true,
          title: true,
          slug: true,
          imageUrl: true,
          category: true,
          servings: true,
          ingredients: produce
            ? { where: { name: { contains: produce, mode: "insensitive" } } }
            : { take: 5 },
        },
      },
    },
  });

  // If filtering by produce, only return recipes that actually contain it
  type ScoreWithRecipe = (typeof scores)[0];
  const filtered = produce
    ? scores.filter((s: ScoreWithRecipe) => s.recipe.ingredients.length > 0)
    : scores;

  return Response.json(filtered);
}
