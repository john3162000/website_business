// Finds openly licensed photos of kitchen appliances on Wikimedia Commons and
// saves a few candidates per appliance with their licence details, for review.
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2] || "photos";
const UA = { "User-Agent": "FARM2FIGURE-photo-finder/1.0 (https://github.com/john3162000/website_business)" };
const QUERIES = {
  oven: "electric oven baking", oven_b: "toaster oven", oven_c: "kitchen oven door open",
};
const OK = /^(cc0|cc by(-sa)? [0-9.]+|public domain|pd)/i;
mkdirSync(OUT, { recursive: true });
const meta = {};
const strip = (h) => (h || "").replace(/<[^>]+>/g, "").trim();
for (const [key, q] of Object.entries(QUERIES)) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=480`;
  let j;
  try { j = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) })).json(); } catch (e) { console.log(key, "search failed", e.message); continue; }
  const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
  meta[key] = [];
  let n = 0;
  for (const p of pages) {
    if (n >= 6) break;
    const ii = p.imageinfo?.[0];
    if (!ii || !/jpe?g|png/.test(ii.mime)) continue;
    const m = ii.extmetadata || {};
    const lic = strip(m.LicenseShortName?.value);
    if (!OK.test(lic)) continue;
    try {
      const img = await fetch(ii.thumburl, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      const file = `${key}-${n}.jpg`;
      writeFileSync(`${OUT}/${file}`, buf);
      meta[key].push({ file, title: p.title, creator: strip(m.Artist?.value), license: lic, license_url: m.LicenseUrl?.value || null, source: ii.descriptionurl });
      n++;
    } catch {}
  }
  console.log(key, n);
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
