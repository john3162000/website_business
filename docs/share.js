// Share a recipe as one picture: photo (credited), cost, sulit meter, nutrition facts, ingredients
// with prices, and where to find the steps (the source site), drawn on a canvas in the FARM2FIGURE style. On phones the
// share sheet sends it to Messenger (or anywhere); elsewhere the picture can be saved and the
// link copied. Uses app.js: RECIPES, MODAL_DATA, sulitLevel, DRV, LATEST_DA_DATE, formatDate.
// docs/share.test.mjs tests the pure helpers.

const SITE_URL = "https://john3162000.github.io/website_business/";
const SHARE_W = 1080, SHARE_PAD = 64;
const SHARE_C = { forest: "#163F2E", green: "#2F7A55", cream: "#F8F4EA", gold: "#DDAE2B", ink: "#22251F", muted: "#6B6F66", line: "#E7DFCB", card: "#FFFFFF" };

// ── Pure helpers ──

/** The link that opens this recipe on the site. */
// Partner recipe sites: we show their photo (linked) and send "Paano lutuin?" clicks to them;
// their steps are never shown here.
const RECIPE_SOURCES = { "panlasangpinoy.com": "Panlasang Pinoy", "kawalingpinoy.com": "Kawaling Pinoy" };

/** The site a recipe comes from: { name, host } ("Panlasang Pinoy", "panlasangpinoy.com"), or null. */
function recipeSource(url) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  return { name: RECIPE_SOURCES[host] || host, host };
}

function recipeLink(id) {
  return `${SITE_URL}#recipe=${id}`;
}

/** The recipe id in a "#recipe=123" link, or null. */
function recipeIdFromHash(hash) {
  const m = /^#recipe=(\d+)$/.exec(hash || "");
  return m ? Number(m[1]) : null;
}

/** Message text that goes with the picture. */
function shareText(r) {
  const cost = r.costPerServing > 0 ? ` ₱${r.costPerServing}${r.costCoverage < 1 ? "+" : ""} per serving.` : "";
  return `${r.title}:${cost} Recipe, nutrition and today's palengke prices on FARM2FIGURE.`;
}

/** "chicken-adobo-123.png" */
function shareFileName(r) {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return `${slug || "recipe"}-${r.id}.png`;
}

