// "Laro" (games): Rate the ulam (1-10 slider with a stretchy-arm cook) and
// Versus (two dishes face off; tap the one you'd rather eat). Plain browser
// script sharing globals with the others; needs RECIPES and escapeHtml from
// app.js at run time. Picks are saved on this device only.

const GAME_RATE_KEY = "sarapsulit.ratings.v1";
const GAME_VS_KEY = "sarapsulit.versus.v1";
const GAME_FACT_CHANCE = 0.6; // otherwise a round ends with a price comparison

// Each side tries its patterns in order; the first pattern with a match wins.
const GAME_MATCHUPS = [
  [{ name: "Sinigang", re: [/^sinigang na baboy/i, /sinigang/i] }, { name: "Adobo", re: [/^chicken adobo/i, /^(pork )?adobo/i, /adobo/i] }],
  [{ name: "Kaldereta", re: [/^beef (kaldereta|caldereta)/i, /kaldereta|caldereta/i] }, { name: "Kare-Kare", re: [/^kare.?kare/i, /kare.?kare/i] }],
  [{ name: "Lechon Kawali", re: [/lechon kawali/i] }, { name: "Crispy Pata", re: [/crispy pata/i] }],
  [{ name: "Sisig", re: [/^pork sisig/i, /sisig/i] }, { name: "Bicol Express", re: [/bicol express/i] }],
  [{ name: "Tinola", re: [/^chicken tinola/i, /tinola/i] }, { name: "Nilaga", re: [/^nilagang baka/i, /nilaga/i] }],
  [{ name: "Pancit Canton", re: [/pancit canton/i] }, { name: "Pancit Bihon", re: [/pancit bihon/i] }],
  [{ name: "Lumpiang Shanghai", re: [/^lumpiang shanghai/i, /lumpiang shanghai/i, /lumpia/i] }, { name: "Tokwa't Baboy", re: [/tokwa.?t baboy/i] }],
  [{ name: "Menudo", re: [/menudo/i] }, { name: "Afritada", re: [/afritada/i] }],
  [{ name: "Laing", re: [/^laing\b/i, /\blaing\b/i] }, { name: "Pinakbet", re: [/^pinakbet/i, /pinakbet/i] }],
  [{ name: "Halo-Halo", re: [/halo.?halo/i] }, { name: "Leche Flan", re: [/^leche flan/i, /leche flan/i] }],
  // Backups, used when a round above has no recipe on the site.
  [{ name: "Chicken Inasal", re: [/^chicken inasal/i, /inasal/i] }, { name: "Lechon Manok", re: [/^lechon manok/i, /lechon manok/i] }],
  [{ name: "Bulalo", re: [/^bulalo/i, /bulalo/i] }, { name: "Batchoy", re: [/^batchoy/i, /batchoy/i] }],
  [{ name: "Tortang Talong", re: [/^tortang talong/i, /tortang talong/i] }, { name: "Ginisang Ampalaya", re: [/^ginisang ampalaya/i, /ampalaya/i] }],
];
const GAME_ROUNDS = 10;

