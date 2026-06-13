import Link from "next/link";
import Image from "next/image";

interface Score {
  valueScore: number | null;
  nutritionScore: number | null;
  costPerServing: number | null;
  calories: number | null;
  protein: number | null;
}

interface RecipeCardProps {
  recipe: {
    id: number;
    title: string;
    slug: string;
    imageUrl?: string | null;
    category?: string | null;
    servings?: number | null;
    score?: Score | null;
  };
}

function ScoreBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const color =
    value >= 7 ? "bg-green-100 text-green-800" :
    value >= 4 ? "bg-yellow-100 text-yellow-800" :
    "bg-red-100 text-red-700";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${color}`}>
      {label}: {value.toFixed(1)}
    </span>
  );
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  const score = recipe.score;

  return (
    <Link
      href={`/recipe/${recipe.slug}`}
      className="bg-white rounded-2xl overflow-hidden shadow hover:shadow-lg transition-shadow flex flex-col group"
    >
      <div className="relative h-44 bg-amber-100">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt={recipe.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full text-5xl">🍽️</div>
        )}
        {score?.valueScore != null && (
          <div className="absolute top-2 right-2 bg-green-700 text-white text-xs font-bold px-2 py-1 rounded-full shadow">
            ★ {score.valueScore.toFixed(1)} sulit
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-gray-900 leading-snug group-hover:text-green-700 transition-colors">
          {recipe.title}
        </h3>

        {recipe.category && (
          <span className="text-xs text-gray-500 uppercase tracking-wide">{recipe.category}</span>
        )}

        <div className="flex flex-wrap gap-1 mt-auto pt-2">
          {score?.costPerServing != null && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
              ₱{score.costPerServing.toFixed(2)}/serving
            </span>
          )}
          <ScoreBadge value={score?.nutritionScore ?? null} label="Nutri" />
          {score?.protein != null && (
            <span className="text-xs text-gray-500">{score.protein.toFixed(0)}g protein</span>
          )}
        </div>
      </div>
    </Link>
  );
}
