// Temporary: counts recipes per source site from the live API and runs the engine offline with
// this branch's catalog: hidden recipes and the ingredient names the catalog doesn't know.
import { writeFileSync, mkdirSync } from "node:fs";
import { compileRecipe, nameKey } from "../scraper-backend/src/lib/recipe-compile/compile.ts";
import { splitIngredientLine } from "../scraper-backend/src/lib/scrapers/ingredient-line.ts";
import { ALIASES, CANONICALS, DERIVED_PRICES, EXTRA_NUTRIENTS, MANUAL_PRICES } from "../scraper-backend/src/lib/recipe-compile/catalog.generated.ts";

const API = "https://website-business-beta.vercel.app";
const ctx: any = { aliases: ALIASES, canonicals: CANONICALS, manualPrices: MANUAL_PRICES, extraNutrients: EXTRA_NUTRIENTS, derivedPrices: DERIVED_PRICES, fnri: new Map(), da: new Map(), psa: new Map() };
const raw: any[] = await (await fetch(`${API}/api/recipes?fresh=${Date.now()}`)).json();
const list = Array.isArray(raw) ? raw : (raw as any).recipes;
const live: any = await (await fetch(`${API}/api/recipes/compiled?fresh=${Date.now()}`)).json();
const liveById = new Map((live.recipes ?? live).map((r: any) => [r.id, r]));

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "?"; } };
const bySite = new Map<string, any>();
const unmatched = new Map<string, { n: number; recipes: number; ex: string; sites: Set<string> }>();
for (const r of list) {
  const h = host(r.url);
  const s = bySite.get(h) ?? { site: h, recipes: 0, articles: 0, liveHidden: 0, offlineHidden: 0, shown: 0 };
  s.recipes++;
  const lv: any = liveById.get(r.id);
  if (lv?.isArticle || lv?.isCollection) { s.articles++; bySite.set(h, s); continue; }
  if (lv?.hidden) s.liveHidden++;
  const c = compileRecipe({ id: r.id, title: r.title, servings: r.servings ?? null, ingredients: r.ingredients.map((x: any) => ({ id: x.id, name: x.name, amount: x.amount ?? null, unit: x.unit ?? null, rawText: x.rawText })) }, ctx);
  const um = c.lines.filter((l: any) => l.status === "unmatched");
  if (um.length) s.offlineHidden++; else s.shown++;
  const seen = new Set<string>();
  for (const l of um as any[]) {
    const k = nameKey(splitIngredientLine(l.text).name).replace(/^[^a-z0-9]+/, "");
    const e = unmatched.get(k) ?? { n: 0, recipes: 0, ex: l.text, sites: new Set() };
    e.n++; if (!seen.has(k)) { e.recipes++; seen.add(k); } e.sites.add(h);
    unmatched.set(k, e);
  }
  bySite.set(h, s);
}
const sites = [...bySite.values()].sort((a, b) => b.recipes - a.recipes);
const tot = sites.reduce((a, s) => ({ recipes: a.recipes + s.recipes, articles: a.articles + s.articles, offlineHidden: a.offlineHidden + s.offlineHidden, shown: a.shown + s.shown, liveHidden: a.liveHidden + s.liveHidden }), { recipes: 0, articles: 0, offlineHidden: 0, shown: 0, liveHidden: 0 });
console.log(JSON.stringify({ total: tot }));
for (const s of sites) console.log(JSON.stringify(s));
const top = [...unmatched.entries()].sort((a, b) => b[1].recipes - a[1].recipes);
console.log(`\nUNMATCHED (${top.length} names; recipes, lines, example, sites):`);
for (const [k, v] of top.slice(0, 600)) console.log(`${v.recipes}\t${v.n}\t${k}\t${v.ex}\t${[...v.sites].join(",")}`);
mkdirSync("../demo/count-out", { recursive: true });
writeFileSync("../demo/count-out/unmatched.tsv", top.map(([k, v]) => `${v.recipes}\t${v.n}\t${k}\t${v.ex}\t${[...v.sites].join(",")}`).join("\n"));
// run 2
// run 3
// run 4
// run 6
// run 7
// run 8
// run 9
// run 10
// run 11
// run 12
// run 13
// run 14
