// "Ang kusina ko": the appliances someone has, picked in a kitchen scene.
// Dishes whose recipe needs an appliance they don't have (and can't stand in
// for) are left out of Browse and the planner. Each recipe's needs come from
// the server (`appliances` in /api/recipes/compiled). Saved on this device.

const KITCHEN_KEY = "sarapsulit.kitchen.v1";

// Order is the order on the counter. The stove is always there.
const KITCHEN_ITEMS = [
  { key: "stove", label: "Kalan", always: true },
  { key: "rice_cooker", label: "Rice cooker" },
  { key: "oven", label: "Oven" },
  { key: "air_fryer", label: "Air fryer" },
  { key: "microwave", label: "Microwave" },
  { key: "grill", label: "Ihawan" },
  { key: "steamer", label: "Steamer" },
  { key: "pressure_cooker", label: "Pressure cooker" },
  { key: "slow_cooker", label: "Slow cooker" },
  { key: "blender", label: "Blender" },
  { key: "mixer", label: "Mixer" },
];

// What can stand in when a recipe's appliance is missing.
const KITCHEN_SUBS = {
  oven: ["air_fryer"],
  air_fryer: ["oven"],
  grill: ["oven", "air_fryer"],
  slow_cooker: ["pressure_cooker"],
  steamer: ["rice_cooker"],
};

// Shown when a stand-in is what makes dishes cookable.
const KITCHEN_FACTS = {
  "oven<-air_fryer": "Alam mo ba? Ang air fryer ay isang maliit na convection oven: may malakas na fan na nagpapaikot ng mainit na hangin. Kaya pwede rin dito ang mga recipe na pang-oven. Babaan lang nang mga 10–15°C ang init at bantayan, kasi mas mabilis maluto.",
  "air_fryer<-oven": "Ang oven ay pwedeng pamalit sa air fryer: parehong mainit na hangin ang nagluluto. Mas matagal lang nang kaunti sa oven, lalo na kung walang fan (convection).",
  "grill<-oven": "Walang ihawan? Ang broiler ng oven ay parang ihawan na nasa itaas ang apoy.",
  "grill<-air_fryer": "Walang ihawan? Pwede ang air fryer para sa inihaw; wala lang 'yung usok ng uling.",
  "slow_cooker<-pressure_cooker": "Maraming electric pressure cooker (gaya ng Instant Pot) ang may slow-cook setting.",
  "steamer<-rice_cooker": "Maraming rice cooker ang may kasamang steamer tray, kaya pwedeng mag-steam habang nagsasaing.",
};

// ── Pure helpers ──

/** Whether a dish needing `needs` can be cooked with the appliances in `have` (a Set). */
function canCook(needs, have) {
  return (needs || []).every((a) => have.has(a) || (KITCHEN_SUBS[a] || []).some((s) => have.has(s)));
}

/** Stand-ins that make a difference for this kitchen: "oven<-air_fryer" when there's an air fryer but no oven. */
function kitchenStandIns(have) {
  const out = [];
  for (const [need, subs] of Object.entries(KITCHEN_SUBS)) {
    if (have.has(need)) continue;
    for (const s of subs) if (have.has(s)) { out.push(`${need}<-${s}`); break; }
  }
  return out;
}

/** How many dishes need each appliance, and how many need nothing beyond a stove. */
function applianceCounts(recipes) {
  const counts = {};
  let stoveOnly = 0;
  for (const r of recipes) {
    const a = r.appliances || [];
    if (!a.length) stoveOnly++;
    for (const k of a) counts[k] = (counts[k] || 0) + 1;
  }
  return { counts, stoveOnly };
}

// ── State ──

let KITCHEN_HAVE = null; // Set of appliance keys, or null when not set (no filtering)
let kitchenDraft = null;

function kitchenLoad() {
  try {
    const v = JSON.parse(localStorage.getItem(KITCHEN_KEY) || "null");
    KITCHEN_HAVE = Array.isArray(v) ? new Set([...v, "stove"]) : null;
  } catch { KITCHEN_HAVE = null; }
}