const GAME_FACTS = {
  "Sinigang": "Sinigang's sourness traditionally comes from sampalok (tamarind), but kamias, bayabas, kalamansi and santol are used too.",
  "Adobo": "The name comes from the Spanish \"adobar\" (to marinate), but cooking meat in vinegar to keep it longer was done here before the Spanish came.",
  "Kaldereta": "Kaldereta is named after the Spanish \"caldera\", a cauldron. Goat (kambing) kaldereta is a favourite in many provinces.",
  "Kare-Kare": "Kare-kare's thick sauce comes from ground peanuts, and it's traditionally eaten with bagoong alamang on the side.",
  "Lechon Kawali": "\"Kawali\" is the wok-like pan the pork belly is deep-fried in, after it's boiled until tender.",
  "Crispy Pata": "\"Pata\" is the pork leg. It's boiled first, dried, then deep-fried until the skin puffs and crackles.",
  "Sisig": "Sisig comes from Pampanga. The sizzling-plate version was made famous in Angeles City.",
  "Bicol Express": "Bicol Express is said to be named after the train that ran between Manila and the Bicol region.",
  "Tinola": "Tinola appears in José Rizal's novel Noli Me Tangere.",
  "Nilaga": "\"Nilaga\" simply means \"boiled\". The clear broth gets its flavour from slowly simmered beef or pork bones.",
  "Pancit Canton": "Pancit is served at birthdays because long noodles stand for long life.",
  "Pancit Bihon": "Bihon is a thin rice noodle. Pancit came to the Philippines with Chinese traders centuries ago.",
  "Lumpiang Shanghai": "Lumpia came from Chinese spring rolls. The Shanghai kind is thin, fried and filled with ground pork.",
  "Tokwa't Baboy": "Tokwa't baboy is a classic partner of lugaw: \"lugaw at tokwa't baboy\" is a street-food staple.",
  "Menudo": "Filipino menudo is a tomato-based pork stew with liver, nothing like Mexican menudo, which is a tripe soup.",
  "Afritada": "Afritada's name comes from the Spanish \"fritada\". Its cousins are menudo, kaldereta and mechado.",
  "Laing": "Laing is from Bicol: dried taro (gabi) leaves slowly cooked in coconut milk with chili.",
  "Pinakbet": "Pinakbet is an Ilocano dish. The name is said to come from \"pinakebbet\", meaning shrunk or shrivelled.",
  "Halo-Halo": "\"Halo-halo\" means \"mix-mix\": you're meant to stir everything together before eating.",
  "Chicken Inasal": "Chicken inasal comes from Bacolod. It's marinated in vinegar, kalamansi and lemongrass, then basted with annatto (atsuete) oil while grilling.",
  "Lechon Manok": "Lechon manok is roasted on a turning spit, often with lemongrass stuffed inside the chicken.",
  "Bulalo": "Bulalo is beef shank and marrow bone soup, a favourite in Batangas and cool Tagaytay.",
  "Batchoy": "Batchoy comes from La Paz, Iloilo: noodle soup with pork, liver and crushed chicharon on top.",
  "Tortang Talong": "For tortang talong, the eggplant is grilled, peeled and flattened, then dipped in egg and fried.",
  "Ginisang Ampalaya": "Rubbing sliced ampalaya with salt and squeezing out the juice makes it less bitter.",
  "Leche Flan": "A popular story says leche flan used the egg yolks left over when egg whites were used in building old Spanish-era churches.",
};

// ── Pure helpers ──

/** The best recipe for a dish: first pattern with a match, then photo and price first, then the shortest title. */
function findDish(recipes, patterns) {
  for (const re of patterns) {
    const hits = recipes.filter((r) => re.test(r.title || ""));
    if (hits.length === 0) continue;
    const score = (r) => (r.img ? 0 : 2) + (r.costPerServing > 0 ? 0 : 1);
    return hits.slice().sort((a, b) => score(a) - score(b) || a.title.length - b.title.length)[0];
  }
  return null;
}

/** The ten face-offs with the recipe found for each side; rounds missing a side are dropped. */
function buildMatchups(recipes, matchups = GAME_MATCHUPS) {
  return matchups
    .map(([a, b]) => ({ a: { name: a.name, recipe: findDish(recipes, a.re) }, b: { name: b.name, recipe: findDish(recipes, b.re) } }))
    .filter((m) => m.a.recipe && m.b.recipe)
    .slice(0, GAME_ROUNDS);
}

/** Words and hand for a 1-10 rating. */
function ratingMood(rating) {
  if (rating <= 2) return { label: "Ayoko talaga!", hand: "👎" };
  if (rating <= 4) return { label: "Hindi masyado", hand: "🤚" };
  if (rating <= 6) return { label: "Pwede na", hand: "👌" };
  if (rating <= 8) return { label: "Masarap!", hand: "👍" };
  return { label: "Sobrang sarap!", hand: "🤩" };
}

