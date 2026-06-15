import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

/** Full detail for a single recipe (ingredients + ordered instructions). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (isNaN(recipeId)) {
    return corsJson({ error: "Invalid recipe id" }, { status: 400 });
  }

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      ingredients: { select: { rawText: true, name: true, amount: true, unit: true } },
      instructions: { orderBy: { stepNumber: "asc" }, select: { stepNumber: true, text: true } },
    },
  });

  if (!recipe) {
    return corsJson({ error: "Recipe not found" }, { status: 404 });
  }

  return corsJson({ recipe });
}

export function OPTIONS() {
  return corsPreflight();
}
