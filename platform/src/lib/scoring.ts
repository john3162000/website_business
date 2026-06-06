/**
 * Scoring engine — computes per-recipe nutrition and cost metrics.
 *
 * nutritionScore: weighted composite of key nutrients per serving (higher = more nutritious)
 * valueScore:     nutritionScore / costPerServing (higher = better bang-per-peso)
 */

import { prisma } from "@/lib/db";

// Weights for each nutrient in the composite nutrition score
const WEIGHTS = {
  protein: 3.0,       // g — most important for muscle / satiety
  fiber: 2.0,         // g — digestive health
  vitaminC: 1.5,      // mg
  iron: 1.5,          // mg
  calcium: 1.0,       // mg
  vitaminA: 1.0,      // mcg RE
  carbohydrates: 0.5, // g — energy but shouldn't dominate
  fat: -0.3,          // g — slight penalty for high fat
};

// Daily Reference Values used for normalization
const DRV = {
  protein: 50,        // g
  fiber: 25,          // g
  vitaminC: 60,       // mg
  iron: 18,           // mg
  calcium: 1000,      // mg
  vitaminA: 900,      // mcg RE
  carbohydrates: 275, // g
  fat: 78,            // g
};

export function computeNutritionScore(nutrients: {
  protein?: number | null;
  fiber?: number | null;
  vitaminC?: number | null;
  iron?: number | null;
  calcium?: number | null;
  vitaminA?: number | null;
  carbohydrates?: number | null;
  fat?: number | null;
}): number {
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const val = nutrients[key as keyof typeof WEIGHTS] ?? 0;
    const drv = DRV[key as keyof typeof DRV];
    score += (val / drv) * weight * 100;
  }
  return Math.max(0, Math.round(score * 10) / 10);
}

function findCommodityPrice(
  ingredientName: string,
  commodities: { name: string; localName?: string | null; avgPrice: number; unit: string }[]
): number | null {
  const normalized = ingredientName.toLowerCase();

  for (const c of commodities) {
    if (
      c.name.toLowerCase() === normalized ||
      c.localName?.toLowerCase() === normalized
    ) {
      return c.avgPrice;
    }
  }

  // Partial match — ingredient name contains commodity name or vice versa
  for (const c of commodities) {
    const cName = c.name.toLowerCase();
    if (normalized.includes(cName) || cName.includes(normalized.split(" ")[0])) {
      return c.avgPrice;
    }
  }

  return null;
}

export async function computeAndSaveScores(): Promise<number> {
  const recipes = await prisma.recipe.findMany({
    include: { ingredients: true },
  });

  const latestDate = await prisma.commodity.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const commodities = latestDate
    ? await prisma.commodity.findMany({
        where: { date: latestDate.date },
      })
    : [];

  type NutritionFactRow = Awaited<ReturnType<typeof prisma.nutritionFact.findMany>>[0];
  const nutritionFacts: NutritionFactRow[] = await prisma.nutritionFact.findMany();
  const nutritionMap = new Map<string, NutritionFactRow>(nutritionFacts.map((n) => [n.ingredientName.toLowerCase(), n]));

  let updated = 0;

  for (const recipe of recipes) {
    const servings = recipe.servings ?? 4;

    // Estimate ingredient costs
    let totalCost = 0;
    for (const ing of recipe.ingredients) {
      const price = findCommodityPrice(ing.name, commodities);
      if (price !== null) {
        // Assume ~100g portion per ingredient if unit unknown
        const qty = ing.quantity ?? 100;
        totalCost += (price / 1000) * qty; // price per gram * quantity
      }
    }

    // Aggregate nutrition per serving
    const perServing = {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
      vitaminA: 0,
      vitaminC: 0,
      iron: 0,
      calcium: 0,
    };

    for (const ing of recipe.ingredients) {
      const nutrition =
        nutritionMap.get(ing.name.toLowerCase()) ??
        [...nutritionMap.entries()].find(([key]: [string, unknown]) =>
          ing.name.toLowerCase().includes(key) || key.includes(ing.name.toLowerCase().split(" ")[0])
        )?.[1] as (typeof nutritionFacts)[0] | undefined;

      if (!nutrition) continue;

      const factor = (ing.quantity ?? 100) / 100 / servings;
      perServing.calories += (nutrition.calories ?? 0) * factor;
      perServing.protein += (nutrition.protein ?? 0) * factor;
      perServing.carbohydrates += (nutrition.carbohydrates ?? 0) * factor;
      perServing.fat += (nutrition.fat ?? 0) * factor;
      perServing.fiber += (nutrition.fiber ?? 0) * factor;
      perServing.vitaminA += (nutrition.vitaminA ?? 0) * factor;
      perServing.vitaminC += (nutrition.vitaminC ?? 0) * factor;
      perServing.iron += (nutrition.iron ?? 0) * factor;
      perServing.calcium += (nutrition.calcium ?? 0) * factor;
    }

    const costPerServing = servings > 0 && totalCost > 0 ? totalCost / servings : null;
    const nutritionScore = computeNutritionScore(perServing);
    const valueScore =
      costPerServing && costPerServing > 0
        ? Math.round((nutritionScore / costPerServing) * 10) / 10
        : null;

    await prisma.recipeScore.upsert({
      where: { recipeId: recipe.id },
      create: {
        recipeId: recipe.id,
        estimatedCost: totalCost > 0 ? Math.round(totalCost * 100) / 100 : null,
        servings,
        costPerServing: costPerServing ? Math.round(costPerServing * 100) / 100 : null,
        calories: Math.round(perServing.calories * 10) / 10,
        protein: Math.round(perServing.protein * 10) / 10,
        carbohydrates: Math.round(perServing.carbohydrates * 10) / 10,
        fat: Math.round(perServing.fat * 10) / 10,
        fiber: Math.round(perServing.fiber * 10) / 10,
        vitaminA: Math.round(perServing.vitaminA * 10) / 10,
        vitaminC: Math.round(perServing.vitaminC * 10) / 10,
        iron: Math.round(perServing.iron * 10) / 10,
        calcium: Math.round(perServing.calcium * 10) / 10,
        nutritionScore,
        valueScore,
      },
      update: {
        estimatedCost: totalCost > 0 ? Math.round(totalCost * 100) / 100 : null,
        servings,
        costPerServing: costPerServing ? Math.round(costPerServing * 100) / 100 : null,
        calories: Math.round(perServing.calories * 10) / 10,
        protein: Math.round(perServing.protein * 10) / 10,
        carbohydrates: Math.round(perServing.carbohydrates * 10) / 10,
        fat: Math.round(perServing.fat * 10) / 10,
        fiber: Math.round(perServing.fiber * 10) / 10,
        vitaminA: Math.round(perServing.vitaminA * 10) / 10,
        vitaminC: Math.round(perServing.vitaminC * 10) / 10,
        iron: Math.round(perServing.iron * 10) / 10,
        calcium: Math.round(perServing.calcium * 10) / 10,
        nutritionScore,
        valueScore,
        computedAt: new Date(),
      },
    });

    updated++;
  }

  return updated;
}