/** How far the arm reaches (0 at 1, 1 at 10). */
function armReach(rating) {
  return (Math.min(10, Math.max(1, rating)) - 1) / 9;
}

/** A random dish with a photo that hasn't been rated yet; sauces and condiments are skipped. */
function nextRateDish(recipes, rated, rng = Math.random) {
  const pool = recipes.filter((r) => r.img && !(String(r.id) in rated) && r.category !== "Sauce & Condiment");
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/** What to say after a round: a fact about one of the two dishes, or which one is cheaper. */
function roundNote(m, winnerSide, rng = Math.random) {
  const win = m[winnerSide];
  const other = m[winnerSide === "a" ? "b" : "a"];
  const pa = win.recipe.costPerServing, pb = other.recipe.costPerServing;
  if (rng() < GAME_FACT_CHANCE || !(pa > 0 && pb > 0)) {
    const pick = rng() < 0.5 ? win : other;
    return { kind: "fact", dish: pick.name, text: GAME_FACTS[pick.name] || "" };
  }
  if (Math.abs(pa - pb) < 1) return { kind: "price", text: `Halos pareho ang presyo: about ₱${pa.toFixed(0)} per serving each.` };
  const cheap = pa < pb ? win : other, dear = pa < pb ? other : win;
  const diff = Math.abs(pa - pb).toFixed(0);
  return { kind: "price", text: `Mas mura ang ${cheap.name} ng ₱${diff} per serving kaysa ${dear.name} (based on today's prices).` };
}

// ── State and storage ──

let gameRatings = {};      // { recipeId: 1-10 }
let gameVsPicks = {};      // { "Sinigang|Adobo": { n: "Sinigang", w: winnerId, l: loserId } }
let gameRateDish = null;
let gameRounds = [];
let gameRound = 0;
let gameRoundDone = false;
let gameMode = "rate";

function gameLoad(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
}
function gameSave(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: lasts this visit */ }
}

function initGames() {
  if (!RECIPES.length) { setTimeout(initGames, 500); return; }
  gameRatings = gameLoad(GAME_RATE_KEY);
  gameVsPicks = gameLoad(GAME_VS_KEY);
  setGameMode(gameMode);
}

function setGameMode(mode) {
  gameMode = mode;
  document.querySelectorAll("[data-game]").forEach((b) => b.classList.toggle("on", b.dataset.game === mode));
  document.getElementById("game-rate").classList.toggle("hidden", mode !== "rate");
  document.getElementById("game-versus").classList.toggle("hidden", mode !== "versus");
  document.getElementById("game-taste").classList.toggle("hidden", mode !== "taste");
  if (typeof trackEvent === "function") trackEvent(`game/${mode}`);
  if (mode === "rate") { if (!gameRateDish) gameRateDish = nextRateDish(RECIPES, gameRatings); renderRate(); }
  else if (mode === "versus") startVersus();
  else renderTaste();
}

// ── Rate the ulam ──

function renderRate() {
  const box = document.getElementById("game-rate");
  const r = gameRateDish;
  if (!r) { box.innerHTML = `<p class="text-sm text-gray-500 p-6 text-center">Na-rate mo na lahat! 🎉</p>${rateHistory()}`; return; }
  box.innerHTML = `
    <div class="game-card">
      <img src="${escapeHtml(r.img)}" alt="" class="game-photo" loading="lazy">
      <div class="p-4">
        <p class="font-display text-xl font-bold leading-tight">${escapeHtml(r.title)}</p>
        <p class="text-xs text-gray-500 mt-1">${r.costPerServing > 0 ? `₱${r.costPerServing}/serving · ` : ""}${escapeHtml(r.category)}</p>
        <p class="text-sm font-semibold mt-4">Gaano mo kagusto 'to?</p>
        <div class="rate-stage" id="rate-stage">
          ${GAME_COOK_SVG}
          <div class="rate-arm" id="rate-arm"><span class="rate-hand" id="rate-hand">👌</span></div>
        </div>
        <input id="rate-slider" type="range" min="1" max="10" step="1" value="5" class="rate-slider" aria-label="Rating from 1 to 10" oninput="updateRate(+this.value)">
        <div class="flex justify-between text-[.65rem] text-gray-400 -mt-1 px-1"><span>1 · ayoko</span><span>10 · paborito</span></div>
        <p class="text-center mt-3"><span id="rate-num" class="rate-num">5</span><span class="text-gray-400 font-semibold">/10</span> <span id="rate-label" class="text-sm font-semibold text-green-800"></span></p>
        <div class="flex gap-2 mt-4">
          <button onclick="skipRate()" class="flex-1 border border-gray-200 rounded-full py-2 text-sm font-semibold text-gray-600">Skip</button>
          <button onclick="submitRate()" class="flex-[2] bg-green-800 text-amber-50 rounded-full py-2 text-sm font-semibold">I-rate ✓</button>
        </div>
      </div>
    </div>
    ${rateHistory()}`;
  updateRate(5);
}

