// Runs docs/screen.js (a plain browser script) in a VM and tests the album helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const ctx = vm.createContext({ encodeURIComponent });
vm.runInContext(`${read("screen.js")}
;globalThis.api = { SCREEN_TITLES, screenLines, screenLineText, screenClipUrl, screenClipImg, screenFindUrl, screenPhoto, screenPhotoPage, screenFind };`, ctx);
const { SCREEN_TITLES, screenLines, screenLineText, screenClipUrl, screenClipImg, screenFindUrl, screenPhoto, screenPhotoPage, screenFind } = ctx.api;

test("every title has an official clip, a recipe source, both languages and dishes", () => {
  const keys = new Set();
  for (const t of SCREEN_TITLES) {
    assert.ok(!keys.has(t.key), `duplicate title ${t.key}`);
    keys.add(t.key);
    assert.match(t.key, /^[a-z]+$/);
    assert.ok(t.name && t.kind.tl && t.kind.en);
    // The picture is the still of the studio's own upload: a YouTube id plus the channel that posted it.
    assert.match(t.clip.id, /^[A-Za-z0-9_-]{11}$/, `${t.key}: clip id`);
    assert.ok(t.clip.by && t.clip.name, `${t.key}: clip channel and name`);
    assert.match(t.ref.url, /^https:\/\//);
    assert.ok(t.ref.tl && t.ref.en);
    assert.ok(t.dishes.length >= 1);
  }
});

test("every dish has a scene, a credited Commons photo and lines the engine can read", () => {
  for (const t of SCREEN_TITLES) {
    const keys = new Set();
    for (const d of t.dishes) {
      assert.ok(!keys.has(d.key), `${t.key}: duplicate dish ${d.key}`);
      keys.add(d.key);
      assert.match(d.key, /^[a-z]+$/);
      assert.ok(d.name && d.find && d.scene.tl && d.scene.en, `${t.key}/${d.key}`);
      assert.match(d.img.file, /\.(jpe?g|png)$/i, `${t.key}/${d.key}: photo file`);
      assert.ok(d.img.by, `${t.key}/${d.key}: photo author`);
      assert.match(d.img.license, /^(CC0|Public domain|CC BY(-SA)? \d\.\d)$/, `${t.key}/${d.key}: a free licence`);
      assert.ok(Number.isInteger(d.servings) && d.servings >= 1);
      assert.ok(d.lines.length >= 3);
      for (const [amount, unit, name] of d.lines) {
        assert.ok(amount > 0 && unit && name, `${t.key}/${d.key}: ${name}`);
        assert.equal(name, name.toLowerCase());
      }
    }
  }
});

test("no emoji in the album", () => {
  assert.ok(!/\p{Extended_Pictographic}️?/u.test(read("screen.js").replace(/[▶←]/g, "")), "screen.js has an emoji");
});

test("screenLines: the shape POST /api/dish takes", () => {
  const dish = { lines: [[2, "tbsp", "soy sauce"], [0.5, "cup", "green peas"]] };
  assert.deepEqual(Array.from(screenLines(dish), (l) => ({ ...l })), [
    { amount: "2", unit: "tbsp", name: "soy sauce", slug: null },
    { amount: "0.5", unit: "cup", name: "green peas", slug: null },
  ]);
});

test("screenLineText: fractions read like a recipe", () => {
  assert.equal(screenLineText([2, "tbsp", "soy sauce"]), "2 tbsp soy sauce");
  assert.equal(screenLineText([0.5, "cup", "green peas"]), "½ cup green peas");
  assert.equal(screenLineText([1.5, "cups", "water"]), "1½ cups water");
  assert.equal(screenLineText([0.25, "cup", "sugar"]), "¼ cup sugar");
  assert.equal(screenLineText([400, "g", "egg noodles"]), "400 g egg noodles");
});

test("clip, still, scene search and photo links", () => {
  const t = { name: "One Piece", clip: { id: "dIxPuF1tMxs" } };
  assert.equal(screenClipUrl(t), "https://www.youtube.com/watch?v=dIxPuF1tMxs");
  assert.equal(screenClipImg(t), "https://i.ytimg.com/vi/dIxPuF1tMxs/hqdefault.jpg");
  assert.equal(screenFindUrl(t, { find: "Sanji fried rice & Gin" }), "https://www.youtube.com/results?search_query=One%20Piece%20Sanji%20fried%20rice%20%26%20Gin");
  const img = { file: "Confit byaldi 1.jpg" };
  assert.equal(screenPhoto(img), "https://commons.wikimedia.org/wiki/Special:FilePath/Confit%20byaldi%201.jpg?width=480");
  assert.equal(screenPhotoPage(img), "https://commons.wikimedia.org/wiki/File:Confit_byaldi_1.jpg");
});

test("screenFind: title/dish ids", () => {
  const hit = screenFind("ratatouille/soup");
  assert.equal(hit.title.name, "Ratatouille");
  assert.equal(hit.dish.name, "Remy's potato leek soup");
  assert.equal(screenFind("ratatouille/nope"), null);
  assert.equal(screenFind("nope/soup"), null);
});

test("the album is its own page: one button in Browse leads to it, and it is not a tab", () => {
  const html = read("index.html"), app = read("app.js");
  const browse = html.slice(html.indexOf('id="section-browse"'), html.indexOf('id="section-screen"'));
  assert.match(browse, /class="scr-open" onclick="showSection\('screen'\)" data-i18n="browse\.screen"/);
  assert.ok(!browse.includes('id="screen-picks"'), "the album is not inside Browse");
  assert.match(html, /<section id="section-screen"[^>]*>\s*<div[^>]*id="screen-picks"/);
  assert.ok(!html.includes('id="nav-screen"') && !html.includes('data-nav="screen"'), "no tab for it");
  assert.match(app, /"game", "screen"\]\.forEach/);
  assert.ok(html.indexOf('<script src="screen.js">') < html.indexOf('<script src="app.js">'));
  // Outside links open a new tab without handing over the opener.
  const js = read("screen.js");
  assert.equal((js.match(/target="_blank"/g) || []).length, (js.match(/target="_blank" rel="noopener noreferrer"/g) || []).length);
});
