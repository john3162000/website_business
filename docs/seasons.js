// Okasyon: holiday and special-event dishes at the top of Browse. The box shows only when an occasion
// is on or close (two weeks before the event; a month before Christmas); otherwise it stays away.
// Holy Week follows Easter (computed); Chinese New Year and the two Eids follow the moon, so
// their dates come from a table (the Eids can shift a day with the moon sighting).
// Uses globals from app.js (RECIPES, escapeHtml, openModal, costText) and planner.js (proteinKind).
// docs/seasons.test.mjs tests the pure helpers.

const DAY_MS = 86400000;
const SEASON_ymd = (y, m, d) => new Date(y, m - 1, d);

/** Easter Sunday (Gregorian, "anonymous" algorithm). */
function easterDate(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return SEASON_ymd(y, month, day);
}

/** The nth weekday (0 = Sunday) of a month, e.g. Mother's Day = nthWeekday(y, 5, 0, 2). */
function nthWeekday(y, month, weekday, n) {
  const first = SEASON_ymd(y, month, 1);
  return SEASON_ymd(y, month, 1 + ((weekday - first.getDay() + 7) % 7) + 7 * (n - 1));
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Lunar dates (PAGASA / NCMF announcements; the Eids may move a day).
const CNY = { 2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3] };
const EID_FITR = { 2025: [3, 31], 2026: [3, 20], 2027: [3, 10], 2028: [2, 27], 2029: [2, 15], 2030: [2, 5] };
const EID_ADHA = { 2025: [6, 6], 2026: [5, 27], 2027: [5, 17], 2028: [5, 5], 2029: [4, 24], 2030: [4, 13] };
const fromTable = (table, y, before = 0, after = 0) => {
  const md = table[y];
  if (!md) return null;
  const d = SEASON_ymd(y, md[0], md[1]);
  return [addDays(d, -before), addDays(d, after)];
};

const SEASON_PORK = /\b(pork|baboy|liempo|lechon|ham|hamon|bacon|tocino|longg?anisa|chicharr?on|sisig|dinuguan|embutido|hotdogs?|spam|luncheon meat|bagnet|pata|menudo)\b/i;
// Eid dishes: no processed meat (often not halal) or offal stews.
const SEASON_EID_AVOID = /\b(corned|luncheon|tripas|tripe|liver|hotdogs?|sausages?)\b/i;
// Sauces and dips aren't a dish to serve (Lechon Sauce).
const SEASON_SAUCE = /\b(sauce|dip|dressing|gravy|marinade)\s*(recipe)?\s*$/i;

/** The match words of an occasion, in the order they are listed (most typical first). */
function matchWords(o) {
  const src = o.match.source.replace(/^\\b\(/, "").replace(/\)\\b$/, "");
  const words = [];
  let depth = 0, cur = "";
  for (const ch of src) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "|" && depth === 0) { words.push(cur); cur = ""; } else cur += ch;
  }
  words.push(cur);
  return words.map((w) => new RegExp(`\\b(${w})\\b`, "i"));
}

/** How typical a title is for an occasion: the place of the first match word it contains (lower is better). */
function typicalRank(o, title) {
  o.words ??= matchWords(o);
  const i = o.words.findIndex((re) => re.test(title));
  return i < 0 ? Infinity : i;
}

// How many days before the event an occasion starts to show: two weeks, so there's time to plan and
// shop; a month for Christmas (Noche Buena), which families plan and save for earlier (owner's choice).
// Outside these windows the Okasyon box is not shown at all.
const SEASON_LEAD = 14;
const SEASON_LEAD_XMAS = 30;

/**
 * Each occasion: when it is (start and end for a year, or null), how many days ahead it starts
 * showing (`lead`), title words that fit it (`match`), and words it leaves out (`avoid`).
 * `meatless` keeps only fish and vegetable dishes (Holy Week); `noPork` is for the Eids.
 */
