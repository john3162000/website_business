#!/usr/bin/env node
// Adds new Panlasang Pinoy recipes to the live database, from your own computer.
//
//   cd scraper-backend
//   node scripts/add-recipes.mjs              # keep going until every post sitemap is done
//   node scripts/add-recipes.mjs --max 50     # stop after 50 calls (about 200 new recipes)
//
// It calls POST /api/scrape/recipes again and again; each call saves up to 4 new recipes
// and remembers where it stopped, so you can stop (Ctrl+C) and run it again any time.
// The admin token is read from ADMIN_TOKEN in your environment, or from
// scraper-backend/.env.local (a line `ADMIN_TOKEN=...`; that file is git-ignored).
// The token is only sent to the API and is never printed.
//
// New recipes go through the pricing engine on the next /api/recipes/compiled request.
// One with an ingredient the catalog doesn't know is hidden on the site, never deleted.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = (arg("base", process.env.API_BASE) || "https://website-business-beta.vercel.app").replace(/\/$/, "");
const MAX_CALLS = Number(arg("max", "1000"));
const PAUSE_MS = 1000;

/** ADMIN_TOKEN from the environment, else from .env.local / .env next to package.json. */
function adminToken() {
  if (process.env.ADMIN_TOKEN?.trim()) return process.env.ADMIN_TOKEN.trim();
  for (const f of [".env.local", ".env"]) {
    try {
      const line = readFileSync(join(here, "..", f), "utf8").split(/\r?\n/).find((l) => /^\s*ADMIN_TOKEN\s*=/.test(l));
      if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    } catch { /* no such file */ }
  }
  return "";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/scrape/recipes`, { method: "POST", headers: { "x-admin-token": token } });
      const body = await res.json().catch(() => ({}));
      if (res.ok) return body;
      // 401/503: wrong or missing token in Vercel. Not worth retrying.
      if (res.status === 401 || res.status === 503 || attempt >= 4) throw new Error(`HTTP ${res.status}: ${body.error ?? "no details"}`);
    } catch (err) {
      if (attempt >= 4 || /HTTP (401|503)/.test(String(err))) throw err;
    }
    const wait = 2000 * 2 ** (attempt - 1);
    console.log(`  retrying in ${wait / 1000}s…`);
    await sleep(wait);
  }
}

async function summary() {
  try {
    const j = await (await fetch(`${BASE}/api/recipes/compiled`, { cache: "no-store" })).json();
    const hidden = j.recipes.filter((r) => r.hidden).length;
    console.log(`On the site now: ${j.count.toLocaleString()} recipes (${hidden} hidden for an unknown ingredient). The API caches for up to 15 minutes.`);
  } catch (err) {
    console.log(`Couldn't read the recipe count: ${err.message}`);
  }
}

const token = adminToken();
if (!token) {
  console.error("No ADMIN_TOKEN found. Set it in your environment, or add a line ADMIN_TOKEN=... to scraper-backend/.env.local (the same value as in Vercel).");
  process.exit(1);
}
console.log(`Adding recipes through ${BASE} (at most ${MAX_CALLS} calls; Ctrl+C to stop, run again to resume).`);
for (let i = 1; i <= MAX_CALLS; i++) {
  let r;
  try {
    r = await call(token);
  } catch (err) {
    console.error(`Stopped: ${err.message}`);
    process.exit(1);
  }
  const where = r.cursor ? `sitemap ${r.cursor.sitemapIndex + 1}, post ${r.cursor.urlIndex}` : "";
  console.log(`#${i}: ${r.itemsScraped ?? 0} saved in this run${where ? ` · ${where}` : ""}`);
  if (r.done) { console.log("Done: every post sitemap has been read."); break; }
  await sleep(PAUSE_MS);
}
await summary();