function updateRate(rating) {
  const mood = ratingMood(rating);
  const stage = document.getElementById("rate-stage");
  const arm = document.getElementById("rate-arm");
  if (!stage || !arm) return;
  const room = stage.clientWidth - 92 - 36; // shoulder to the right edge, less the hand
  arm.style.width = `${14 + Math.max(0, room) * armReach(rating)}px`;
  document.getElementById("rate-hand").textContent = mood.hand;
  document.getElementById("rate-num").textContent = rating;
  document.getElementById("rate-label").textContent = mood.label;
  stage.dataset.mood = rating <= 3 ? "sad" : rating <= 6 ? "meh" : "happy";
}

function submitRate() {
  if (!gameRateDish) return;
  gameRatings[gameRateDish.id] = +document.getElementById("rate-slider").value;
  gameSave(GAME_RATE_KEY, gameRatings);
  tasteModelChanged();
  if (typeof trackEvent === "function") trackEvent("game/rated");
  gameRateDish = nextRateDish(RECIPES, gameRatings);
  renderRate();
}

function skipRate() {
  gameRateDish = nextRateDish(RECIPES, gameRatings);
  renderRate();
}

function rateHistory() {
  const byId = new Map(RECIPES.map((r) => [String(r.id), r]));
  const rows = Object.entries(gameRatings)
    .map(([id, v]) => ({ r: byId.get(id), v }))
    .filter((x) => x.r)
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);
  if (!rows.length) return "";
  return `<div class="game-card p-4 mt-4">
    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top mo (${Object.keys(gameRatings).length} rated)</p>
    ${rows.map(({ r, v }) => `<div class="flex items-center justify-between gap-2 py-1 cursor-pointer" onclick="openModal(${r.id})"><span class="text-sm truncate">${escapeHtml(r.title)}</span><span class="text-sm font-bold text-green-800 shrink-0">${v}/10</span></div>`).join("")}
  </div>`;
}

// Original mascot: a palengke cook in a salakot. The arm is drawn outside the SVG so it can stretch.
const GAME_COOK_SVG = `<svg class="rate-cook" viewBox="0 0 100 130" aria-hidden="true">
  <path d="M8 40 L50 8 L92 40 Z" fill="#D9A21B"/><path d="M8 40 L50 8 L92 40" fill="none" stroke="#9C7212" stroke-width="2"/>
  <circle cx="50" cy="56" r="22" fill="#E8B583"/>
  <g class="eyes"><circle cx="42" cy="54" r="2.6" fill="#1F2A24"/><circle cx="58" cy="54" r="2.6" fill="#1F2A24"/></g>
  <path class="mouth-happy" d="M40 63 Q50 73 60 63" fill="none" stroke="#1F2A24" stroke-width="2.6" stroke-linecap="round"/>
  <path class="mouth-meh" d="M42 66 L58 66" fill="none" stroke="#1F2A24" stroke-width="2.6" stroke-linecap="round"/>
  <path class="mouth-sad" d="M41 69 Q50 61 59 69" fill="none" stroke="#1F2A24" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M24 130 Q24 84 50 82 Q76 84 76 130 Z" fill="#1F5A3D"/>
  <path d="M38 84 L50 98 L62 84" fill="none" stroke="#F8F4EA" stroke-width="3"/>
</svg>`;

