// Second pass: sites the first survey couldn't sample (flat sitemaps, no index), plus the terms
// pages again with <script> blocks removed (the first pass matched a bot list inside a script).
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (compatible; SarapSulitBot/1.0; +https://john3162000.github.io/website_business/)";
const SITES = [
  "https://www.manilaspoon.com", "https://pinoyrecipe.net", "https://www.pinoycookingrecipes.com",
  "https://www.overseaspinoycooking.net", "https://www.pepper.ph", "https://www.angsarap.net",
  "https://salusalorecipes.com", "https://www.casabaluartefilipinorecipes.com", "https://www.filipino-recipes-lutong-pinoy.com",
  "https://www.foxyfolksy.com", "https://www.yummykitchentv.com", "https://www.foodandjourneys.net", "https://www.wokandkin.com",
  "https://www.kawalingpinoy.com", "https://www.savorythoughts.com", "https://www.recipesbynora.com",
  "https://www.jeanelleats.com", "https://www.kitchenconfidante.com",
];
const get = async (url, ms = 20000) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml,*/*" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
  return { ok: r.ok, status: r.status, url: r.url, text: r.ok ? await r.text() : "" };
};
const locs = (xml) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\s\]]+)(?:\]\]>)?\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();

for (const base of SITES) {
  const out = { site: base.replace(/^https?:\/\/(www\.)?/, "") };
  try {
    const rb = await get(`${base}/robots.txt`).catch((e) => ({ ok: false, status: e.message }));
    out.robots = rb.ok ? rb.text.split(/\r?\n/).filter((l) => /^(user-agent|disallow|crawl-delay|sitemap)/i.test(l.trim())).slice(0, 40).join(" | ").slice(0, 900) : `robots ${rb.status}`;
    let index = null, maps = [], pages = [];
    for (const idx of ["sitemap_index.xml", "wp-sitemap.xml", "sitemap.xml", "post-sitemap.xml"]) {
      const s = await get(`${base}/${idx}`).catch(() => null);
      if (!s || !s.ok) continue;
      const all = locs(s.text);
      if (/<sitemapindex/i.test(s.text)) { index = idx; maps = all; } else { index = `${idx} (urlset)`; pages = all; }
      break;
    }
    out.index = index; out.maps = maps.slice(0, 12);
    const postMaps = maps.filter((u) => /post|recipe|page=|sitemap\.xml\?/i.test(u) && !/page-sitemap|wp-sitemap-posts-page|category|tag|author/i.test(u));
    for (const m of postMaps.slice(0, 30)) { const s = await get(m).catch(() => null); if (s && s.ok) pages.push(...locs(s.text)); }
    pages = [...new Set(pages.filter((u) => !/\.(jpe?g|png|webp|gif|xml)$/i.test(u) && !/\/(category|tag|page|author)\//.test(u)))];
    out.pages = pages.length;
    const step = Math.max(1, Math.floor(pages.length / 7));
    const sample = [1, 2, 3, 4, 5, 6].map((i) => pages[i * step]).filter(Boolean);
    out.samples = [];
    for (const u of sample) {
      const p = await get(u).catch((e) => ({ ok: false, status: e.message }));
      if (!p.ok) { out.samples.push(`${u} → ${p.status}`); continue; }
      const t = p.text;
      const ld = /"@type"\s*:\s*(\[[^\]]*)?"Recipe"/.test(t) && /recipeIngredient/.test(t);
      const cuisine = (t.match(/"recipeCuisine"\s*:\s*(\[[^\]]*\]|"[^"]*")/) || [])[1] || "";
      const plugin = /wprm-recipe/.test(t) ? "wprm" : /tasty-recipes/.test(t) ? "tasty" : /mv-create/.test(t) ? "mediavine" : /easyrecipe/.test(t) ? "easyrecipe" : /zrdn|zip-recipes/.test(t) ? "zip" : "-";
      const ingLis = (t.match(/class="[^"]*ingredient[^"]*"/gi) || []).length;
      out.samples.push(`${u.replace(base, "")} ld=${ld ? "Y" : "n"} plugin=${plugin} ingClasses=${ingLis} cuisine=${cuisine.slice(0, 40)}`);
    }
    for (const path of ["terms", "terms-of-use", "terms-and-conditions", "terms-of-service", "disclaimer", "legal", "privacy-policy"]) {
      const t = await get(`${base}/${path}/`, 12000).catch(() => null);
      if (!t || !t.ok) continue;
      const txt = visible(t.text);
      const hit = txt.match(/[^.]{0,120}(scrap(e|ing)|crawl(er|ing)?|spider|data mining|automated (means|tools|access|systems)|artificial intelligence|machine learning)[^.]{0,120}/);
      out.terms = `/${path}: ${hit ? `"${hit[0].trim().slice(0, 260)}"` : "no clause"}`;
      if (hit) break;
    }
  } catch (e) { out.error = e.message.slice(0, 80); }
  console.log(JSON.stringify(out, null, 1));
}
