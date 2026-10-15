// Weather-based picks: what today's weather calls for, and which dishes fit.
// Plain script (no modules) so the static site can load it before app.js;
// docs/weather.test.mjs runs the same file in Node.

const MANILA = { lat: 14.5995, lon: 120.9842, name: "Metro Manila" };

/** WMO weather codes, as Open-Meteo reports them. */
function weatherLabel(code) {
  if (code === 0) return { icon: "☀️", text: "clear" };
  if (code <= 2) return { icon: "🌤️", text: "partly cloudy" };
  if (code === 3) return { icon: "☁️", text: "overcast" };
  if (code === 45 || code === 48) return { icon: "🌫️", text: "foggy" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", text: "drizzle" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", text: "rain" };
  if (code >= 80 && code <= 82) return { icon: "🌧️", text: "rain showers" };
  if (code >= 95) return { icon: "⛈️", text: "thunderstorm" };
  return { icon: "🌤️", text: "fair" };
}

const RAIN_CODE = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;

/**
 * "rainy" | "sunny" | "cool" | "mild" from current conditions:
 *   rainy: rain, showers or a thunderstorm now, ≥ 0.2 mm in the last hour,
 *          or a ≥ 60% chance of rain in the next 6 hours
 *   sunny: clear to partly cloudy (WMO 0–2) and feels like ≥ 27 °C, or any dry
 *          day that feels like ≥ 32 °C (PAGASA's heat index "caution" starts at 27)
 *   cool:  feels like < 24 °C (Baguio, or a cold Amihan morning)
 */
function weatherMood({ code, apparent, precipitation = 0, rainChance6h = 0 }) {
  if (RAIN_CODE(code) || precipitation >= 0.2 || rainChance6h >= 60) return "rainy";
  if ((code <= 2 && apparent >= 27) || apparent >= 32) return "sunny";
  if (apparent < 24) return "cool";
  return "mild";
}

const MOOD_COPY = {
  rainy: { title: "Maulan: mainit na sabaw", sub: "Bulalo, sinigang, tinola and other hot soups, plus a warm merienda like bilo-bilo" },
  cool: { title: "Malamig: mainit na sabaw", sub: "Hot soups for a cool day, plus a warm merienda" },
  sunny: { title: "Maaraw: pampalamig", sub: "Cold treats for a sunny day: buko, sago't gulaman, fruit salad and kinilaw" },
  mild: { title: "Maaliwalas: kahit ano", sub: "Good value dishes for any weather" },
};

// Dish families in priority order: [match, exclude]. One recipe per family, so
// the picks are four different dishes rather than four sinigang.
const SABAW = [
  [/\bbulalo\b/i], [/\bsinigang\b/i], [/\btinola\b/i], [/\bnilagan?g?\b/i], [/\bbatchoy\b/i],
  [/\b(arroz caldo|lugaw|goto)\b/i], [/\b(mami|lomi)\b/i], [/\bsopas\b/i], [/\b(pochero|puchero)\b/i],
  [/\b(misua|miswa)\b.*\bsoup\b|\bsoup\b.*\b(misua|miswa)\b/i], [/\bsoup\b/i],
];
const WARM_SWEET = [
  [/\bbilo[- ]?bilo\b/i], [/\bchamporado\b/i], [/\b(binignit|ginataang (mais|halo[- ]?halo|bilo))\b/i],
];
const COLD = [
  [/\bhalo[- ]?halo\b/i, /\b(ginataang|binignit)\b/i], // ginataang halo-halo is served hot
  [/\bbuko\b/i, /\b(adobo|adobong|manok|chicken|tinola|soup)\b/i],
  [/\b(gulaman|sago)\b/i], [/\bmais con yelo\b/i], [/\bice candy\b/i], [/\bfruit salad\b/i],
  [/\b(kinilaw|kilawin|kilawing|ceviche)\b/i], [/\bensaladang?\b|\bsalad\b/i, /\bmacaroni\b/i],
];

const byValue = (a, b) => (b.ranked - a.ranked) || (b.valueScore - a.valueScore) || (b.nutritionScore - a.nutritionScore);

/** The best dish of each family in order, one per family, up to n; skips titles already taken. */
function fromFamilies(families, recipes, n, taken) {
  const out = [];
  for (const [match, exclude] of families) {
    if (out.length >= n) break;
    const best = recipes
      .filter((r) => r.category !== "Sauce & Condiment" && match.test(r.title) && !(exclude && exclude.test(r.title)) && !taken.has(r.title.toLowerCase()))
      .sort(byValue)[0];
    if (best) {
      taken.add(best.title.toLowerCase());
      out.push(best);
    }
  }
  return out;
}

/** The first family stays first; the rest rotate by day so the picks change. */
function rotate(families, day) {
  const rest = families.slice(1);
  const k = rest.length ? day % rest.length : 0;
  return [families[0], ...rest.slice(k), ...rest.slice(0, k)];
}

/**
 * Up to n dishes for the mood. Rainy or cool: hot soups (bulalo first) plus one
 * warm merienda (bilo-bilo first). Sunny: cold treats and cold dishes. Null for
 * "mild": the caller shows its own any-weather list. `day` (days since epoch)
 * rotates the families after the first.
 */
function weatherPicks(mood, recipes, n = 4, day = Math.floor(Date.now() / 86400000)) {
  const taken = new Set();
  if (mood === "rainy" || mood === "cool") {
    const sweet = fromFamilies(WARM_SWEET, recipes, 1, taken);
    const soups = fromFamilies(rotate(SABAW, day), recipes, n - sweet.length, taken);
    return [...soups, ...sweet];
  }
  if (mood === "sunny") return fromFamilies(COLD, recipes, n, taken);
  return null;
}

/** Open-Meteo current conditions and the next 6 hours' rain chance. No API key; CORS is allowed. */
async function fetchWeather(place) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}`
    + "&current=temperature_2m,apparent_temperature,precipitation,weather_code"
    + "&hourly=precipitation_probability&forecast_hours=6&timezone=auto";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather: HTTP ${res.status}`);
  const j = await res.json();
  return {
    code: j.current.weather_code,
    temp: j.current.temperature_2m,
    apparent: j.current.apparent_temperature,
    precipitation: j.current.precipitation,
    rainChance6h: Math.max(0, ...((j.hourly && j.hourly.precipitation_probability) || []).filter((v) => v != null)),
  };
}

/**
 * The phone's location, rounded to 2 decimals (~1 km) since it's only used for
 * the weather. Null when refused, unavailable or unsupported.
 */
function getLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), name: "your location" }),
      () => resolve(null),
      { timeout: 15000, maximumAge: 30 * 60 * 1000 },
    );
  });
}
