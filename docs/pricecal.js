// "Mura ngayong buwan": which produce, fish and meat are usually cheap (or dear) this month,
// from PSA's monthly retail prices since 2018 (/api/prices/seasons, Metro Manila). Shown in the
// Prices tab with a month picker and a 12-month price calendar.
// Uses globals from app.js (API_BASE, escapeHtml) and settings.js (t, SETTINGS).
// docs/pricecal.test.mjs tests the pure helpers.

const PCAL_MONTHS = {
  tl: ["Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo", "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const PCAL_SHORT = {
  tl: ["Ene", "Peb", "Mar", "Abr", "May", "Hun", "Hul", "Ago", "Set", "Okt", "Nob", "Dis"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// Palengke names for PSA's English commodity names (first match wins).
const PCAL_LOCAL = [
  [/^tomato/i, "Kamatis"], [/^onion.*red|^red onion|^onion, bermuda/i, "Pulang sibuyas"], [/^onion/i, "Sibuyas"],
  [/^garlic/i, "Bawang"], [/^ginger/i, "Luya"], [/^eggplant/i, "Talong"], [/^ampalaya|bitter gourd/i, "Ampalaya"],
  [/^cabbage/i, "Repolyo"], [/^carrot/i, "Karot"], [/^pechay/i, "Pechay"], [/^kangkong|water spinach/i, "Kangkong"],
  [/^string ?beans|^sitaw/i, "Sitaw"], [/^squash|kalabasa/i, "Kalabasa"], [/^potato/i, "Patatas"], [/^sweet potato|camote/i, "Kamote"],
  [/^chayote|sayote/i, "Sayote"], [/^okra/i, "Okra"], [/^upo|bottle gourd/i, "Upo"], [/^patola|sponge gourd/i, "Patola"],
  [/^malunggay|moringa/i, "Malunggay"], [/^calamansi|calamondin/i, "Kalamansi"], [/^banana/i, "Saging"], [/^mango/i, "Mangga"],
  [/^papaya/i, "Papaya"], [/^pineapple/i, "Pinya"], [/^watermelon/i, "Pakwan"], [/^chili|^chilli|^siling|hot pepper/i, "Sili"],
  [/^bell pepper|sweet pepper/i, "Bell pepper"], [/^mung ?bean|^mongo/i, "Munggo"], [/^peanut/i, "Mani"],
  [/^roundscad|galunggong/i, "Galunggong"], [/^tilapia/i, "Tilapia"], [/^milkfish|bangus/i, "Bangus"],
  [/^tahong|mussel/i, "Tahong"], [/^shrimp|^prawn|hipon/i, "Hipon"], [/^squid|pusit/i, "Pusit"], [/^chicken/i, "Manok"],
  [/^pork/i, "Baboy"], [/^beef/i, "Baka"], [/^egg/i, "Itlog"], [/^rice/i, "Bigas"], [/^corn/i, "Mais"], [/^gabi|taro/i, "Gabi"],
];

/** The palengke name for a PSA commodity, or its own name. */
function pcalLocal(name) {
  const hit = PCAL_LOCAL.find(([re]) => re.test(name));
  return hit ? hit[1] : name;
}

/** Index 0.82 → -18; 1.07 → 7 (percent against the item's usual price). */
function pcalPct(index) {
  return Math.round((index - 1) * 100);
}

/** What is usually cheap (≤ 1 − margin) or dear (≥ 1 + margin) in a month, the strongest first. */
function pcalPicks(profiles, month, margin = 0.05) {
  const at = (p) => p.index[month];
  const ok = (p) => typeof at(p) === "number";
  return {
    cheap: profiles.filter((p) => ok(p) && at(p) <= 1 - margin).sort((a, b) => at(a) - at(b)),
    dear: profiles.filter((p) => ok(p) && at(p) >= 1 + margin).sort((a, b) => at(b) - at(a)),
  };
}

/** A calendar cell's tone from its index: strong/mild cheap, normal, mild/strong dear. */
function pcalTone(index) {
  if (typeof index !== "number") return "na";
  if (index <= 0.9) return "cheap2";
  if (index <= 0.95) return "cheap1";
  if (index >= 1.1) return "dear2";
  if (index >= 1.05) return "dear1";
  return "even";
}

/** The month names in a list, in calendar order ("Peb, Mar, Abr"). */
function pcalMonthList(months, lang) {
  return [...months].sort((a, b) => a - b).map((m) => PCAL_SHORT[lang === "tl" ? "tl" : "en"][m]).join(", ");
}

let PCAL_DATA = null;
let PCAL_MONTH = null;
let PCAL_LOADING = false;

async function loadPriceCalendar() {
  if (PCAL_DATA || PCAL_LOADING) return renderPriceCalendar();
  PCAL_LOADING = true;
  try {
    const res = await fetch(`${API_BASE}/api/prices/seasons`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    PCAL_DATA = await res.json();
    if (PCAL_MONTH == null) PCAL_MONTH = (PCAL_DATA.month || new Date().getMonth() + 1) - 1;
  } catch {
    PCAL_DATA = null;
  } finally {
    PCAL_LOADING = false;
  }
  renderPriceCalendar();
}

function setPcalMonth(m) {
  PCAL_MONTH = Number(m);
  renderPriceCalendar();
}

function renderPriceCalendar() {
  const box = document.getElementById("pcal");
  if (!box) return;
  const profiles = (PCAL_DATA && PCAL_DATA.profiles) || [];
  // Hidden until the history backfill has at least a handful of commodities.
  box.classList.toggle("hidden", profiles.length < 5);
  if (profiles.length < 5) return;
  const lang = typeof SETTINGS !== "undefined" && SETTINGS.lang === "tl" ? "tl" : "en";
  const month = PCAL_MONTH ?? new Date().getMonth();
  const { cheap, dear } = pcalPicks(profiles, month);
  const names = PCAL_MONTHS[lang];
  const label = (p) => {
    const local = pcalLocal(p.name);
    return local === p.name ? escapeHtml(p.name) : `${escapeHtml(local)} <span class="text-gray-400 font-normal">${escapeHtml(p.name)}</span>`;
  };
  const row = (p, kind) => `
    <li class="flex items-baseline justify-between gap-3 py-1.5">
      <span class="min-w-0"><span class="font-medium">${label(p)}</span>
        <span class="block text-xs text-gray-500">${escapeHtml(t(kind === "cheap" ? "pcal.bestMonths" : "pcal.cheapestMonths"))}: ${pcalMonthList(p.cheapest, lang)}</span></span>
      <span class="shrink-0 tabular-nums font-semibold ${kind === "cheap" ? "price-down" : "price-up"}">${pcalPct(p.index[month]) > 0 ? "+" : ""}${pcalPct(p.index[month])}%</span>
    </li>`;
  const list = (items, kind) => (items.length
    ? `<ul class="divide-y divide-gray-100 text-sm">${items.slice(0, 8).map((p) => row(p, kind)).join("")}</ul>`
    : `<p class="text-sm text-gray-400 py-2">${escapeHtml(t("pcal.none"))}</p>`);
  const span = PCAL_DATA.span ? `${PCAL_DATA.span.from.slice(0, 4)}–${PCAL_DATA.span.to.slice(0, 4)}` : "";
  const sorted = [...profiles].sort((a, b) => (a.index[month] ?? 1) - (b.index[month] ?? 1));
  box.innerHTML = `
    <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
      <h2 class="text-xl font-bold">📅 ${escapeHtml(t("pcal.title"))} ${escapeHtml(names[month])}</h2>
      <label class="text-xs text-gray-500 flex items-center gap-2">${escapeHtml(t("pcal.month"))}
        <select id="pcal-pick" class="border rounded-lg px-2 py-1 text-sm bg-white" onchange="setPcalMonth(this.value)">
          ${names.map((n, i) => `<option value="${i}"${i === month ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")}
        </select></label>
    </div>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="bg-white rounded-2xl shadow p-4 min-w-0">
        <h3 class="font-semibold price-down mb-1">▼ ${escapeHtml(t("pcal.cheap"))}</h3>
        ${list(cheap, "cheap")}
      </div>
      <div class="bg-white rounded-2xl shadow p-4 min-w-0">
        <h3 class="font-semibold price-up mb-1">▲ ${escapeHtml(t("pcal.dear"))}</h3>
        ${list(dear, "dear")}
      </div>
    </div>
    <details class="bg-white rounded-2xl shadow p-4 mt-4">
      <summary class="cursor-pointer font-semibold">${escapeHtml(t("pcal.calendar"))} <span class="text-xs text-gray-400 font-normal">(${profiles.length})</span></summary>
      <div class="overflow-x-auto mt-3">
        <table class="pcal-table text-xs w-full">
          <thead><tr><th class="text-left font-semibold py-1 pr-2">${escapeHtml(t("pcal.item"))}</th>
            ${PCAL_SHORT[lang].map((m, i) => `<th class="font-semibold px-0.5 ${i === month ? "pcal-now" : ""}">${m}</th>`).join("")}</tr></thead>
          <tbody>${sorted.map((p) => `<tr><td class="py-1 pr-2 whitespace-nowrap">${label(p)}</td>
            ${p.index.map((v, i) => `<td class="pcal-cell pcal-${pcalTone(v)}${i === month ? " pcal-now" : ""}" title="${escapeHtml(names[i])}: ${typeof v === "number" ? (pcalPct(v) > 0 ? "+" : "") + pcalPct(v) + "%" : "—"}"></td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="text-xs text-gray-500 mt-2"><span class="pcal-key pcal-cheap2"></span> ${escapeHtml(t("pcal.keyCheap"))}
        <span class="pcal-key pcal-dear2 ml-3"></span> ${escapeHtml(t("pcal.keyDear"))}</p>
    </details>
    <p class="text-xs text-gray-400 mt-2">${escapeHtml(t("pcal.note").replace("{span}", span))}</p>`;
}