const OCCASIONS = [
  { key: "bagongtaon", icon: "🎆", tl: "Bagong Taon · Media Noche", en: "New Year · Media Noche",
    when: (y) => [SEASON_ymd(y, 12, 26), SEASON_ymd(y + 1, 1, 1)], lead: SEASON_LEAD - 6, // 2 weeks before Jan 1: from Dec 18
    match: /\b(new year|media noche|pancit|bihon|canton|sotanghon|miki|spaghetti|biko|sapin[- ]?sapin|kalamay|tikoy|suman|maja|ube halaya|fruit salad|buko salad|lechon|hamon|ham|embutido|lumpia|leche flan|graham|grapes?|kare[- ]?kare|menudo|kaldereta|caldereta|mechado|afritada)\b/i,
    avoid: /\b(chicken|manok|fish|isda|tinola)\b/i,
    note: { tl: "Pansit para humaba ang buhay, malagkit na kakanin para magkadikit ang pamilya, at 12 bilog na prutas para swertehin. Iniiwasan ng iba ang manok at isda (“isang kahig, isang tuka”).",
      en: "Noodles for long life, sticky kakanin to keep the family together, and 12 round fruits for luck. Some skip chicken and fish (“scratch for scratch”)." } },
  { key: "sinulog", icon: "🥁", tl: "Sinulog · Santo Niño", en: "Sinulog · Santo Niño",
    when: (y) => { const d = nthWeekday(y, 1, 0, 3); return [addDays(d, -2), d]; }, lead: SEASON_LEAD - 2, // 2 weeks before the Sunday
    match: /\b(lechon|cebu|puso|hanging rice|ngohiong|dinuguan|humba|bam-i|bam i|siomai|sutukil|kinilaw|ginabot|chorizo)\b/i,
    note: { tl: "Pista ng Santo Niño sa Cebu (ikatlong Linggo ng Enero): lechon Cebu, puso at sutukil.",
      en: "Feast of the Santo Niño in Cebu (third Sunday of January): Cebu lechon, puso rice and sutukil." } },
  { key: "cny", icon: "🧧", tl: "Chinese New Year", en: "Chinese New Year",
    when: (y) => fromTable(CNY, y, 0, 2), lead: SEASON_LEAD,
    match: /\b(tikoy|pancit|canton|bihon|siopao|siomai|hopia|dumplings?|kikiam|machang|asado|yang ?chow|fried rice|sweet and sour|steamed fish|lumpia|mami|lomi|maki)\b/i,
    note: { tl: "Tikoy para dumikit ang swerte, pansit para sa mahabang buhay, at siopao, siomai at hopia mula sa Binondo.",
      en: "Tikoy so good luck sticks, noodles for long life, and siopao, siomai and hopia from Binondo." } },
  { key: "valentines", icon: "💝", tl: "Valentine's Day", en: "Valentine's Day",
    when: (y) => [SEASON_ymd(y, 2, 14), SEASON_ymd(y, 2, 14)], lead: SEASON_LEAD,
    match: /\b(salpicao|beef steak|ribeye|t-bone|sirloin|carbonara|pasta|alfredo|baked salmon|salmon|garlic butter shrimp|buttered shrimp|shrimp scampi|chocolate|choco|brownies?|red velvet|cheesecake|panna cotta|strawberr\w*|mango float|crema|leche flan)\b/i,
    avoid: /\b(liver|sardin\w*|burger|monggo|munggo)\b/i,
    note: { tl: "Pang-date sa bahay: steak, pasta at matamis, mas mura kaysa sa restaurant.", en: "Date night at home: steak, pasta and something sweet, for less than a restaurant." } },
  { key: "eidfitr", icon: "🌙", tl: "Eid al-Fitr (Hari Raya)", en: "Eid al-Fitr (Hari Raya)",
    when: (y) => fromTable(EID_FITR, y, 0, 2), lead: SEASON_LEAD, noPork: true,
    match: /\b(pastil|piaparan|rendang|randang|tiyula itum|tiyula|beef|kambing|goat|satti|biryani|kurma|apam|panyalam|dodol|curry|chicken curry|kare)\b/i,
    note: { tl: "Pagtatapos ng Ramadan: pastil, piaparan at rendang ng Maranao at Maguindanao. Walang baboy; mas mabuti kung halal ang karne.",
      en: "The end of Ramadan: pastil, piaparan and rendang from Maranao and Maguindanao kitchens. No pork; halal meat is best." } },
  { key: "kuwaresma", icon: "✝️", tl: "Kuwaresma · Biyernes na walang karne", en: "Lent · meatless Fridays",
    when: (y) => { const e = easterDate(y); return [addDays(e, -46), addDays(e, -8)]; }, lead: SEASON_LEAD, meatless: true,
    match: /\b(paksiw|sinigang|tinola|escabeche|tinapa|daing|tuyo|bangus|tilapia|galunggong|tulingan|sardin\w*|ginataang|ginisang|monggo|munggo|pinakbet|laing|chop suey|tortang talong|lumpiang gulay|okoy|ukoy|kinilaw|fish|hipon|shrimp)\b/i,
    note: { tl: "Tuwing Biyernes ng Kuwaresma, walang karne ang marami: isda, gulay at ginataan.", en: "On Lenten Fridays many skip meat: fish, vegetables and ginataan." } },
  { key: "semanasanta", icon: "🕊️", tl: "Semana Santa", en: "Holy Week",
    when: (y) => { const e = easterDate(y); return [addDays(e, -7), addDays(e, -1)]; }, lead: SEASON_LEAD, meatless: true,
    match: /\b(binignit|ginataang|ginataan|bilo[- ]?bilo|halo[- ]?halo|paksiw|sinigang|escabeche|tinapa|daing|tuyo|bangus|tilapia|galunggong|sardin\w*|ginisang|monggo|munggo|pinakbet|laing|tortang talong|lumpiang gulay|okoy|ukoy|kinilaw|fish|hipon|shrimp)\b/i,
    note: { tl: "Walang karne mula Huwebes Santo hanggang Biyernes Santo para sa marami: binignit, ginataan, isda at gulay.",
      en: "Many skip meat from Maundy Thursday to Good Friday: binignit, ginataan, fish and vegetables." } },
  { key: "floresdemayo", icon: "🌸", tl: "Flores de Mayo · Pahiyas", en: "Flores de Mayo · Pahiyas",
    when: (y) => [SEASON_ymd(y, 5, 1), SEASON_ymd(y, 5, 31)], lead: SEASON_LEAD,
    match: /\b(kiping|pancit habhab|habhab|longg?anisa|lucban|suman|puto|kutsinta|biko|sapin[- ]?sapin|maja|palitaw|espasol|halo[- ]?halo|buko|mais con yelo|sago|gulaman|turon|banana ?cue|maruya)\b/i,
    note: { tl: "Buwan ng mga bulaklak at pista: Pahiyas sa Lucban (Mayo 15) na may kiping, longganisa at pancit habhab, at pampalamig sa tag-init.",
      en: "Month of flowers and fiestas: Pahiyas in Lucban (May 15) with kiping, longganisa and pancit habhab, plus summer coolers." } },
  { key: "mothersday", icon: "💐", tl: "Mother's Day", en: "Mother's Day",
    when: (y) => { const d = nthWeekday(y, 5, 0, 2); return [d, d]; }, lead: SEASON_LEAD,
    match: /\b(kare[- ]?kare|lengua|morcon|caldereta|kaldereta|embutido|baked salmon|salmon|garlic butter shrimp|buttered shrimp|baked mussels|crispy pata|lechon kawali|carbonara|pasta|ube|buko pandan|fruit salad|leche flan|cake)\b/i,
    avoid: /\b(tripas|tripe|monggo|munggo|nuggets?)\b/i,
    note: { tl: "Ipagluto si Nanay ng espesyal: kare-kare, lengua o baked salmon, at panghimagas.", en: "Cook something special for Mom: kare-kare, lengua or baked salmon, and dessert." } },
  { key: "eidadha", icon: "🐐", tl: "Eid al-Adha", en: "Eid al-Adha",
    when: (y) => fromTable(EID_ADHA, y, 0, 2), lead: SEASON_LEAD, noPork: true,
    match: /\b(kambing|goat|kaldereta|caldereta|beef|baka|rendang|kurma|curry|kare|pastil|piaparan|biryani|satti|tiyula)\b/i,
    note: { tl: "Pista ng Pag-aalay: karne ng kambing o baka, hinahati sa pamilya, kapitbahay at nangangailangan. Walang baboy.",
      en: "Feast of Sacrifice: goat or beef, shared with family, neighbours and those in need. No pork." } },
  { key: "kalayaan", icon: "🇵🇭", tl: "Araw ng Kalayaan", en: "Independence Day",
    when: (y) => [SEASON_ymd(y, 6, 12), SEASON_ymd(y, 6, 12)], lead: SEASON_LEAD,
    match: /\b(adobo|sinigang|kare[- ]?kare|lechon|sisig|pancit|lumpia|tinola|bulalo|kaldereta|caldereta|halo[- ]?halo|leche flan|bibingka|puto|turon)\b/i,
    note: { tl: "Hunyo 12: ipagdiwang ang mga klasikong ulam Pinoy, mula adobo hanggang halo-halo.", en: "June 12: celebrate the Filipino classics, from adobo to halo-halo." } },
  { key: "fathersday", icon: "👔", tl: "Father's Day", en: "Father's Day",
    when: (y) => { const d = nthWeekday(y, 6, 0, 3); return [d, d]; }, lead: SEASON_LEAD,
    match: /\b(inihaw|ihaw|grilled|barbecue|bbq|liempo|sisig|crispy pata|lechon kawali|bulalo|kare[- ]?kare|kaldereta|caldereta|beef steak|bistek|tapa|chicharr?on|kilawin|kinilaw|pulutan)\b/i,
    note: { tl: "Para kay Tatay: inihaw, sisig, bulalo at iba pang paborito sa handaan.", en: "For Dad: grilled liempo, sisig, bulalo and other handaan favourites." } },
  { key: "undas", icon: "🕯️", tl: "Undas", en: "All Saints' Day (Undas)",
    when: (y) => [SEASON_ymd(y, 10, 31), SEASON_ymd(y, 11, 2)], lead: SEASON_LEAD - 1, // 2 weeks before Nov 1
    match: /\b(suman|biko|kakanin|palitaw|ginataan|ginataang|bilo[- ]?bilo|puto|kutsinta|sapin[- ]?sapin|maja|espasol|kalamay|cassava cake|turon|pancit|bibingka|binignit|nilupak)\b/i,
    note: { tl: "Baon sa sementeryo: suman, biko, ginataan at pansit, para sa buong pamilyang nagbabantay.",
      en: "Food to bring to the cemetery: suman, biko, ginataan and pancit for the whole family's vigil." } },
  { key: "pasko", icon: "🎄", tl: "Pasko · Noche Buena", en: "Christmas · Noche Buena",
    when: (y) => [SEASON_ymd(y, 12, 16), SEASON_ymd(y, 12, 25)], lead: SEASON_LEAD_XMAS - 9, // a month before Dec 25: from Nov 25
    match: /\b(christmas|noche buena|hamon|ham|queso de bola|lechon|embutido|morcon|relleno|bibingka|puto bumbong|leche flan|fruit salad|buko salad|macaroni salad|spaghetti|kare[- ]?kare|menudo|caldereta|kaldereta|mechado|afritada|lengua|pancit|lumpia|shanghai|graham|buko pandan|ensaymada|tsokolate|hot chocolate|roast(ed)? chicken|cheese ?cake|mango float)\b/i,
    note: { tl: "Simbang Gabi (Dis 16–24) na may bibingka at puto bumbong, tapos Noche Buena: hamon, queso de bola, spaghetti at fruit salad.",
      en: "Simbang Gabi (Dec 16–24) with bibingka and puto bumbong, then Noche Buena: ham, queso de bola, spaghetti and fruit salad." } },
];

