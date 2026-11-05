import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { checkQuery, isId } from "@/lib/query-guard";
import { ensureRecipeColumns } from "@/lib/ensure-schema";

export const dynamic = "force-dynamic";

/** Full detail for a single recipe (ingredients + ordered instructions). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = checkQuery(request.url);
  if (!q.ok) return corsJson({ error: q.error }, { status: 400 });
  if (!isId(id)) {
    return corsJson({ error: "Invalid recipe id" }, { status: 400 });
  }
  const recipeId = Number(id);

  await ensureRecipeColumns();
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      ingredients: { orderBy: { id: "asc" }, select: { id: true, rawText: true, name: true, amount: true, unit: true } },
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
