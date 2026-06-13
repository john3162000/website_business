import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import NutritionLabel from "@/components/NutritionLabel";

export const dynamic = "force-dynamic";

interface EnrichedIngredient {
  id: number;
  name: string;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  commodity: { name: string; avgPrice: number; unit: string } | null;
  nutrition: { calories: number | null; protein: number | null; carbohydrates: number | null; fat: number | null; vitaminC: number | null; iron: number | null } | null;
}

async function getRecipe(slug: string) {
  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: { ingredients: true, score: true },
  });
  if (!recipe) return null;

  const latestDate = await prisma.commodity.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });

  type RecipeIngredientRow = typeof recipe.ingredients[0];
  const enriched: EnrichedIngredient[] = await Promise.all(
    recipe.ingredients.map(async (ing: RecipeIngredientRow) => {
      const keyword = ing.name.split(" ")[0];

      const commodity = latestDate
        ? await prisma.commodity.findFirst({
            where: {
              date: latestDate.date,
              name: { contains: keyword, mode: "insensitive" },
            },
          })
        : null;

      const nutrition = await prisma.nutritionFact.findFirst({
        where: { ingredientName: { contains: keyword, mode: "insensitive" } },
      });

      return {
        id: ing.id,
        name: ing.name,
        rawText: ing.rawText,
        quantity: ing.quantity,
        unit: ing.unit,
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

  return { ...recipe, ingredients: enriched };
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const recipe = await getRecipe(slug);
  if (!recipe) notFound();

  const instructions = recipe.instructions
    ? recipe.instructions.split("\n\n").filter(Boolean)
    : [];

  const score = recipe.score;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="grid lg:grid-cols-3 gap-10">
        {/* Left: Recipe details */}
        <div className="lg:col-span-2">
          {recipe.imageUrl && (
            <div className="relative h-72 rounded-2xl overflow-hidden mb-6 bg-amber-100">
              <Image
                src={recipe.imageUrl}
                alt={recipe.title}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          )}

          <h1 className="text-3xl font-bold mb-2">{recipe.title}</h1>

          <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-4">
            {recipe.category && (
              <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-medium">
                {recipe.category}
              </span>
            )}
            {recipe.servings && <span>🍽️ {recipe.servings} servings</span>}
            {recipe.totalTime && <span>⏱️ {recipe.totalTime} min</span>}
            {recipe.prepTime && <span>Prep: {recipe.prepTime} min</span>}
            {recipe.cookTime && <span>Cook: {recipe.cookTime} min</span>}
          </div>

          {recipe.description && (
            <p className="text-gray-600 leading-relaxed mb-6">{recipe.description}</p>
          )}

          {/* Score badges */}
          {score && (
            <div className="flex flex-wrap gap-3 mb-8">
              {score.valueScore != null && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{score.valueScore.toFixed(1)}</p>
                  <p className="text-xs text-green-600 font-medium">Sulit Score</p>
                </div>
              )}
              {score.costPerServing != null && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">₱{score.costPerServing.toFixed(2)}</p>
                  <p className="text-xs text-amber-600 font-medium">Per Serving</p>
                </div>
              )}
              {score.nutritionScore != null && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{score.nutritionScore.toFixed(1)}</p>
                  <p className="text-xs text-blue-600 font-medium">Nutrition Score</p>
                </div>
              )}
            </div>
          )}

          {/* Ingredients */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Ingredients</h2>
            <div className="space-y-2">
              {recipe.ingredients.map((ing: EnrichedIngredient) => (
                <div
                  key={ing.id}
                  className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-sm">{ing.rawText}</p>
                    {ing.commodity && (
                      <p className="text-xs text-gray-400">
                        DA Price: ₱{ing.commodity.avgPrice.toFixed(2)}/{ing.commodity.unit}
                      </p>
                    )}
                  </div>
                  {ing.nutrition?.calories != null && (
                    <span className="text-xs text-gray-400 tabular-nums ml-4 shrink-0">
                      {ing.nutrition.calories.toFixed(0)} kcal/100g
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          {instructions.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4">Instructions</h2>
              <ol className="space-y-4">
                {instructions.map((step: string, i: number) => (
                  <li key={i} className="flex gap-4">
                    <span className="flex-shrink-0 w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </span>
                    <p className="text-gray-700 leading-relaxed pt-1">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Recipe sourced from{" "}
            <a
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-green-700"
            >
              Panlasang Pinoy
            </a>
          </p>
        </div>

        {/* Right: Nutrition sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-6">
            {score && (
              <NutritionLabel
                calories={score.calories}
                protein={score.protein}
                carbohydrates={score.carbohydrates}
                fat={score.fat}
                fiber={score.fiber}
                vitaminA={score.vitaminA}
                vitaminC={score.vitaminC}
                iron={score.iron}
                calcium={score.calcium}
                servings={score.servings}
              />
            )}

            {/* Cost breakdown */}
            {score?.estimatedCost != null && (
              <div className="bg-white rounded-2xl shadow p-4">
                <h3 className="font-bold mb-3 text-gray-900">Estimated Cost</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total dish cost</span>
                    <span className="font-bold">₱{score.estimatedCost.toFixed(2)}</span>
                  </div>
                  {score.servings && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Servings</span>
                      <span>{score.servings}</span>
                    </div>
                  )}
                  {score.costPerServing && (
                    <div className="flex justify-between border-t pt-1 mt-1 font-semibold text-green-700">
                      <span>Cost per serving</span>
                      <span>₱{score.costPerServing.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Based on latest DA market prices
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
