// Runs docs/settings.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./settings.js", import.meta.url), "utf8")}
;globalThis.api = { readSettings, writeSettings, defaultSettings, toggleIn, t, I18N, SETTINGS_KEY };`, ctx);
const { readSettings, writeSettings, defaultSettings, toggleIn, t, I18N, SETTINGS_KEY } = ctx.api;
const plain = (v) => JSON.parse(JSON.stringify(v));
const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test("settings round-trip on the device", () => {
  const s = store();
  const want = { lang: "tl", diets: ["lowcal", "gout"], meats: ["pork"], suggest: false };
  assert.equal(writeSettings(s, want), true);
  assert.deepEqual(plain(readSettings(s)), want);
});

test("broken or unknown settings fall back to the defaults", () => {
  assert.deepEqual(plain(readSettings(store())), plain(defaultSettings()));
  assert.deepEqual(plain(readSettings(store({ [SETTINGS_KEY]: "{not json" }))), plain(defaultSettings()));
  const odd = readSettings(store({ [SETTINGS_KEY]: JSON.stringify({ lang: "fr", diets: ["gout", "keto", "gout"], meats: "pork", suggest: "yes" }) }));
  assert.deepEqual(plain(odd), { lang: "en", diets: ["gout"], meats: [], suggest: true });
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(plain(readSettings(blocked)), plain(defaultSettings()));
  assert.equal(writeSettings(blocked, defaultSettings()), false);
});

test("toggleIn adds a choice, or removes it when it was there", () => {
  assert.deepEqual(plain(toggleIn(["gout"], "lowcal")), ["gout", "lowcal"]);
  assert.deepEqual(plain(toggleIn(["gout", "lowcal"], "gout")), ["lowcal"]);
});

test("every button word has Tagalog and English", () => {
  for (const [key, row] of Object.entries(I18N)) {
    assert.equal(row.length, 2, key);
    assert.ok(row[0] && row[1], key);
  }
  assert.equal(t("plan.clear", "tl"), "Burahin ang linggo");
  assert.equal(t("plan.clear", "en"), "Clear week");
  assert.equal(t("no.such.key", "tl"), "no.such.key");
});

test("every data-i18n key used in index.html is translated", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const keys = [...html.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 40, `only ${keys.length} keys`);
  for (const k of keys) assert.ok(k in I18N, `${k} missing from I18N`);
});