/**
 * Occasions that are on today or coming soon, nearest first:
 * [{ o, start, end, now, daysLeft }]. A window can start in one year and end in the next.
 */
function activeOccasions(today = new Date(), list = OCCASIONS) {
  const d = SEASON_ymd(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const out = [];
  for (const o of list) {
    for (const y of [d.getFullYear() - 1, d.getFullYear(), d.getFullYear() + 1]) {
      const w = o.when(y);
      if (!w) continue;
      const [start, end] = w;
      if (d > end) continue;
      const daysLeft = Math.round((start - d) / DAY_MS);
      if (daysLeft > o.lead) continue;
      out.push({ o, start, end, now: daysLeft <= 0, daysLeft: Math.max(0, daysLeft) });
      break;
    }
  }
  return out.sort((a, b) => b.now - a.now || a.daysLeft - b.daysLeft);
}

/** The next start of an occasion on or after today (for ordering the chips), or null. */
function nextStart(o, today = new Date()) {
  const d = SEASON_ymd(today.getFullYear(), today.getMonth() + 1, today.getDate());
  for (const y of [d.getFullYear() - 1, d.getFullYear(), d.getFullYear() + 1]) {
    const w = o.when(y);
    if (w && w[1] >= d) return w[0];
  }
  return null;
}

/**
 * Dishes for an occasion: the title fits it (or, for meatless occasions, any fish or vegetable
 * ulam), nothing it avoids, a photo and a price; best value first, one per title.
 */
function occasionPicks(o, recipes, n = 8, ok = () => true, kindOf = () => "other") {
  const seen = new Set();
  return recipes
    .filter((r) => r.img && r.costPerServing > 0 && ok(r))
    .filter((r) => {
      const title = r.title || "";
      if (r.category === "Sauce & Condiment" || SEASON_SAUCE.test(title)) return false;
      if (o.avoid && o.avoid.test(title)) return false;
      if (o.noPork && (SEASON_PORK.test(title) || SEASON_PORK.test((r.ingredientNames || []).join(" | ")) || SEASON_EID_AVOID.test(title))) return false;
      // Meatless: not a meat dish, and no meat in the title either (Pork Ginataan with Squash).
      if (o.meatless && (kindOf(r) === "karne" || SEASON_PORK.test(title) || /\b(beef|baka|chicken|manok|carabeef|goat|kambing|meat)\b/i.test(title))) return false;
      return o.match.test(title);
    })
    // The most typical dishes first (by the order of the match words), then complete prices and value.
    .map((r) => ({ r, rank: typicalRank(o, r.title) }))
    .sort((a, b) => a.rank - b.rank || (Number(b.r.ranked && !b.r.costIncomplete) - Number(a.r.ranked && !a.r.costIncomplete)) || (b.r.valueScore || 0) - (a.r.valueScore || 0))
    .filter(({ r }) => { const t = r.title.trim().toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; })
    // A mix: the best dish of each kind (bibingka, hamon, fruit salad, …) before a second of any.
    .reduce((rounds, x, i, all) => {
      const nth = all.slice(0, i).filter((y) => y.rank === x.rank).length;
      (rounds[nth] ??= []).push(x.r);
      return rounds;
    }, [])
    .flat()
    .slice(0, n);
}

/** "Nov 1–2", "Dec 26 – Jan 1", "Jun 12". */
function occasionDates(start, end) {
  const f = (d) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  if (+start === +end) return f(start);
  if (start.getMonth() === end.getMonth()) return `${f(start)}–${end.getDate()}`;
  return `${f(start)} – ${f(end)}`;
}

// ── Browse: the "Okasyon" strip ──

let SEASON_PICK = null; // occasion key chosen with a chip; null = the current or next one

function setOccasion(key) {
  SEASON_PICK = key;
  renderOccasion();
  if (typeof trackEvent === "function") trackEvent(`occasion/${key}`);
}

// Folded or open: null = open (the box only shows near an occasion), true/false = the visitor's choice.
let SEASON_OPEN = null;

function toggleOccasion() { SEASON_OPEN = !occasionIsOpen(); renderOccasion(); }
function occasionIsOpen() { return SEASON_OPEN ?? true; }

function renderOccasion() {
  const box = document.getElementById("occasion-picks");
  if (!box || typeof RECIPES === "undefined" || !RECIPES.length) return;
  const en = typeof siteLang === "function" && siteLang() === "en";
  // Only what is on now or coming within its lead time; otherwise the box stays away.
  const active = activeOccasions(new Date());
  if (!active.length) { box.innerHTML = ""; box.classList.remove("occ-folded"); return; }
  const act = active.find((x) => x.o.key === SEASON_PICK) || active[0];
  const o = act.o;
  const when = (act.now ? (en ? "Now" : "Ngayon") : (en ? `In ${act.daysLeft} day${act.daysLeft > 1 ? "s" : ""}` : `Sa loob ng ${act.daysLeft} araw`)) + ` · ${occasionDates(act.start, act.end)}`;
  const ok = (r) => (typeof kitchenOk !== "function" || kitchenOk(r)) && (typeof dietsOk !== "function" || dietsOk(r, activeDiets()));
  const picks = occasionPicks(o, RECIPES, 8, ok, typeof proteinKind === "function" ? proteinKind : undefined);
  const open = occasionIsOpen();
  const toggle = `<button type="button" class="occ-toggle" onclick="toggleOccasion()" aria-expanded="${open}">${escapeHtml(typeof t === "function" ? t(open ? "occ.hide" : "occ.show") : (open ? "▴" : "▾"))}</button>`;
  const head = `<div class="occ-head"><span class="occ-icon" aria-hidden="true">${o.icon}</span>
      <div class="min-w-0 flex-1"><h2 class="occ-title">${escapeHtml(en ? o.en : o.tl)}</h2><p class="occ-kicker">${escapeHtml(when)}</p></div>${toggle}</div>`;
  box.classList.toggle("occ-folded", !open);
  if (!open) { box.innerHTML = head; return; }
  // Chips only when two occasions overlap (Christmas and New Year).
  const chips = active.length < 2 ? "" : `<div class="occ-chips">${active.map((x) => `<button class="wx-btn ${x.o.key === o.key ? "on" : ""}" onclick="setOccasion('${x.o.key}')">${escapeHtml(en ? x.o.en : x.o.tl)}</button>`).join("")}</div>`;
  box.innerHTML = `
    ${head}
    <p class="occ-note">${escapeHtml(en ? o.note.en : o.note.tl)}</p>
    ${chips}
    <div class="occ-row">${picks.map((r) => `
      <button class="occ-card" onclick="openModal(${r.id})">
        <img src="${escapeHtml(r.img)}" alt="" loading="lazy" onerror="imgFallback(this)">
        <span class="occ-name">${escapeHtml(r.title.replace(/ Recipe$/i, ""))}</span>
        <span class="occ-cost">${costText(r)}/serving</span>
      </button>`).join("") || `<p class="text-sm py-4" style="color:#D6E6DA">${en ? "No matching dishes with your Settings (diet, kitchen)." : "Walang tugmang ulam sa Settings mo (diet, kusina)."}</p>`}</div>`;
}

// ── Event theme: two weeks before a big occasion (and during it) the site dresses up for it ──
// html[data-event="pasko"] switches the accents (index.html CSS), a greeting bar shows under the header,
// and festive occasions get a few drifting decorations. Settings can turn it off (SETTINGS.eventTheme
// "off"); ?theme=pasko previews one, ?theme=off hides it. Solemn days (Holy Week, Undas) stay quiet.
const SEASON_THEME_LEAD = 14;
const SEASON_THEMES = {
  pasko: { deco: ["❄", "✦", "❄", "⭐", "❄"], now: { tl: "Maligayang Pasko! 🎄", en: "Merry Christmas! 🎄" } },
  bagongtaon: { deco: ["✨", "🎆", "✨", "🎇"], now: { tl: "Manigong Bagong Taon! 🎆", en: "Happy New Year! 🎆" } },
  cny: { deco: ["🏮", "🧧", "🏮"], now: { tl: "Kung Hei Fat Choi! 🧧", en: "Kung Hei Fat Choi! 🧧" } },
  valentines: { deco: ["💗", "💕", "💗"], now: { tl: "Maligayang Araw ng mga Puso! 💝", en: "Happy Valentine's Day! 💝" } },
  eidfitr: { deco: ["🌙", "✦", "⭐"], now: { tl: "Eid Mubarak! 🌙", en: "Eid Mubarak! 🌙" } },
  eidadha: { deco: ["🌙", "✦", "⭐"], now: { tl: "Eid Mubarak! 🌙", en: "Eid Mubarak! 🌙" } },
  semanasanta: { deco: [], now: { tl: "Semana Santa 🕊️", en: "Holy Week 🕊️" } },
  undas: { deco: [], now: { tl: "Undas: pag-alala sa mga mahal sa buhay 🕯️", en: "Undas: remembering our loved ones 🕯️" } },
  kalayaan: { deco: ["✦", "☀", "✦"], now: { tl: "Maligayang Araw ng Kalayaan! 🇵🇭", en: "Happy Independence Day! 🇵🇭" } },
  sinulog: { deco: ["🥁", "✦"], now: { tl: "Pit Señor! Viva Sinulog! 🥁", en: "Pit Señor! Viva Sinulog! 🥁" } },
  floresdemayo: { deco: ["🌸", "🌼", "🌸"], now: { tl: "Flores de Mayo 🌸", en: "Flores de Mayo 🌸" } },
  mothersday: { deco: ["💐", "🌷"], now: { tl: "Maligayang Araw ng mga Ina! 💐", en: "Happy Mother's Day! 💐" } },
  fathersday: { deco: ["✦", "👔"], now: { tl: "Maligayang Araw ng mga Ama! 👔", en: "Happy Father's Day! 👔" } },
};

/**
 * The occasion the site is themed for today: one that's on, else the nearest starting within two
 * weeks. { key, o, start, end, now, daysLeft } or null. Kuwaresma (40 days) has no theme. Pure, tested.
 */
function eventThemeFor(today = new Date(), list = OCCASIONS) {
  const d = SEASON_ymd(today.getFullYear(), today.getMonth() + 1, today.getDate());
  let best = null;
  for (const o of list) {
    if (!SEASON_THEMES[o.key]) continue;
    for (const y of [d.getFullYear() - 1, d.getFullYear(), d.getFullYear() + 1]) {
      const w = o.when(y);
      if (!w) continue;
      const [start, end] = w;
      if (d > end) continue;
      const daysLeft = Math.round((start - d) / DAY_MS);
      if (daysLeft > SEASON_THEME_LEAD) break;
      const cand = { key: o.key, o, start, end, now: daysLeft <= 0, daysLeft: Math.max(0, daysLeft) };
      if (!best || (cand.now && !best.now) || (cand.now === best.now && cand.daysLeft < best.daysLeft)) best = cand;
      break;
    }
  }
  return best;
}

/** The theme to show: a ?theme= preview first, then nothing if turned off in Settings, else today's. */
function currentEventTheme(today = new Date()) {
  const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("theme") : null;
  if (q === "off") return null;
  if (q && SEASON_THEMES[q]) {
    const o = OCCASIONS.find((x) => x.key === q);
    const w = o && (o.when(today.getFullYear()) || o.when(today.getFullYear() + 1));
    return o ? { key: q, o, start: w ? w[0] : today, end: w ? w[1] : today, now: true, daysLeft: 0, preview: true } : null;
  }
  if (typeof SETTINGS !== "undefined" && SETTINGS.eventTheme === "off") return null;
  return eventThemeFor(today);
}

const EVENT_HIDE_KEY = "sarapsulit.eventbar.v1";

function applyEventTheme() {
  if (typeof document === "undefined") return;
  const th = currentEventTheme();
  const root = document.documentElement;
  if (th) root.dataset.event = th.key; else delete root.dataset.event;
  if (typeof applyEventHero === "function") applyEventHero();
  let bar = document.getElementById("event-bar");
  let deco = document.getElementById("event-deco");
  if (!th) { if (bar) bar.remove(); if (deco) deco.remove(); return; }
  const en = typeof siteLang === "function" && siteLang() === "en";
  const conf = SEASON_THEMES[th.key];
  const name = en ? th.o.en : th.o.tl;
  const text = th.now ? (en ? conf.now.en : conf.now.tl)
    : en ? `${th.o.icon} ${th.daysLeft} day${th.daysLeft === 1 ? "" : "s"} to go: ${name}` : `${th.o.icon} ${th.daysLeft} araw na lang: ${name}`;
  let hidden = "";
  try { hidden = localStorage.getItem(EVENT_HIDE_KEY) || ""; } catch { /* private mode */ }
  const today = new Date().toISOString().slice(0, 10);
  if (hidden === `${th.key}|${today}` && !th.preview) { if (bar) bar.remove(); }
  else {
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "event-bar";
      bar.className = "event-bar";
      bar.setAttribute("role", "note");
      const header = document.querySelector(".site-header");
      if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling); else document.body.prepend(bar);
    }
    bar.innerHTML = `<div class="event-bar-in"><span class="event-bar-text">${escapeHtml(text)}</span>
      <button type="button" class="event-bar-go" onclick="eventBarGo()">${en ? '<span class="ev-long">See the </span>handaan picks →' : '<span class="ev-long">Tingnan ang </span>pang-handaan →'}</button>
      <button type="button" class="event-bar-x" onclick="hideEventBar('${th.key}')" aria-label="${en ? "Hide for today" : "Itago ngayong araw"}">✕</button></div>`;
  }
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!conf.deco.length || reduce) { if (deco) deco.remove(); return; }
  if (!deco) {
    deco = document.createElement("div");
    deco.id = "event-deco";
    deco.className = "event-deco";
    deco.setAttribute("aria-hidden", "true");
    document.body.appendChild(deco);
  }
  // A handful of slow, drifting pieces near the edges, never over the middle of the page.
  deco.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const left = i % 2 ? 2 + (i * 7) % 12 : 86 + (i * 5) % 12;
    return `<span style="left:${left}%;animation-delay:${(i * 1.7) % 12}s;animation-duration:${14 + (i % 4) * 3}s">${conf.deco[i % conf.deco.length]}</span>`;
  }).join("");
}

