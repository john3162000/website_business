// Counts posts on Panlasang Pinoy and Kawaling Pinoy from their public sitemaps (page addresses
// only) and how many dishes both sites have, by comparing normalized dish names from the URLs.
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (compatible; SarapSulit-count/1.0)";
const get = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
};
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

async function posts(base) {
  let maps = [];
  for (const idx of ["sitemap_index.xml", "wp-sitemap.xml", "sitemap.xml"]) {
    try { maps = locs(await get(`${base}/${idx}`)).filter((u) => /post-sitemap\d*\.xml$|wp-sitemap-posts-post-\d+\.xml$/.test(u)); if (maps.length) break; } catch (e) { console.log(`  ${idx}: ${e.message}`); }
  }
  console.log(`${base}: ${maps.length} post sitemaps`);
  for (const idx of ["sitemap_index.xml", "wp-sitemap.xml"]) {
    try { const all = locs(await get(`${base}/${idx}`)); console.log(`  ${idx} lists: ${all.map((u) => u.split("/").pop()).join(", ")}`); } catch {}
  }
  const urls = new Set();
  for (const m of maps) for (const u of locs(await get(m))) if (u.startsWith(base) && !/\.(jpe?g|png|webp)$/i.test(u)) urls.add(u);
  return [...urls];
}

// Words that don't change the dish: "recipe", "how to cook", "easy", "filipino style", years, …
const FILLER = new Set("recipe recipes how to cook make making best easy simple quick homemade authentic classic filipino pinoy style the a an and with my our special ultimate perfect version way ala la de".split(" "));
const SYN = [[/\bbaboy\b/g, "pork"], [/\bmanok\b/g, "chicken"], [/\bbaka\b/g, "beef"], [/\bhipon\b/g, "shrimp"], [/\bisda\b/g, "fish"], [/\bpansit\b/g, "pancit"], [/\bkarekare\b/g, "kare kare"]];
function dishKey(url) {
  let s = decodeURIComponent(new URL(url).pathname).replace(/\/$/, "").split("/").pop().toLowerCase();
  s = s.replace(/-\d+$/, "").replace(/[-_]+/g, " ");
  for (const [re, to] of SYN) s = s.replace(re, to);
  const words = s.split(" ").filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].sort().join(" ");
}
// Roundups and articles, not single recipes.
const NOT_RECIPE = /\b(\d+ (best|easy|ways)|ideas|roundup|guide|tips|list|vs|review|giveaway|announcement|cookbook|top \d+)\b/;

const sites = { pp: "https://panlasangpinoy.com", kp: "https://www.kawalingpinoy.com" };
const data = {};
for (const [k, base] of Object.entries(sites)) {
  try {
    const all = await posts(base);
    const recipes = all.filter((u) => !NOT_RECIPE.test(u.replace(/-/g, " ")));
    data[k] = { all: all.length, recipes, keys: new Map(recipes.map((u) => [dishKey(u), u])) };
    console.log(`${k}: ${all.length} posts, ${recipes.length} after dropping roundups/articles, ${data[k].keys.size} distinct dish names`);
  } catch (e) { console.log(`${k} failed: ${e.message}`); }
}
if (data.pp && data.kp) {
  const exact = [...data.kp.keys.keys()].filter((key) => data.pp.keys.has(key));
  // Near matches: same words except one (e.g. "chicken adobo" vs "adobo chicken sauce").
  const ppKeys = [...data.pp.keys.keys()].map((k) => new Set(k.split(" ")));
  const near = [...data.kp.keys.keys()].filter((key) => !data.pp.keys.has(key)).filter((key) => {
    const a = new Set(key.split(" "));
    return a.size >= 2 && ppKeys.some((b) => { let same = 0; for (const w of a) if (b.has(w)) same++; return same >= 2 && same >= Math.max(a.size, b.size) - 1; });
  });
  const union = data.pp.keys.size + data.kp.keys.size - exact.length;
  console.log(`\nSame dish name on both sites: ${exact.length}`);
  console.log(`Near matches (one word different): ${near.length}`);
  console.log(`Combined distinct dishes: ${union} (exact) · about ${union - near.length} if near matches are also the same dish`);
  console.log(`\nExamples of shared dishes: ${exact.slice(0, 40).join(" | ")}`);
  console.log(`\nExamples of near matches: ${near.slice(0, 25).join(" | ")}`);
  writeFileSync("demo/overlap-out/shared.txt", exact.map((k) => `${data.kp.keys.get(k)}\t${data.pp.keys.get(k)}`).join("\n"));
}
