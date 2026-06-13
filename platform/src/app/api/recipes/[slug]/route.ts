import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      ingredients: true,
      score: true,
    },
  });

  if (!recipe) {
    return Response.json({ error: "Recipe not found" }, { status: 404 });
  }

  // For each ingredient, fetch matched commodity price and nutrition
  const enriched = await Promise.all(
    recipe.ingredients.map(async (ing: typeof recipe.ingredients[number]) => {
      const commodity = await prisma.commodity.findFirst({
        where: { name: { contains: ing.name.split(" ")[0], mode: "insensitive" } },
        orderBy: { date: "desc" },
      });

      const nutrition = await prisma.nutritionFact.findFirst({
        where: { ingredientName: { contains: ing.name.split(" ")[0], mode: "insensitive" } },
      });

      return {
        ...ing,
        commodity: commodity
          ? { name: commodity.name, avgPrice: commodity.avgPrice, unit: commodity.unit }
          : null,
        nutrition: nutrition
          ? {
              calories: nutrition.calories,
              protein: nutrition.protein,
              carbohydrates: nutrition.carbohydrates,
              fat: nutrition.fat,
              vitaminC: nutrition.vitaminC,
              iron: nutrition.iron,
            }
          : null,
      };
    })
  );

  return Response.json({ ...recipe, ingredients: enriched });
}
