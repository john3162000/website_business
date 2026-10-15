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
 * "rainy" | "hot" | "cool" | "mild" from current conditions:
 *   rainy: rain, showers or a thunderstorm now, ≥ 0.2 mm in the last hour,
 *          or a ≥ 60% chance of rain in the next 6 hours
 *   hot:   feels like ≥ 32 °C (PAGASA's heat index "caution" starts at 27, "extreme caution" at 33)
 *   cool:  feels like < 24 °C (Baguio, or a cold Amihan morning)
 */
function weatherMood({ code, apparent, precipitation = 0, rainChance6h = 0 }) {
  if (RAIN_CODE(code) || precipitation >= 0.2 || rainChance6h >= 60) return "rainy";
  if (apparent >= 32) return "hot";
  if (apparent < 24) return "cool";
  return "mild";
}

const MOOD_COPY = {
  rainy: { title: "Maulan: mainit na sabaw", sub: "Hot soups and stews for a rainy day" },
  cool: { title: "Malamig: pampainit", sub: "Warm soups and stews for a cool day" },
  hot: { title: "Mainit: presko at magaan", sub: "Light dishes for a hot day: salads, kinilaw, grilled food and cold desserts" },
  mild: { title: "Maaliwalas: kahit ano", sub: "Good value dishes for any weather" },
};

// Warming: soups, stews, lugaw and their sweet rainy-day cousins (champorado, bilo-bilo).
const WARM_DISH = /\b(sinigang|tinola|nilaga|nilagang|bulalo|batchoy|mami|lomi|sopas|molo|arroz caldo|lugaw|goto|champorado|pochero|puchero|kare[- ]?kare|kaldereta|caldereta|ginataang|ginataan|bilo[- ]?bilo|misua|miswa|sotanghon|halaan|papaitan|pares|soup|stew|chowder|congee|ramen)\b/i;
// Cooling: raw, sour, grilled or cold. "-ng" is the Filipino linker (ensaladang talong).
const COOL_DISH = /\b(salad|ensaladang?|kinilaw|kilawin|kilawing|ceviche|atchara|achara|inihaw|ihaw|grilled|barbecue|bbq|halo[- ]?halo|mais con yelo|gulaman|sago|buko|fruit|lumpiang sariwa|fresh lumpia|steamed|paksiw|float|shake|smoothie|ice candy)\b/i;

/** Which weather a dish suits: "warm" (rainy/cool days), "cool" (hot days) or null. */
function dishWeather(r) {
  if (r.category === "Soup" || WARM_DISH.test(r.title)) return "warm";
  if (COOL_DISH.test(r.title)) return "cool";
  return null;
}

/**
 * Up to n dishes for the mood, best Sulit Score first (unranked dishes after,
 * by nutrition). Sauces never; desserts only when the name itself fits the
 * weather (champorado, halo-halo). Null for "mild": the caller shows its own
 * any-weather list.
 */
function weatherPicks(mood, recipes, n = 4) {
  const want = mood === "hot" ? "cool" : mood === "rainy" || mood === "cool" ? "warm" : null;
  if (!want) return null;
  const seen = new Set();
  let desserts = 0;
  return recipes
    .filter((r) => r.category !== "Sauce & Condiment" && dishWeather(r) === want)
    .sort((a, b) => (b.ranked - a.ranked) || (b.valueScore - a.valueScore) || (b.nutritionScore - a.nutritionScore))
    .filter((r) => {
      const k = r.title.toLowerCase();
      if (seen.has(k)) return false;
      // Cheap sweets top any value ranking: keep one, so meals lead.
      if (r.category === "Dessert" && desserts++ >= 1) return false;
      seen.add(k);
      return true;
    })
    .slice(0, n);
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
