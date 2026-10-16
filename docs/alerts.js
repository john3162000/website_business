// Price alerts: "tell me when pork belly drops below ₱340/kg" or "when sinigang gets cheaper".
// Saved on this device (localStorage) and checked whenever the site loads, then hourly while
// it stays open; a browser notification (if allowed) and a toast announce a hit. There is no
// server push, so nothing arrives while the site is closed. Uses app.js: DA_PRICES, RECIPES,
// LATEST_DA_DATE, escapeHtml, openModal. docs/alerts.test.mjs tests the pure helpers.

const ALERTS_KEY = "sarapsulit.alerts.v1";

// ── Pure helpers ──

function loadAlerts(storage) {
  try {
    const v = JSON.parse(storage.getItem(ALERTS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((a) => a && (a.kind === "commodity" || a.kind === "dish") && a.below > 0) : [];
  } catch {
    return [];
  }
}

function saveAlerts(storage, alerts) {
  try { storage.setItem(ALERTS_KEY, JSON.stringify(alerts)); return true; } catch { return false; }
}

/** An alert for a DA commodity (₱ per unit) or a dish (₱ per serving); replaces one for the same item. */
function upsertAlert(alerts, a) {
  const key = (x) => `${x.kind}:${x.ref}`;
  return [...alerts.filter((x) => key(x) !== key(a)), { ...a, lastHit: null }];
}

/**
 * Alerts whose item is now below its target and that haven't fired for this price day.
 * `prices` maps commodity name → current ₱; `dishes` maps dish id → current ₱ per serving.
 * Returns [{ alert, now }].
 */
function dueAlerts(alerts, prices, dishes, day) {
  const out = [];
  for (const a of alerts) {
    const now = a.kind === "commodity" ? prices.get(a.ref) : dishes.get(Number(a.ref));
    if (now == null || !(now > 0) || now >= a.below) continue;
    if (a.lastHit === day) continue;
    out.push({ alert: a, now });
  }
  return out;
}

// ── Browser side ──

function alertStore() {
  try { return window.localStorage; } catch { return null; }
}

function currentPrices() {
  return new Map(DA_PRICES.filter((p) => p.avg != null).map((p) => [p.name, p.avg]));
}

function currentDishCosts() {
  return new Map(RECIPES.filter((r) => r.costPerServing > 0).map((r) => [r.id, r.costPerServing]));
}

/** Open the alert dialog for a commodity (by name) or a dish (by id). */
function openAlertDialog(kind, ref) {
  const d = document.getElementById("alert-dialog");
  const isDish = kind === "dish";
  const item = isDish ? RECIPES.find((r) => r.id === Number(ref)) : DA_PRICES.find((p) => p.name === ref);
  if (!item) return;
  const now = isDish ? item.costPerServing : item.avg;
  const unit = isDish ? "per serving" : `per ${item.unit}`;
  d.dataset.kind = kind;
  d.dataset.ref = String(ref);
  d.dataset.label = isDish ? item.title : item.name;
  d.dataset.unit = unit;
  document.getElementById("alert-what").textContent = isDish ? item.title : item.name;
  document.getElementById("alert-now").textContent = now != null ? `Now ₱${Number(now).toFixed(2)} ${unit}` : "No price today";
  // Default target: a little under today's price.
  document.getElementById("alert-below").value = now != null ? (Math.floor(now * 0.95 * 100) / 100).toFixed(2) : "";
  document.getElementById("alert-error").textContent = "";
  d.showModal();
}

async function saveAlertFromDialog() {
  const d = document.getElementById("alert-dialog");
  const below = parseFloat(document.getElementById("alert-below").value);
  if (!(below > 0)) { document.getElementById("alert-error").textContent = "Enter a price above ₱0."; return; }
  const s = alertStore();
  if (!s) return;
  saveAlerts(s, upsertAlert(loadAlerts(s), { kind: d.dataset.kind, ref: d.dataset.ref, label: d.dataset.label, unit: d.dataset.unit, below, created: new Date().toISOString() }));
  d.close();
  // Ask once, when the first alert is made; a toast still shows if the answer is no.
  if ("Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch { /* ignored */ }
  }
  renderAlerts();
  checkAlerts();
}

function removeAlert(i) {
  const s = alertStore();
  if (!s) return;
  const list = loadAlerts(s);
  list.splice(i, 1);
  saveAlerts(s, list);
  renderAlerts();
}

function renderAlerts() {
  const box = document.getElementById("alerts-list");
  if (!box) return;
  const s = alertStore();
  const list = s ? loadAlerts(s) : [];
  const prices = currentPrices(), dishes = currentDishCosts();
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  document.getElementById("alerts-perm").textContent =
    perm === "granted" ? "Notifications on" : perm === "denied" ? "Notifications blocked: alerts show on the page only" : perm === "unsupported" ? "This browser can't notify: alerts show on the page" : "";
  box.innerHTML = list.map((a, i) => {
    const now = a.kind === "commodity" ? prices.get(a.ref) : dishes.get(Number(a.ref));
    const hit = now != null && now < a.below;
    return `<div class="flex items-center justify-between gap-3 py-2">
      <div class="min-w-0">
        <p class="text-sm font-medium truncate ${a.kind === "dish" ? "cursor-pointer hover:text-green-700" : ""}" ${a.kind === "dish" ? `onclick="openModal(${Number(a.ref)})"` : ""}>${a.kind === "dish" ? "🍲" : "🧺"} ${escapeHtml(a.label)}</p>
        <p class="text-xs text-gray-500">Below ₱${a.below.toFixed(2)} ${escapeHtml(a.unit || "")} · now ${now != null ? "₱" + now.toFixed(2) : "no price"}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${hit ? `<span class="text-xs font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">✓ Below target</span>` : `<span class="text-xs text-gray-400">Waiting</span>`}
        <button onclick="removeAlert(${i})" class="text-gray-400 hover:text-red-600 text-sm" aria-label="Remove alert">✕</button>
      </div>
    </div>`;
  }).join("") || `<p class="text-sm text-gray-400 py-2">No alerts yet. Tap 🔔 on a price below, or “Alert me” on any recipe.</p>`;
}

function toast(text) {
  const t = document.createElement("div");
  t.className = "app-toast";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("out"), 5500);
  setTimeout(() => t.remove(), 6000);
}

/** Fire every due alert once per price day: a browser notification if allowed, and a toast. */
function checkAlerts() {
  const s = alertStore();
  if (!s || !DA_PRICES.length) return;
  const day = LATEST_DA_DATE ? new Date(LATEST_DA_DATE).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const list = loadAlerts(s);
  const due = dueAlerts(list, currentPrices(), currentDishCosts(), day);
  for (const { alert, now } of due) {
    const text = `${alert.label} is now ₱${now.toFixed(2)} ${alert.unit || ""}, below your ₱${alert.below.toFixed(2)}.`;
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("FARM2FIGURE price alert", { body: text, icon: "logo.png", tag: `${alert.kind}:${alert.ref}` }); } catch { /* some phones need a service worker */ }
    }
    toast(`🔔 ${text}`);
    alert.lastHit = day;
  }
  if (due.length) saveAlerts(s, list);
  renderAlerts();
}

// Check after the data loads, then hourly while the page stays open.
(function startAlerts() {
  const start = () => { checkAlerts(); setInterval(checkAlerts, 60 * 60 * 1000); };
  const wait = () => (typeof DATA_READY !== "undefined" && DATA_READY ? DATA_READY.then(start, () => {}) : setTimeout(wait, 500));
  if (typeof window !== "undefined" && window.document) setTimeout(wait, 0);
})();
