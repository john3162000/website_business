"use client";

import { useState, useEffect, useCallback } from "react";
import RecipeCard from "@/components/RecipeCard";

const SORT_OPTIONS = [
  { value: "valueScore", label: "Best Value (Nutrition/Peso)" },
  { value: "nutritionScore", label: "Most Nutritious" },
  { value: "costPerServing", label: "Cheapest per Serving" },
  { value: "protein", label: "Highest Protein" },
  { value: "calories", label: "Highest Calories" },
];

interface ScoreWithRecipe {
  id: number;
  valueScore: number | null;
  nutritionScore: number | null;
  costPerServing: number | null;
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  recipe: {
    id: number;
    title: string;
    slug: string;
    imageUrl: string | null;
    category: string | null;
    servings: number | null;
    ingredients: { name: string }[];
  };
}

export default function BrowsePage() {
  const [results, setResults] = useState<ScoreWithRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("valueScore");
  const [minProtein, setMinProtein] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [produce, setProduce] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchResults = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sortBy, limit: "48" });
    if (minProtein) params.set("minProtein", minProtein);
    if (maxCost) params.set("maxCost", maxCost);
    if (produce) params.set("produce", produce);

    const res = await fetch(`/api/scores?${params}`);
    const data = await res.json();
    setResults(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [sortBy, minProtein, maxCost, produce]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const filtered = searchInput
    ? results.filter((r) =>
        r.recipe.title.toLowerCase().includes(searchInput.toLowerCase())
      )
    : results;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Browse Filipino Recipes</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Filter and sort by nutrition, price, or specific produce from the DA price index.
      </p>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow p-5 mb-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">
            Sort by
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">
            Min Protein (g/serving)
          </label>
          <input
            type="number"
            placeholder="e.g. 15"
            value={minProtein}
            onChange={(e) => setMinProtein(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">
            Max Cost per Serving (₱)
          </label>
          <input
            type="number"
            placeholder="e.g. 50"
            value={maxCost}
            onChange={(e) => setMaxCost(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">
            Contains Produce
          </label>
          <input
            type="text"
            placeholder="e.g. kangkong, pork"
            value={produce}
            onChange={(e) => setProduce(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Search within results */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by dish name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full sm:w-80 border border-gray-300 rounded-full px-5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-64 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-5xl mb-3">🔍</p>
          <p className="text-lg font-medium">No recipes found</p>
          <p className="text-sm mt-1">Try adjusting the filters above.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">{filtered.length} recipes found</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filtered.map((s) => (
              <RecipeCard
                key={s.id}
                recipe={{
                  ...s.recipe,
                  score: {
                    valueScore: s.valueScore,
                    nutritionScore: s.nutritionScore,
                    costPerServing: s.costPerServing,
                    calories: s.calories,
                    protein: s.protein,
                  },
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