function hideEventBar(key) {
  try { localStorage.setItem(EVENT_HIDE_KEY, `${key}|${new Date().toISOString().slice(0, 10)}`); } catch { /* not saved */ }
  const bar = document.getElementById("event-bar");
  if (bar) bar.remove();
}

/** The bar's button: open Recipes at the Okasyon picks for this occasion. */
function eventBarGo() {
  const th = currentEventTheme();
  if (typeof showSection === "function") showSection("browse");
  if (th && typeof setOccasion === "function") setOccasion(th.key);
  const box = document.getElementById("occasion-picks");
  if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyEventTheme); else applyEventTheme();
}

// ── Bigger decorations inside the home hero, per occasion (all drawn here, no images) ──

const EV_PAROL = (c1, c2) => `<svg viewBox="0 0 100 170" class="ev-parol"><line x1="50" y1="0" x2="50" y2="22" stroke="#d9c9a3" stroke-width="2"/>
  <g class="ev-glow"><polygon points="50,22 62,49 92,51 68,70 77,100 50,83 23,100 32,70 8,51 38,49" fill="${c1}" stroke="${c2}" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="50,40 56,54 71,55 59,64 63,79 50,71 37,79 41,64 29,55 44,54" fill="${c2}" opacity=".85"/><circle cx="50" cy="60" r="7" fill="#fff8d6"/></g>
  <path d="M36 97 q-6 30 -12 62" stroke="${c2}" stroke-width="3" fill="none"/><path d="M50 90 q0 34 0 72" stroke="${c1}" stroke-width="3" fill="none"/><path d="M64 97 q6 30 12 62" stroke="${c2}" stroke-width="3" fill="none"/></svg>`;