/** Filter used by Browse and the planner: true when no kitchen is set. */
function kitchenOk(r) {
  return !KITCHEN_HAVE || canCook(r.appliances, KITCHEN_HAVE);
}

function kitchenSummary() {
  if (!KITCHEN_HAVE) return "Lahat ng ulam ang ipinapakita";
  const n = typeof RECIPES !== "undefined" ? RECIPES.filter(kitchenOk).length : 0;
  return `${KITCHEN_HAVE.size - 1} appliance${KITCHEN_HAVE.size - 1 === 1 ? "" : "s"} · ${n.toLocaleString()} ulam na kaya mong lutuin`;
}

// ── The kitchen dialog ──

function openKitchen() {
  kitchenDraft = new Set(KITCHEN_HAVE || KITCHEN_ITEMS.map((i) => i.key));
  document.getElementById("kitchen-dialog").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderKitchen();
  if (typeof trackEvent === "function") trackEvent("kitchen/open");
}

function closeKitchen() {
  document.getElementById("kitchen-dialog").classList.add("hidden");
  document.body.style.overflow = "";
}

function toggleAppliance(key) {
  const item = KITCHEN_ITEMS.find((i) => i.key === key);
  if (!item || item.always) return;
  if (kitchenDraft.has(key)) kitchenDraft.delete(key); else kitchenDraft.add(key);
  renderKitchen();
}

function kitchenAll(on) {
  kitchenDraft = new Set(on ? KITCHEN_ITEMS.map((i) => i.key) : ["stove"]);
  renderKitchen();
}

function renderKitchen() {
  const { counts } = applianceCounts(RECIPES);
  document.getElementById("kitchen-items").innerHTML = KITCHEN_ITEMS.map((i) => {
    const on = kitchenDraft.has(i.key);
    const uses = i.always ? "laging meron" : `${(counts[i.key] || 0).toLocaleString()} ulam`;
    return `<button class="kitchen-item ${on ? "on" : ""}" onclick="toggleAppliance('${i.key}')" aria-pressed="${on}" ${i.always ? "disabled" : ""}>
      <span class="kitchen-photo"><img src="img/kitchen/${i.key}.jpg" alt="" loading="lazy"></span>
      <span class="kitchen-check">${on ? "✓" : "+"}</span>
      <span class="kitchen-label">${escapeHtml(i.label)}</span>
      <span class="kitchen-uses">${uses}</span>
    </button>`;
  }).join("");
  const n = RECIPES.filter((r) => canCook(r.appliances, kitchenDraft)).length;
  document.getElementById("kitchen-count").textContent = `${n.toLocaleString()} of ${RECIPES.length.toLocaleString()} ulam ang kaya mong lutuin`;
  const facts = kitchenStandIns(kitchenDraft).map((k) => KITCHEN_FACTS[k]).filter(Boolean);
  const box = document.getElementById("kitchen-fact");
  box.innerHTML = facts.map((f) => `<p>💡 ${escapeHtml(f)}</p>`).join("");
  box.classList.toggle("hidden", !facts.length);
}

function applyKitchen() {
  const all = KITCHEN_ITEMS.every((i) => kitchenDraft.has(i.key));
  KITCHEN_HAVE = all ? null : new Set(kitchenDraft);
  try {
    if (all) localStorage.removeItem(KITCHEN_KEY);
    else localStorage.setItem(KITCHEN_KEY, JSON.stringify([...KITCHEN_HAVE]));
  } catch { /* storage blocked: lasts this visit */ }
  closeKitchen();
  document.querySelectorAll("[data-kitchen-summary]").forEach((el) => { el.textContent = kitchenSummary(); });
  if (typeof browseLimit !== "undefined") browseLimit = 48;
  if (typeof filterRecipes === "function") filterRecipes();
  if (typeof renderPicker === "function" && document.getElementById("plan-picker")) renderPicker();
  if (typeof trackEvent === "function") trackEvent("kitchen/apply");
}

if (typeof window !== "undefined" && window.localStorage) kitchenLoad();
