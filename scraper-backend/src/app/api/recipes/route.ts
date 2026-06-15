import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

/**
 * Static Panlasang Pinoy recipe list for the SarapSulit site (cards + filters).
 * Includes ingredients with amount/unit (so the client can estimate per-serving
 * nutrition & cost) but not full instructions — fetch /api/recipes/{id} for that.
 */
export async function GET() {
  const recipes = await prisma.recipe.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      url: true,
      imageUrl: true,
      description: true,
      servings: true,
      prepTime: true,
      cookTime: true,
      ingredients: { select: { name: true, amount: true, unit: true } },
    },
  });

  const list = recipes.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    imageUrl: r.imageUrl,
    description: r.description,
    servings: r.servings,
    prepTime: r.prepTime,
    cookTime: r.cookTime,
    ingredients: r.ingredients
      .filter((i) => i.name)
      .map((i) => ({ name: i.name, amount: i.amount, unit: i.unit })),
  }));

  return corsJson({ count: list.length, recipes: list });
}

export function OPTIONS() {
  return corsPreflight();
}