// ── Versus ──

function startVersus() {
  const all = buildMatchups(RECIPES);
  gameRounds = all.sort(() => Math.random() - 0.5);
  gameRound = 0;
  gameRoundDone = false;
  renderVersus();
}

function vsKey(m) { return `${m.a.name}|${m.b.name}`; }

function renderVersus() {
  const box = document.getElementById("game-versus");
  if (!gameRounds.length) { box.innerHTML = `<p class="text-sm text-gray-500 p-6 text-center">Loading dishes…</p>`; return; }
  if (gameRound >= gameRounds.length) { renderVersusEnd(); return; }
  const m = gameRounds[gameRound];
  const side = (s) => {
    const d = m[s];
    return `<button class="vs-card" id="vs-${s}" onclick="pickVersus('${s}')">
      <img src="${escapeHtml(d.recipe.img || "logo.png")}" alt="" loading="lazy">
      <span class="vs-name">${escapeHtml(d.name)}</span>
      <span class="vs-price">${d.recipe.costPerServing > 0 ? `₱${d.recipe.costPerServing}/serving` : ""}</span>
      <span class="vs-badge">PANALO!</span>
    </button>`;
  };
  box.innerHTML = `
    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center mb-3">Round ${gameRound + 1} of ${gameRounds.length} · Alin ang mas gusto mo?</p>
    <div class="vs-arena">${side("a")}<span class="vs-mark">VS</span>${side("b")}</div>
    <div id="vs-note" class="vs-note hidden"></div>`;
}

function pickVersus(s) {
  if (gameRoundDone) return;
  gameRoundDone = true;
  const m = gameRounds[gameRound];
  const lose = s === "a" ? "b" : "a";
  gameVsPicks[vsKey(m)] = { n: m[s].name, w: m[s].recipe.id, l: m[lose].recipe.id };
  gameSave(GAME_VS_KEY, gameVsPicks);
  tasteModelChanged();
  if (typeof trackEvent === "function") trackEvent("game/versus-pick");
  document.getElementById(`vs-${s}`).classList.add("win");
  document.getElementById(`vs-${s === "a" ? "b" : "a"}`).classList.add("lose");
  const note = roundNote(m, s);
  const el = document.getElementById("vs-note");
  el.innerHTML = `<p class="text-xs font-bold uppercase tracking-wide ${note.kind === "fact" ? "text-amber-700" : "text-green-800"}">${note.kind === "fact" ? `💡 Alam mo ba? (${escapeHtml(note.dish)})` : "₱ Presyo ngayon"}</p>
    <p class="text-sm mt-1">${escapeHtml(note.text)}</p>
    <button onclick="nextVersus()" class="mt-3 w-full bg-green-800 text-amber-50 rounded-full py-2 text-sm font-semibold">${gameRound + 1 < gameRounds.length ? "Next round →" : "Tingnan ang resulta"}</button>`;
  el.classList.remove("hidden");
}

function nextVersus() {
  gameRound++;
  gameRoundDone = false;
  renderVersus();
}

function renderVersusEnd() {
  const winners = gameRounds.map((m) => gameVsPicks[vsKey(m)]).filter((p) => p && p.n).map((p) => p.n);
  const pics = new Map(gameRounds.flatMap((m) => [[m.a.name, m.a.recipe], [m.b.name, m.b.recipe]]));
  document.getElementById("game-versus").innerHTML = `
    <div class="game-card p-5 text-center">
      <p class="text-3xl">🏆</p>
      <p class="font-display text-2xl font-bold mt-1">Ang mga champion mo</p>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
        ${winners.map((n) => { const r = pics.get(n); return `<button class="vs-champ" onclick="openModal(${r.id})"><img src="${escapeHtml(r.img || "logo.png")}" alt="" loading="lazy"><span>${escapeHtml(n)}</span></button>`; }).join("")}
      </div>
      <div class="flex flex-wrap gap-2 justify-center mt-5">
        <button onclick="startVersus()" class="border border-gray-200 rounded-full px-5 py-2 text-sm font-semibold text-gray-600">Laro ulit 🔁</button>
        <button onclick="setGameMode('taste')" class="bg-green-800 text-amber-50 rounded-full px-5 py-2 text-sm font-semibold">🧠 Tingnan ang panlasa mo</button>
      </div>
    </div>`;
}

