// Temporary: parse sample posts from each new recipe site with the real crawler code and the
// catalog, offline (no database): how many are recipes, duplicates, hidden, and which
// ingredient names the catalog doesn't know yet.
import { writeFileSync } from "node:fs";
import { RECIPE_SOURCES } from "../scraper-backend/src/lib/scrapers/recipe-sources.ts";
import { postSitemapsFromIndex, urlsFromSitemap } from "../scraper-backend/src/lib/scrapers/sitemaps.ts";
import { parseRecipePage } from "../scraper-backend/src/lib/scrapers/recipe-page.ts";
import { dishKey, splitIngredientLine } from "../scraper-backend/src/lib/scrapers/ingredient-line.ts";
import { compileRecipe, nameKey } from "../scraper-backend/src/lib/recipe-compile/compile.ts";
import { ALIASES, CANONICALS, DERIVED_PRICES, EXTRA_NUTRIENTS, MANUAL_PRICES } from "../scraper-backend/src/lib/recipe-compile/catalog.generated.ts";

const UA = "Mozilla/5.0 (compatible; SarapSulitBot/1.0; +https://john3162000.github.io/website_business/)";
const PER_SITE = Number(process.env.PER_SITE ?? 40);
const get = async (u: string) => {
  const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ctx: any = { aliases: ALIASES, canonicals: CANONICALS, manualPrices: MANUAL_PRICES, extraNutrients: EXTRA_NUTRIENTS, derivedPrices: DERIVED_PRICES, fnri: new Map(), da: new Map(), psa: new Map() };

// Existing dish keys come from the live API's titles.
const keys = new Set<string>();
for (const path of ["/api/recipes", "/api/recipes/compiled"]) {
  const j: any = await (await fetch(`https://website-business-beta.vercel.app${path}`)).json().catch(() => null);
  const list = Array.isArray(j) ? j : j?.recipes ?? j?.data ?? [];
  for (const r of list) if (r?.title) keys.add(dishKey(r.title));
}
console.log(`live titles: ${keys.size}`);

const unmatched = new Map<string, { n: number; ex: string }>();
const summary: any[] = [];
for (const src of RECIPE_SOURCES.slice(1)) {
  const row: any = { site: src.name, pages: 0, sampled: 0, recipes: 0, otherCuisine: 0, duplicate: 0, hidden: 0, shown: 0, failed: 0, totalLines: 0, unmatchedLines: 0, examples: [] };
  try {
    let maps: string[] = [];
    for (const n of ["sitemap_index.xml", "wp-sitemap.xml", "sitemap.xml"]) {
      try { const x = await get(`${src.base}/${n}`); maps = postSitemapsFromIndex(x); if (!maps.length && /<urlset/i.test(x)) maps = [`${src.base}/${n}`]; if (maps.length) break; } catch {}
    }
    const urls: string[] = [];
    for (const m of maps) { try { urls.push(...urlsFromSitemap(await get(m), src.base + (src.pathPrefix ?? ""))); } catch {} }
    row.pages = urls.length; row.sitemaps = maps.length;
    const step = Math.max(1, Math.floor(urls.length / PER_SITE));
    for (let i = 0; i < urls.length && row.sampled < PER_SITE; i += step) {
      row.sampled++;
      await sleep(1200);
      let r;
      try { r = parseRecipePage(await get(urls[i]), urls[i], true); } catch { row.failed++; continue; }
      if (!r) continue;
      if (src.cuisine && !src.cuisine.test(`${r.cuisine ?? ""} ${r.title}`)) { row.otherCuisine++; continue; }
      row.recipes++;
      if (keys.has(dishKey(r.title))) { row.duplicate++; continue; }
      const c = compileRecipe({ id: 0, title: r.title, servings: r.servings ?? null, ingredients: r.ingredients.map((x) => ({ name: x.name, amount: x.amount ?? null, unit: x.unit ?? null, rawText: x.rawText, group: x.groupName ?? null })), instructions: r.instructions }, ctx);
      const um = c.lines.filter((l: any) => l.status === "unmatched");
      row.totalLines += c.lines.length; row.unmatchedLines += um.length;
      if (um.length) row.hidden++; else row.shown++;
      if (row.examples.length < 4) row.examples.push(`${r.title} | ${r.ingredients.length} lines | ${um.length} unknown | ${r.ingredients.slice(0, 3).map((x) => `[${x.amount ?? ""}|${x.unit ?? ""}|${x.name}]`).join(" ")}`);
      for (const l of um as any[]) {
        const k = nameKey(splitIngredientLine(l.text).name);
        const e = unmatched.get(k) ?? { n: 0, ex: `${l.text} (${src.name})` };
        e.n++; unmatched.set(k, e);
      }
    }
  } catch (e: any) { row.error = e.message; }
  summary.push(row);
  console.log(JSON.stringify(row));
}
const top = [...unmatched.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`\nUNMATCHED NAMES (${top.length}):`);
for (const [k, v] of top) console.log(`${v.n}\t${k}\t${v.ex}`);
writeFileSync("demo/dryrun-out/summary.json", JSON.stringify({ summary, unmatched: top }, null, 1));
