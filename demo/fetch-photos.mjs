// Finds openly licensed photos of kitchen appliances on Openverse and saves a
// few candidates per appliance with their licence details, for review.
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2] || "photos";
const QUERIES = {
  stove: "gas stove burner kitchen", oven: "kitchen oven", air_fryer: "air fryer", microwave: "microwave oven kitchen",
  grill: "charcoal grill barbecue", steamer: "bamboo steamer", rice_cooker: "rice cooker", pressure_cooker: "pressure cooker",
  slow_cooker: "slow cooker crock pot", blender: "kitchen blender", mixer: "stand mixer kitchen",
};
mkdirSync(OUT, { recursive: true });
const meta = {};
for (const [key, q] of Object.entries(QUERIES)) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial,modification&page_size=10&mature=false`;
  let res;
  try { res = await fetch(url, { headers: { "User-Agent": "FARM2FIGURE-photo-finder/1.0" }, signal: AbortSignal.timeout(20000) }); } catch (e) { console.log(key, "search failed", e.message); continue; }
  if (!res.ok) { console.log(key, "HTTP", res.status); continue; }
  const j = await res.json();
  meta[key] = [];
  let n = 0;
  for (const r of j.results || []) {
    if (n >= 6) break;
    try {
      const img = await fetch(r.thumbnail || r.url, { signal: AbortSignal.timeout(15000) });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < 4000) continue;
      const file = `${key}-${n}.jpg`;
      writeFileSync(`${OUT}/${file}`, buf);
      meta[key].push({ file, title: r.title, creator: r.creator, license: `${r.license} ${r.license_version || ""}`.trim(), license_url: r.license_url, source: r.foreign_landing_url, url: r.url, w: r.width, h: r.height });
      n++;
    } catch {}
  }
  console.log(key, n);
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