/** Word-wrap `text` to `maxWidth` using `measure(str) → px`; long words are kept whole. */
function wrapLines(text, maxWidth, measure) {
  const out = [];
  for (const para of String(text).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

// ── Drawing ──

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous"; // Panlasang Pinoy sends Access-Control-Allow-Origin: *; a site that doesn't fails to load, and the card has no photo
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Draws the share card; returns a PNG Blob. `lines` come from the open pop-up. */
async function drawRecipeCard(r, lines) {
  const src = recipeSource(r.url);
  await Promise.all(["600 60px Fraunces", "400 28px Inter", "700 28px Inter"].map((f) => document.fonts?.load(f).catch(() => {})));
  const [photo, logo] = await Promise.all([loadImage(r.img), loadImage("logo.png")]);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W; canvas.height = 6000;
  const ctx = canvas.getContext("2d");
  const serif = (px, w = 600) => `${w} ${px}px Fraunces, Georgia, serif`;
  const sans = (px, w = 400) => `${w} ${px}px Inter, Arial, sans-serif`;
  const text = (s, x, y, font, color, align = "left") => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); };
  const wrap = (s, font, width) => { ctx.font = font; return wrapLines(s, width, (t) => ctx.measureText(t).width); };

  ctx.fillStyle = SHARE_C.cream; ctx.fillRect(0, 0, SHARE_W, canvas.height);

  // Brand bar
  ctx.fillStyle = SHARE_C.forest; ctx.fillRect(0, 0, SHARE_W, 120);
  if (logo) { ctx.fillStyle = SHARE_C.cream; roundRect(ctx, SHARE_PAD, 22, 76, 76, 18); ctx.fill(); ctx.drawImage(logo, SHARE_PAD + 6, 28, 64, 64); }
  text("FARM2FIGURE", SHARE_PAD + 100, 70, sans(30, 800), SHARE_C.cream);
  text("Masarap, masustansya, sulit.", SHARE_W - SHARE_PAD, 70, serif(28, 500), "#E6C265", "right");

  // Photo
  let y = 120;
  if (photo) {
    const h = 620, s = Math.max(SHARE_W / photo.width, h / photo.height);
    const sw = SHARE_W / s, sh = h / s;
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, 0, y, SHARE_W, h);
    if (src) {
      const credit = `📷 ${src.name}`;
      ctx.font = sans(24, 700);
      const w = ctx.measureText(credit).width + 32;
      ctx.fillStyle = "rgba(22, 63, 46, .82)"; roundRect(ctx, SHARE_W - SHARE_PAD - w, y + h - 64, w, 44, 22); ctx.fill();
      text(credit, SHARE_W - SHARE_PAD - w / 2, y + h - 34, sans(24, 700), SHARE_C.cream, "center");
    }
    y += h;
  }

  // Title and category
  y += 70;
  for (const l of wrap(r.title, serif(60), SHARE_W - 2 * SHARE_PAD)) { text(l, SHARE_PAD, y, serif(60), SHARE_C.forest); y += 70; }
  text(`${r.category.toUpperCase()} · ${r.servings} SERVINGS`, SHARE_PAD, y, sans(24, 700), SHARE_C.muted); y += 50;

  // Cost and sulit meter
  const boxY = y;
  ctx.fillStyle = SHARE_C.card; roundRect(ctx, SHARE_PAD, boxY, SHARE_W - 2 * SHARE_PAD, 150, 24); ctx.fill();
  if (r.costPerServing > 0) {
    text(`₱${r.costPerServing}${r.costCoverage < 1 ? "+" : ""}`, SHARE_PAD + 36, boxY + 78, serif(64), SHARE_C.forest);
    text(`per serving · ₱${Math.round(r.cost.total)} for ${r.servings}`, SHARE_PAD + 36, boxY + 118, sans(26), SHARE_C.muted);
  } else text("No price yet", SHARE_PAD + 36, boxY + 90, serif(48), SHARE_C.muted);
  const lv = r.ranked && typeof sulitLevel === "function" ? sulitLevel(r.valueScore) : null;
  const colors = ["#C8553D", "#D98A2B", "#DDAE2B", "#559370", "#2F7A55"];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = lv && i < lv.segs ? colors[lv.segs - 1] : SHARE_C.line;
    roundRect(ctx, SHARE_W - SHARE_PAD - 36 - (5 - i) * 62, boxY + 46, 52, 18, 9); ctx.fill();
  }
  text(lv ? lv.label : r.costIncomplete ? "Incomplete price" : "Unranked", SHARE_W - SHARE_PAD - 36, boxY + 112, sans(30, 700), lv && lv.segs >= 4 ? SHARE_C.green : SHARE_C.muted, "right");
  y = boxY + 150 + 56;

  // Nutrition facts
  text("Nutrition per serving", SHARE_PAD, y, serif(40), SHARE_C.forest); y += 26;
  const n = r.nutrition;
  const facts = [["Calories", `${n.calories} kcal`, null], ["Protein", `${n.protein} g`, "protein"], ["Carbs", `${n.carbs} g`, "carbs"], ["Fat", `${n.fat} g`, "fat"],
    ["Fiber", `${n.fiber} g`, "fiber"], ["Iron", `${n.iron} mg`, "iron"], ["Calcium", `${n.calcium} mg`, "calcium"], ["Vitamin C", `${n.vitaminC} mg`, "vitaminC"]];
  const colW = (SHARE_W - 2 * SHARE_PAD - 24) / 2;
  facts.forEach(([label, val, key], i) => {
    const x = SHARE_PAD + (i % 2) * (colW + 24), yy = y + Math.floor(i / 2) * 92 + 20;
    ctx.fillStyle = SHARE_C.card; roundRect(ctx, x, yy, colW, 76, 18); ctx.fill();
    text(label, x + 24, yy + 47, sans(26), SHARE_C.muted);
    const pctDrv = key && typeof DRV !== "undefined" && DRV[key] ? Math.round((parseFloat(val) / DRV[key]) * 100) : null;
    text(`${val}${pctDrv != null ? `  ·  ${pctDrv}%` : ""}`, x + colW - 24, yy + 47, sans(26, 700), SHARE_C.ink, "right");
  });
  y += Math.ceil(facts.length / 2) * 92 + 60;

  // Ingredients with their cost
  text("Ingredients", SHARE_PAD, y, serif(40), SHARE_C.forest); y += 50;
  const ing = (lines || []).filter((l) => l.status !== "skipped");
  for (const l of ing) {
    const cost = l.cost != null ? `${l.priceSource && l.priceSource.startsWith("≈") ? "≈" : ""}₱${l.cost.toFixed(2)}` : "";
    const rows = wrap(`•  ${l.text}`, sans(28), SHARE_W - 2 * SHARE_PAD - 170);
    rows.forEach((row, k) => { text(row, SHARE_PAD, y, sans(28), ["to-taste", "optional", "water"].includes(l.status) ? SHARE_C.muted : SHARE_C.ink); if (k === 0 && cost) text(cost, SHARE_W - SHARE_PAD, y, sans(28, 700), SHARE_C.green, "right"); y += 40; });
    y += 6;
  }
  if (!ing.length) { text("See the recipe link for ingredients.", SHARE_PAD, y, sans(28), SHARE_C.muted); y += 40; }
  y += 40;

  // Paano lutuin: the steps live on the source site, never here.
  if (src && r.url) {
    const link = wrap(r.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), sans(26, 700), SHARE_W - 2 * SHARE_PAD - 72);
    const boxH = 140 + link.length * 36;
    ctx.fillStyle = SHARE_C.card; roundRect(ctx, SHARE_PAD, y - 10, SHARE_W - 2 * SHARE_PAD, boxH, 24); ctx.fill();
    text("Paano lutuin?", SHARE_PAD + 36, y + 44, serif(40), SHARE_C.forest);
    text(`See the full recipe on ${src.name}:`, SHARE_PAD + 36, y + 92, sans(26), SHARE_C.muted);
    link.forEach((l, k) => text(l, SHARE_PAD + 36, y + 130 + k * 36, sans(26, 700), SHARE_C.green));
    y += boxH + 20;
  }

  // Footer
  y += 30;
  ctx.fillStyle = SHARE_C.forest; ctx.fillRect(0, y, SHARE_W, 150);
  const date = typeof LATEST_DA_DATE !== "undefined" && LATEST_DA_DATE ? formatDate(LATEST_DA_DATE) : "today";
  text(`Prices: DA, PSA and SM, ${date}. Recipe and photo: ${src ? src.name : "the recipe site"}.`, SHARE_PAD, y + 62, sans(24), "#B5D2BE");
  text(recipeLink(r.id).replace("https://", ""), SHARE_PAD, y + 104, sans(24, 700), "#E6C265");
  y += 150;

  const out = document.createElement("canvas");
  out.width = SHARE_W; out.height = y;
  out.getContext("2d").drawImage(canvas, 0, 0);
  return new Promise((resolve) => out.toBlob(resolve, "image/png"));
}