const EV_LANTERN = `<svg viewBox="0 0 80 150" class="ev-lantern"><line x1="40" y1="0" x2="40" y2="22" stroke="#E0B23A" stroke-width="2"/>
  <rect x="26" y="20" width="28" height="8" rx="2" fill="#E0B23A"/><ellipse cx="40" cy="62" rx="32" ry="36" fill="#D7263D"/>
  <path d="M40 26 v72 M22 32 q-8 30 0 60 M58 32 q8 30 0 60" stroke="#B0102A" stroke-width="2" fill="none"/>
  <rect x="26" y="96" width="28" height="8" rx="2" fill="#E0B23A"/><path d="M34 104 v34 M40 104 v40 M46 104 v34" stroke="#E0B23A" stroke-width="2"/></svg>`;
const EV_HEART = `<svg viewBox="0 0 32 30" class="ev-heart"><path d="M16 29 C-6 14 2 -4 16 7 C30 -4 38 14 16 29Z"/></svg>`;
const EV_SUN = `<svg viewBox="0 0 120 120" class="ev-sun"><g fill="#FCD116">${Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45} 60 60)" d="M60 4 L66 30 L60 26 L54 30Z"/><path transform="rotate(${i * 45 + 22.5} 60 60)" d="M60 14 L63 30 L57 30Z" opacity=".8"/>`).join("")}<circle cx="60" cy="60" r="24"/></g></svg>`;
const EV_STAR = (c) => `<svg viewBox="0 0 24 24" class="ev-star"><polygon points="12,1 15,9 23,9 17,14 19,22 12,17 5,22 7,14 1,9 9,9" fill="${c}"/></svg>`;
const EV_MOON = `<svg viewBox="0 0 120 120" class="ev-moon"><defs><mask id="evm"><rect width="120" height="120" fill="#fff"/><circle cx="74" cy="48" r="42" fill="#000"/></mask></defs><circle cx="56" cy="60" r="44" fill="#F2D27A" mask="url(#evm)"/></svg>`;
const EV_FANOUS = `<svg viewBox="0 0 60 140" class="ev-fanous"><line x1="30" y1="0" x2="30" y2="20" stroke="#E2C27A" stroke-width="2"/><path d="M18 22 h24 l-4 10 h-16z" fill="#C9971C"/>
  <path d="M14 34 h32 l-4 50 h-24z" fill="#F7D774" opacity=".9" stroke="#C9971C" stroke-width="2"/><path d="M20 40 l10 36 l10 -36" stroke="#C9971C" stroke-width="1.5" fill="none"/>
  <path d="M18 86 h24 l-12 16z" fill="#C9971C"/></svg>`;
const EV_CANDLE = `<svg viewBox="0 0 40 110" class="ev-candle"><path class="ev-flame" d="M20 6 C28 18 26 30 20 34 C14 30 12 18 20 6Z" fill="#FFC857"/><circle cx="20" cy="30" r="10" fill="#FFC857" opacity=".25"/>
  <rect x="12" y="36" width="16" height="70" rx="3" fill="#F4ECDA"/><path d="M12 48 q8 4 16 0" stroke="#d9cdb4" fill="none"/></svg>`;
const EV_FLOWER = (c) => `<svg viewBox="0 0 40 40" class="ev-flower">${Array.from({ length: 6 }, (_, i) => `<ellipse cx="20" cy="9" rx="6" ry="9" fill="${c}" transform="rotate(${i * 60} 20 20)"/>`).join("")}<circle cx="20" cy="20" r="6" fill="#F2C94C"/></svg>`;
const EV_PALM = `<svg viewBox="0 0 120 160" class="ev-palm"><path d="M60 158 C58 110 62 60 70 6" stroke="#cdb8e0" stroke-width="3" fill="none"/>${Array.from({ length: 12 }, (_, i) => { const y = 30 + i * 10; return `<path d="M${64 - i * 0.6} ${y} q-26 -6 -40 6" stroke="#cdb8e0" stroke-width="2" fill="none"/><path d="M${64 - i * 0.6} ${y} q26 -8 40 2" stroke="#cdb8e0" stroke-width="2" fill="none"/>`; }).join("")}</svg>`;
// Banderitas: the fiesta bunting strung across the top.
const EV_BUNTING = (colors) => `<div class="ev-bunting">${Array.from({ length: 28 }, (_, i) => `<i style="--c:${colors[i % colors.length]}"></i>`).join("")}</div>`;

/** The hero decoration for an occasion (HTML, decorative only). Pure, tested. */
function eventHeroDeco(key) {
  const snow = (n, ch = "❄") => Array.from({ length: n }, (_, i) => `<span class="ev-fall" style="left:${(i * 37) % 100}%;animation-delay:${(i * 0.9) % 9}s;animation-duration:${8 + (i % 5) * 2}s;font-size:${0.7 + (i % 3) * 0.35}rem">${ch}</span>`).join("");
  switch (key) {
    case "pasko": return `<div class="ev-lights"></div><div class="ev-hang ev-l1">${EV_PAROL("#E5484D", "#F2C94C")}</div><div class="ev-hang ev-l2">${EV_PAROL("#2E9E5B", "#F2C94C")}</div>
      <div class="ev-hang ev-r1">${EV_PAROL("#F2C94C", "#E5484D")}</div><div class="ev-hang ev-r2">${EV_PAROL("#E5484D", "#ffffff")}</div>${snow(26)}`;
    case "bagongtaon": return `${Array.from({ length: 6 }, (_, i) => `<span class="ev-firework" style="left:${[8, 22, 80, 92, 15, 86][i]}%;top:${[18, 45, 20, 50, 70, 75][i]}%;--fw:${["#F2C94C", "#E5484D", "#7CC4FF", "#F4A6C0", "#9BE07A", "#F2C94C"][i]};animation-delay:${i * 0.55}s"></span>`).join("")}${snow(14, "✦")}`;
    case "cny": return `<div class="ev-hang ev-l1">${EV_LANTERN}</div><div class="ev-hang ev-l2">${EV_LANTERN}</div><div class="ev-hang ev-r1">${EV_LANTERN}</div><div class="ev-hang ev-r2">${EV_LANTERN}</div>
      <div class="ev-pattern ev-cny-pattern"></div>${snow(10, "🧧")}`;
    case "valentines": case "mothersday": return `${Array.from({ length: 16 }, (_, i) => `<span class="ev-rise" style="left:${(i * 29) % 100}%;animation-delay:${(i * 0.8) % 8}s;animation-duration:${9 + (i % 4) * 2}s;--s:${0.6 + (i % 4) * 0.3}">${EV_HEART}</span>`).join("")}
      ${key === "mothersday" ? `<div class="ev-corner ev-bl">${EV_FLOWER("#F4A6C0")}${EV_FLOWER("#ffffff")}${EV_FLOWER("#F2C94C")}</div>` : ""}`;
    case "kalayaan": return `${EV_BUNTING(["#0038A8", "#CE1126", "#FCD116", "#ffffff"])}<div class="ev-corner ev-sun-wrap">${EV_SUN}</div>
      <div class="ev-stars"><span>${EV_STAR("#FCD116")}</span><span>${EV_STAR("#FCD116")}</span><span>${EV_STAR("#FCD116")}</span></div>`;
    case "sinulog": case "floresdemayo": return `${EV_BUNTING(key === "sinulog" ? ["#C8102E", "#F2B705", "#1F6FB2", "#2E9E5B", "#ffffff"] : ["#F4A6C0", "#F2C94C", "#7CC4FF", "#9BE07A", "#ffffff"])}
      ${key === "floresdemayo" ? `<div class="ev-corner ev-bl">${EV_FLOWER("#F4A6C0")}${EV_FLOWER("#ffffff")}${EV_FLOWER("#F2C94C")}${EV_FLOWER("#C2255C")}</div><div class="ev-corner ev-br">${EV_FLOWER("#ffffff")}${EV_FLOWER("#F4A6C0")}${EV_FLOWER("#F2C94C")}</div>` : snow(10, "✦")}`;
    case "eidfitr": case "eidadha": return `<div class="ev-corner ev-moon-wrap">${EV_MOON}<span class="ev-moon-star">${EV_STAR("#F2D27A")}</span></div>
      <div class="ev-hang ev-l1">${EV_FANOUS}</div><div class="ev-hang ev-l2">${EV_FANOUS}</div><div class="ev-hang ev-r2">${EV_FANOUS}</div>${snow(14, "✦")}`;
    case "undas": return `<div class="ev-corner ev-candles">${EV_CANDLE}${EV_CANDLE}${EV_CANDLE}</div><div class="ev-corner ev-candles ev-candles-r">${EV_CANDLE}${EV_CANDLE}</div>`;
    case "semanasanta": return `<div class="ev-corner ev-palm-l">${EV_PALM}</div><div class="ev-corner ev-palm-r">${EV_PALM}</div><div class="ev-rays"></div>`;
    case "fathersday": return `${snow(12, "✦")}<div class="ev-corner ev-br ev-tie">👔</div>`;
    default: return "";
  }
}

function applyEventHero() {
  if (typeof document === "undefined") return;
  const hero = document.querySelector(".hero-band");
  if (!hero) return;
  const th = currentEventTheme();
  let layer = hero.querySelector(".ev-hero");
  if (!th) { if (layer) layer.remove(); return; }
  if (!layer) { layer = document.createElement("div"); layer.className = "ev-hero"; layer.setAttribute("aria-hidden", "true"); hero.prepend(layer); }
  if (layer.dataset.key !== th.key) { layer.dataset.key = th.key; layer.innerHTML = eventHeroDeco(th.key); }
}
