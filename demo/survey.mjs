// Sizes up Filipino recipe sites: post count from sitemaps, robots.txt rules, whether pages carry
// schema.org Recipe JSON-LD (ingredients we can price), and whether their terms forbid scraping.
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (compatible; SarapSulitBot/1.0; +https://john3162000.github.io/website_business/)";
const SITES = [
  "https://www.kawalingpinoy.com", "https://www.foxyfolksy.com", "https://www.angsarap.net", "https://pinoyrecipe.net",
  "https://rivertenkitchen.com", "https://salusalorecipes.com", "https://www.manilaspoon.com", "https://www.recipesbynora.com",
  "https://www.mamasguiderecipes.com", "https://lutongbahayrecipe.com", "https://www.pinoycookingrecipes.com",
  "https://www.yummykitchentv.com", "https://www.overseaspinoycooking.net", "https://thefoodietakesflight.com",
  "https://www.kitchenconfidante.com", "https://www.amiablefoods.com", "https://www.filipino-recipes-lutong-pinoy.com",
  "https://www.casabaluartefilipinorecipes.com", "https://www.yummy.ph", "https://www.ajinomoto.com.ph",
  "https://www.knorr.com", "https://www.pepper.ph", "https://www.filipinofoodrecipes.net", "https://www.pinoyfoodguide.com",
  "https://www.savorythoughts.com", "https://www.ihearteating.com", "https://www.jeanelleats.com", "https://www.jainacooks.com",
  "https://www.seriouseats.com", "https://www.lutongbahay.net", "https://www.panlasangpinoyrecipes.com",
  "https://www.chefjardine.com", "https://www.foodandjourneys.net", "https://www.kusinamaster.com",
  "https://www.atbp.ph", "https://www.pinoyhapagkainan.com", "https://cookingwithcocktailrings.com",
  "https://www.wokandkin.com", "https://www.thepeachkitchen.com", "https://www.makeitdairyfree.com",
];
const get = async (url, ms = 20000) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml,*/*" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
  return { ok: r.ok, status: r.status, url: r.url, text: r.ok ? await r.text() : "" };
};
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

function robotsAllows(txt, path = "/") {
  // Groups for * (and our bot); a "Disallow: /" there blocks us.
  let applies = false, blocked = false, ai = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, k, v] = m;
    if (/user-agent/i.test(k)) { applies = v === "*" || /sarapsulit/i.test(v); if (/gpt|claude|anthropic|ccbot|google-extended|bytespider|perplexity/i.test(v)) ai.push(v); continue; }
    if (applies && /disallow/i.test(k) && (v === "/" || (v && path.startsWith(v)))) blocked = true;
  }
  return { blocked, ai: [...new Set(ai)].slice(0, 6) };
}

const rows = [];
for (const base of SITES) {
  const row = { site: base.replace(/^https?:\/\/(www\.)?/, ""), posts: 0, sitemaps: 0, recipeJsonLd: "?", robots: "?", aiBlocks: "", terms: "", note: "" };
  try {
    const rb = await get(`${base}/robots.txt`).catch(() => null);
    if (rb && rb.ok) { const r = robotsAllows(rb.text, "/"); row.robots = r.blocked ? "BLOCKS *" : "ok"; row.aiBlocks = r.ai.join(" "); }
    else row.robots = rb ? `no robots (${rb.status})` : "unreachable";
    let maps = [];
    for (const idx of ["sitemap_index.xml", "wp-sitemap.xml", "sitemap.xml"]) {
      const s = await get(`${base}/${idx}`).catch(() => null);
      if (!s || !s.ok) continue;
      const all = locs(s.text);
      maps = all.filter((u) => /(post|recipe)[-_a-z]*sitemap\d*\.xml|sitemap-posts-(post|recipe)|wp-sitemap-posts-(post|recipe)/i.test(u));
      if (!maps.length && all.some((u) => !/\.xml/.test(u))) { row.posts = all.length; row.note = "flat sitemap"; }
      if (maps.length) break;
    }
    row.sitemaps = maps.length;
    const urls = new Set();
    for (const m of maps.slice(0, 15)) { const s = await get(m).catch(() => null); if (s && s.ok) for (const u of locs(s.text)) if (!/\.(jpe?g|png|webp|gif)$/i.test(u)) urls.add(u); }
    if (urls.size) row.posts = urls.size;
    // JSON-LD Recipe on three sample posts from the middle of the list
    const sample = [...urls].filter((u) => !/\/(category|tag|page)\//.test(u)).slice(10, 13);
    let hits = 0;
    for (const u of sample) {
      const p = await get(u).catch(() => null);
      if (p && p.ok && /"@type"\s*:\s*(\[[^\]]*)?"Recipe"/.test(p.text) && /recipeIngredient/.test(p.text)) hits++;
    }
    row.recipeJsonLd = sample.length ? `${hits}/${sample.length}` : "-";
    // Terms: look for words forbidding automated collection
    for (const path of ["terms", "terms-of-use", "terms-and-conditions", "terms-of-service", "disclaimer", "legal"]) {
      const t = await get(`${base}/${path}/`, 12000).catch(() => null);
      if (!t || !t.ok) continue;
      const txt = t.text.replace(/<[^>]+>/g, " ").toLowerCase();
      const hit = txt.match(/[^.]{0,80}(scrap(e|ing)|crawl(er|ing)?|spider|data mining|automated (means|tools|access|systems))[^.]{0,80}/);
      row.terms = hit ? `/${path}: "${hit[0].replace(/\s+/g, " ").trim().slice(0, 150)}"` : `/${path}: no anti-scraping clause found`;
      break;
    }
  } catch (e) { row.note = e.message.slice(0, 60); }
  rows.push(row);
  console.log(JSON.stringify(row));
}
writeFileSync("demo/survey-out/survey.json", JSON.stringify(rows, null, 1));
console.log("\nTOTAL posts (all sites):", rows.reduce((s, r) => s + r.posts, 0));
