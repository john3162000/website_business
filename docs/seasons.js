// Okasyon: holiday and special-event dishes at the top of Browse. The occasion that is on now
// (or coming soon) is picked from today's date; chips let people look ahead to the others.
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

// How many days ahead an occasion is suggested: two weeks, so there's time to plan and shop; six
// weeks for Christmas and New Year, which families plan (and save for) much earlier.
const SEASON_LEAD = 14;
const SEASON_LEAD_BIG = 42;

/**
 * Each occasion: when it is (start and end for a year, or null), how many days ahead it starts
 * showing (`lead`), title words that fit it (`match`), and words it leaves out (`avoid`).
 * `meatless` keeps only fish and vegetable dishes (Holy Week); `noPork` is for the Eids.
 */
const OCCASIONS = [
  { key: "bagongtaon", icon: "🎆", tl: "Bagong Taon · Media Noche", en: "New Year · Media Noche",
    when: (y) => [SEASON_ymd(y, 12, 26), SEASON_ymd(y + 1, 1, 1)], lead: SEASON_LEAD_BIG - 6, // 6 weeks before Jan 1
    match: /\b(new year|media noche|pancit|bihon|canton|sotanghon|miki|spaghetti|biko|sapin[- ]?sapin|kalamay|tikoy|suman|maja|ube halaya|fruit salad|buko salad|lechon|hamon|ham|embutido|lumpia|leche flan|graham|grapes?|kare[- ]?kare|menudo|kaldereta|caldereta|mechado|afritada)\b/i,
    avoid: /\b(chicken|manok|fish|isda|tinola)\b/i,
    note: { tl: "Pansit para humaba ang buhay, malagkit na kakanin para magkadikit ang pamilya, at 12 bilog na prutas para swertehin. Iniiwasan ng iba ang manok at isda (“isang kahig, isang tuka”).",
      en: "Noodles for long life, sticky kakanin to keep the family together, and 12 round fruits for luck. Some skip chicken and fish (“scratch for scratch”)." } },
  { key: "sinulog", icon: "🥁", tl: "Sinulog · Santo Niño", en: "Sinulog · Santo Niño",
    when: (y) => { const d = nthWeekday(y, 1, 0, 3); return [addDays(d, -2), d]; }, lead: SEASON_LEAD,
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
    when: (y) => [SEASON_ymd(y, 10, 31), SEASON_ymd(y, 11, 2)], lead: SEASON_LEAD,
    match: /\b(suman|biko|kakanin|palitaw|ginataan|ginataang|bilo[- ]?bilo|puto|kutsinta|sapin[- ]?sapin|maja|espasol|kalamay|cassava cake|turon|pancit|bibingka|binignit|nilupak)\b/i,
    note: { tl: "Baon sa sementeryo: suman, biko, ginataan at pansit, para sa buong pamilyang nagbabantay.",
      en: "Food to bring to the cemetery: suman, biko, ginataan and pancit for the whole family's vigil." } },
  { key: "pasko", icon: "🎄", tl: "Pasko · Noche Buena", en: "Christmas · Noche Buena",
    when: (y) => [SEASON_ymd(y, 12, 16), SEASON_ymd(y, 12, 25)], lead: SEASON_LEAD_BIG - 9, // 6 weeks before Dec 25
    match: /\b(christmas|noche buena|hamon|ham|queso de bola|lechon|embutido|morcon|relleno|bibingka|puto bumbong|leche flan|fruit salad|buko salad|macaroni salad|spaghetti|kare[- ]?kare|menudo|caldereta|kaldereta|mechado|afritada|lengua|pancit|lumpia|shanghai|graham|buko pandan|ensaymada|tsokolate|hot chocolate|roast(ed)? chicken|cheese ?cake|mango float)\b/i,
    note: { tl: "Simbang Gabi (Dis 16–24) na may bibingka at puto bumbong, tapos Noche Buena: hamon, queso de bola, spaghetti at fruit salad.",
      en: "Simbang Gabi (Dec 16–24) with bibingka and puto bumbong, then Noche Buena: ham, queso de bola, spaghetti and fruit salad." } },
  // No fixed date: always in the chips.
  { key: "handaan", icon: "🎂", tl: "Handaan · Birthday", en: "Party · Birthday", when: () => null, lead: 0,
    match: /\b(pancit|bihon|canton|palabok|spaghetti|lumpia|shanghai|embutido|menudo|kaldereta|caldereta|afritada|mechado|fried chicken|barbecue|bbq|leche flan|fruit salad|buko pandan|graham|maja|puto|kutsinta|cake|macaroni)\b/i,
    note: { tl: "Pang-handaan: pansit para humaba ang buhay, spaghetti para sa mga bata, at lumpiang shanghai na laging ubos.",
      en: "Party food: pancit for long life, sweet spaghetti for the kids, and lumpiang shanghai that always runs out." } },
  { key: "fiesta", icon: "🎉", tl: "Pista sa baryo", en: "Town fiesta", when: () => null, lead: 0,
    match: /\b(lechon|kare[- ]?kare|kaldereta|caldereta|menudo|afritada|mechado|embutido|relleno|morcon|dinuguan|pancit|lumpia|leche flan|maja|biko|suman|puto|kutsinta|buko pandan|fruit salad|halo[- ]?halo)\b/i,
    note: { tl: "Bukas ang bahay sa pista: lechon, kaldereta, dinuguan at kakanin para sa lahat ng bisita.", en: "Open house for the fiesta: lechon, kaldereta, dinuguan and kakanin for every guest." } },
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

function renderOccasion() {
  const box = document.getElementById("occasion-picks");
  if (!box || typeof RECIPES === "undefined" || !RECIPES.length) return;
  const en = typeof siteLang === "function" && siteLang() === "en";
  const today = new Date();
  const active = activeOccasions(today);
  const key = SEASON_PICK || (active[0] ? active[0].o.key : "handaan");
  const o = OCCASIONS.find((x) => x.key === key) || OCCASIONS[0];
  const act = active.find((a) => a.o.key === o.key);
  const next = nextStart(o, today);
  const when = act
    ? (act.now ? (en ? "Now" : "Ngayon") : (en ? `In ${act.daysLeft} day${act.daysLeft > 1 ? "s" : ""}` : `Sa loob ng ${act.daysLeft} araw`)) + ` · ${occasionDates(act.start, act.end)}`
    : next ? `${en ? "Next" : "Susunod"}: ${occasionDates(next, next)}` : (en ? "Any time" : "Kahit kailan");
  // Chips: what's on or coming first, then the rest by their next date, the undated ones last.
  const order = [...OCCASIONS].sort((a, b) => {
    const aa = active.findIndex((x) => x.o.key === a.key), bb = active.findIndex((x) => x.o.key === b.key);
    if (aa !== bb && (aa < 0 || bb < 0)) return aa < 0 ? 1 : -1;
    if (aa >= 0 && bb >= 0) return aa - bb;
    const na = nextStart(a, today), nb = nextStart(b, today);
    return (na ? +na : Infinity) - (nb ? +nb : Infinity);
  });
  const ok = (r) => (typeof kitchenOk !== "function" || kitchenOk(r)) && (typeof dietsOk !== "function" || dietsOk(r, activeDiets()));
  const picks = occasionPicks(o, RECIPES, 8, ok, typeof proteinKind === "function" ? proteinKind : undefined);
  box.innerHTML = `
    <div class="occ-head">
      <span class="occ-icon" aria-hidden="true">${o.icon}</span>
      <div class="min-w-0">
        <p class="occ-kicker">${en ? "Special picks" : "Espesyal na handa"} · ${escapeHtml(when)}</p>
        <h2 class="occ-title">${escapeHtml(en ? o.en : o.tl)}</h2>
      </div>
    </div>
    <p class="occ-note">${escapeHtml(en ? o.note.en : o.note.tl)}</p>
    <div class="occ-chips">${order.map((x) => `<button class="wx-btn ${x.key === o.key ? "on" : ""}" onclick="setOccasion('${x.key}')">${x.icon} ${escapeHtml(en ? x.en : x.tl)}${active.some((a) => a.o.key === x.key) ? " •" : ""}</button>`).join("")}</div>
    <div class="occ-row">${picks.map((r) => `
      <button class="occ-card" onclick="openModal(${r.id})">
        <img src="${escapeHtml(r.img)}" alt="" loading="lazy">
        <span class="occ-name">${escapeHtml(r.title.replace(/ Recipe$/i, ""))}</span>
        <span class="occ-cost">${costText(r)}/serving</span>
      </button>`).join("") || `<p class="text-sm text-gray-400 py-4">${en ? "No matching dishes with your Settings (diet, kitchen)." : "Walang tugmang ulam sa Settings mo (diet, kusina)."}</p>`}</div>`;
}
