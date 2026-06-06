interface NutritionLabelProps {
  calories?: number | null;
  protein?: number | null;
  carbohydrates?: number | null;
  fat?: number | null;
  fiber?: number | null;
  vitaminA?: number | null;
  vitaminC?: number | null;
  iron?: number | null;
  calcium?: number | null;
  servings?: number | null;
}

const DRV: Record<string, number> = {
  protein: 50,
  carbohydrates: 275,
  fat: 78,
  fiber: 25,
  vitaminC: 60,
  iron: 18,
  calcium: 1000,
  vitaminA: 900,
};

function Row({
  label,
  value,
  unit,
  key: k,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  key?: string;
}) {
  if (value == null) return null;
  const pct = k && DRV[k] ? Math.round((value / DRV[k]) * 100) : null;
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-200 text-sm">
      <span className="text-gray-700">{label}</span>
      <span className="font-medium tabular-nums">
        {value.toFixed(1)}{unit}
        {pct != null && <span className="ml-2 text-gray-400 text-xs">{pct}% DRV</span>}
      </span>
    </div>
  );
}

export default function NutritionLabel({ servings, ...n }: NutritionLabelProps) {
  return (
    <div className="border-2 border-gray-900 p-4 rounded-lg max-w-xs">
      <div className="border-b-8 border-gray-900 pb-1 mb-1">
        <p className="text-xs font-bold uppercase">Nutrition Facts</p>
        {servings && <p className="text-xs text-gray-600">{servings} servings per container</p>}
        <p className="text-sm font-bold">Per Serving</p>
      </div>

      <div className="border-b-4 border-gray-900 pb-2 mb-2">
        <div className="flex justify-between">
          <span className="text-xs">Calories</span>
          <span className="text-2xl font-black">{n.calories?.toFixed(0) ?? "—"}</span>
        </div>
      </div>

      <Row label="Total Fat" value={n.fat} unit="g" key="fat" />
      <Row label="Total Carbohydrates" value={n.carbohydrates} unit="g" key="carbohydrates" />
      <Row label="Dietary Fiber" value={n.fiber} unit="g" key="fiber" />
      <Row label="Protein" value={n.protein} unit="g" key="protein" />
      <div className="border-t-4 border-gray-900 mt-2 pt-2">
        <Row label="Vitamin A" value={n.vitaminA} unit="mcg RE" key="vitaminA" />
        <Row label="Vitamin C" value={n.vitaminC} unit="mg" key="vitaminC" />
        <Row label="Calcium" value={n.calcium} unit="mg" key="calcium" />
        <Row label="Iron" value={n.iron} unit="mg" key="iron" />
      </div>
      <p className="text-xs text-gray-500 mt-2">Source: FNRI FCT · per serving estimate</p>
    </div>
  );
}
