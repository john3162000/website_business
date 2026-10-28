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

// Photo credits (Wikimedia Commons; CC BY / CC BY-SA / public domain), shown under the kitchen.
const KITCHEN_CREDITS = {
  stove: {"creator": "Douglas P Perkins", "license": "CC BY 3.0", "source": "https://commons.wikimedia.org/wiki/File:Rinnai_RT-3GID_20090606.jpg"},
  oven: {"creator": "Shixart1985", "license": "CC BY 2.0", "source": "https://commons.wikimedia.org/wiki/File:Hands_open_oven_door_to_take_out_baked_food_from_inside_in_a_modern_kitchen.jpg"},
  air_fryer: {"creator": "I am R.", "license": "CC BY 2.0", "source": "https://commons.wikimedia.org/wiki/File:Air_Fryer_2020.jpg"},
  microwave: {"creator": "Wrightmt", "license": "Public domain", "source": "https://commons.wikimedia.org/wiki/File:Microwave_oven_flashon.jpg"},
  grill: {"creator": "Shixart1985", "license": "CC BY 2.0", "source": "https://commons.wikimedia.org/wiki/File:Charcoal_grill_ready_for_barbecue_with_ashes_arranged_neatly_at_summer_gathering_in_backyard.jpg"},
  steamer: {"creator": "Wikimedia Commons contributor", "license": "CC BY-SA 3.0", "source": "https://commons.wikimedia.org/wiki/File:Steamers.jpg"},
  rice_cooker: {"creator": "Jugo Yokomizo", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:Rival_Rice_Cooker.jpg"},
  pressure_cooker: {"creator": "Cantons-de-l'Est", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:Pressure_cooker_-_Hawkins,_Contura_Model_-_3_litres_-_4.jpg"},
  slow_cooker: {"creator": "Your Best Digs", "license": "CC BY 2.0", "source": "https://commons.wikimedia.org/wiki/File:6_quart_Crock_Pot_slow_cooker.jpg"},
  blender: {"creator": "Infrogmation of New Orleans", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:Old_blender_on_shelf_in_New_Orleans_kitchen.jpg"},
  mixer: {"creator": "Schekinov Alexey Victorovich", "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:%D0%9C%D0%B8%D0%BA%D1%81%D0%B5%D1%80_%D0%94%D0%9E%D0%9C%D0%9E%D0%A2%D0%95%D0%9A.jpg"},
};

function kitchenCreditsHtml() {
  return "Photos from Wikimedia Commons: " + KITCHEN_ITEMS.map((i) => {
    const c = KITCHEN_CREDITS[i.key];
    return c ? `<a href="${escapeHtml(c.source)}" target="_blank" rel="noopener">${escapeHtml(i.label)}</a> by ${escapeHtml(c.creator)} (${escapeHtml(c.license)})` : "";
  }).filter(Boolean).join(" · ");
}

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
  document.getElementById("kitchen-credits").innerHTML = kitchenCreditsHtml();
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
