import Link from "next/link";
import { prisma } from "@/lib/db";
import RecipeCard from "@/components/RecipeCard";

export const dynamic = "force-dynamic";

async function getTopRecipes() {
  return prisma.recipeScore.findMany({
    where: { valueScore: { not: null } },
    orderBy: { valueScore: "desc" },
    take: 8,
    include: {
      recipe: {
        select: {
          id: true,
          title: true,
          slug: true,
          imageUrl: true,
          category: true,
          servings: true,
        },
      },
    },
  });
}

async function getStats() {
  const [recipeCount, nutritionCount, commodityDate] = await Promise.all([
    prisma.recipe.count(),
    prisma.nutritionFact.count(),
    prisma.commodity.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  return { recipeCount, nutritionCount, commodityDate: commodityDate?.date };
}

export default async function HomePage() {
  const [topScores, stats] = await Promise.all([getTopRecipes(), getStats()]);

  type TopScore = Awaited<ReturnType<typeof getTopRecipes>>[0];
  const topRecipes = topScores.map((s: TopScore) => ({
    ...s.recipe,
    score: {
      valueScore: s.valueScore,
      nutritionScore: s.nutritionScore,
      costPerServing: s.costPerServing,
      calories: s.calories,
      protein: s.protein,
    },
  }));

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-green-800 to-green-600 text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            Masarap, Masustansya, <span className="text-amber-300">Sulit!</span>
          </h1>
          <p className="text-lg text-green-100 mb-8 max-w-xl mx-auto">
            Discover the best Filipino dishes to cook — ranked by nutritional value and current
            market prices from the Department of Agriculture.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/browse"
              className="bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold px-8 py-3 rounded-full transition-colors shadow-lg"
            >
              Browse Recipes
            </Link>
            <Link
              href="/browse?sortBy=costPerServing"
              className="bg-white/20 hover:bg-white/30 text-white font-semibold px-8 py-3 rounded-full transition-colors border border-white/40"
            >
              Cheapest Nutritious Dishes
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-green-700 text-white py-4">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-8 text-center text-sm">
          <div>
            <p className="text-2xl font-bold text-amber-300">{stats.recipeCount}</p>
            <p className="text-green-200">Recipes</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-300">{stats.nutritionCount}</p>
            <p className="text-green-200">Food Items in DB</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-300">
              {stats.commodityDate
                ? new Date(stats.commodityDate).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"}
            </p>
            <p className="text-green-200">Latest DA Prices</p>
          </div>
        </div>
      </section>

      {/* Top Recipes */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Top Value Dishes</h2>
            <p className="text-sm text-gray-500 mt-1">Ranked by nutrition-per-peso score</p>
          </div>
          <Link href="/browse" className="text-green-700 hover:underline text-sm font-medium">
            View all →
          </Link>
        </div>

        {topRecipes.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-5xl mb-4">🍳</p>
            <p className="text-lg font-medium">No recipes yet</p>
            <p className="text-sm mt-1">
              Go to{" "}
              <Link href="/admin" className="text-green-700 underline">
                Admin
              </Link>{" "}
              to start scraping data.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {topRecipes.map((r: (typeof topRecipes)[0]) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="bg-white border-t border-amber-100 py-12">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            {[
              {
                icon: "📄",
                title: "DA Price Index",
                desc: "We pull daily commodity prices from the Department of Agriculture's price monitoring PDF — so you know what's cheap right now.",
              },
              {
                icon: "🥘",
                title: "Filipino Recipes",
                desc: "Recipes are sourced from Panlasang Pinoy, matched to their ingredients and real market prices.",
              },
              {
                icon: "📊",
                title: "FNRI Nutrition Data",
                desc: "Nutritional values come from the FNRI Food Composition Table — the Philippine standard for food nutrition data.",
              },
            ].map((item) => (
              <div key={item.title} className="flex flex-col items-center gap-3">
                <span className="text-5xl">{item.icon}</span>
                <h3 className="font-semibold text-lg">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