// ── Share flow ──

let shareBusy = false;

async function shareRecipe(id) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r || shareBusy) return;
  shareBusy = true;
  if (typeof trackEvent === "function") trackEvent("share");
  const btn = document.getElementById("share-btn");
  if (btn) btn.textContent = "Preparing picture…";
  try {
    const data = typeof MODAL_DATA !== "undefined" && MODAL_DATA && MODAL_DATA.id === id ? MODAL_DATA : { lines: [] };
    const blob = await drawRecipeCard(r, data.lines);
    const file = new File([blob], shareFileName(r), { type: "image/png" });
    const payload = { files: [file], title: r.title, text: `${shareText(r)} ${recipeLink(r.id)}` };
    // Phones: the share sheet lists Messenger with the picture attached.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share(payload); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    showSharePanel(r, blob);
  } finally {
    shareBusy = false;
    if (btn) btn.textContent = "💬 Share to Messenger";
  }
}

/** Computers and browsers without file sharing: preview, save picture, copy link, open Messenger. */
function showSharePanel(r, blob) {
  const url = URL.createObjectURL(blob);
  const d = document.getElementById("share-dialog");
  document.getElementById("share-preview").src = url;
  const dl = document.getElementById("share-download");
  dl.href = url; dl.download = shareFileName(r);
  document.getElementById("share-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(`${shareText(r)} ${recipeLink(r.id)}`); document.getElementById("share-copy").textContent = "Copied ✓"; }
    catch { prompt("Copy this link", recipeLink(r.id)); }
  };
  document.getElementById("share-copy").textContent = "Copy link";
  d.onclose = () => URL.revokeObjectURL(url);
  d.showModal();
}