// ── Panlasa mo (taste profile and picks, from taste.js) ──

/** Trains the taste model on this device's ratings and Versus picks. */
function gameTasteModel() {
  return tasteModelFrom(RECIPES, gameRatings, gameVsPicks);
}

function renderTaste() {
  const box = document.getElementById("game-taste");
  const model = gameTasteModel();
  if (model.answers < TASTE_MIN_ANSWERS) {
    const left = TASTE_MIN_ANSWERS - model.answers;
    box.innerHTML = `<div class="game-card p-6 text-center">
      <p class="text-4xl">🧠</p>
      <p class="font-display text-xl font-bold mt-2">Kilalanin natin ang panlasa mo</p>
      <p class="text-sm text-gray-500 mt-2">Mag-rate o maglaro ng Versus ng ${left} pa para makita kung anong klaseng ulam ang hilig mo.</p>
      <div class="flex gap-2 justify-center mt-4">
        <button onclick="setGameMode('rate')" class="bg-green-800 text-amber-50 rounded-full px-5 py-2 text-sm font-semibold">⭐ Rate</button>
        <button onclick="setGameMode('versus')" class="border border-gray-200 rounded-full px-5 py-2 text-sm font-semibold text-gray-600">⚔️ Versus</button>
      </div></div>`;
    return;
  }
  const prof = tasteProfile(model);
  const max = Math.max(0.3, ...prof.items.map((t) => Math.abs(t.w)));
  const bars = prof.items.slice().sort((a, b) => b.w - a.w).map((t) => {
    const pct = Math.round((Math.abs(t.w) / max) * 50);
    const side = t.w >= 0 ? `left:50%;width:${pct}%` : `right:50%;width:${pct}%`;
    return `<div class="taste-row"><span class="taste-label">${t.icon} ${escapeHtml(t.label)}</span>
      <span class="taste-track"><span class="taste-bar ${t.w >= 0 ? "pos" : "neg"}" style="${side}"></span></span></div>`;
  }).join("");
  const picks = recommendDishes(model, RECIPES, gameRatings);
  box.innerHTML = `
    <div class="game-card p-5">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Panlasa mo · from ${model.answers} answers</p>
      <p class="font-display text-xl font-bold mt-1 leading-snug">${escapeHtml(prof.sentence || "Wala ka pang malinaw na paborito. Laro pa!")}</p>
      <div class="mt-4">${bars}</div>
      <div class="flex justify-between text-[.65rem] text-gray-400 mt-1"><span>← hindi masyado</span><span>mas gusto →</span></div>
    </div>
    <div class="game-card p-5 mt-4">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Para sa'yo · bagay sa panlasa mo at sulit</p>
      <div class="grid grid-cols-2 gap-3">
        ${picks.map(({ r, x }) => `<button class="taste-pick" onclick="openModal(${r.id})">
          <img src="${escapeHtml(r.img)}" alt="" loading="lazy">
          <span class="taste-pick-name">${escapeHtml(r.title)}</span>
          <span class="taste-pick-why">${escapeHtml(tasteReasons(model, x).join(" · ") || "sulit pick")}</span>
          <span class="taste-pick-price">₱${r.costPerServing}/serving</span>
        </button>`).join("")}
      </div>
      <p class="text-[.7rem] text-gray-400 mt-3">Learned on this phone only from your ratings and Versus picks. The more you play, the better it gets.</p>
    </div>`;
}
