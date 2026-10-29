import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileRecipe, type CompileContext } from "./compile.ts";
import { COOKED_KEYS, dishMethod, lineMethod, retained } from "./cooking.ts";
import { CANONICALS, COOK_GROUPS, RETENTION } from "./catalog.generated.ts";
import { testContext } from "./test-context.ts";

// The committed FNRI snapshot has no vitamins or minerals, so give the foods used here round values.
const base = testContext();
const ctx: CompileContext = { ...base, fnri: new Map(base.fnri) };
for (const slug of ["kangkong", "pork_belly", "rice_white_cooked", "tomato", "tilapia", "onion_red"]) {
  const code = CANONICALS[slug].fnriCode!;
  ctx.fnri.set(code, { ...ctx.fnri.get(code)!, vitaminC: 40, vitaminA: 300, iron: 2, calcium: 80 });
}
const ing = (amount: string, unit: string | null, name: string) => ({ amount, unit, name });
const dish = (title: string, ingredients: ReturnType<typeof ing>[], instructions: string[] = []) =>
  compileRecipe({ id: 1, title, servings: 4, ingredients, instructions }, ctx);
const line = (r: ReturnType<typeof dish>, slug: string) => r.lines.find((l) => l.slug === slug)!;

test("retention table: every factor sits in its range, inside 0–1, with a source", () => {
  for (const [key, r] of Object.entries(RETENTION)) {
    assert.ok(r.factor != null && r.low != null && r.high != null, key);
    assert.ok(0 <= r.low! && r.low! <= r.factor! && r.factor! <= r.high! && r.high! <= 1, `${key}: ${r.low} ≤ ${r.factor} ≤ ${r.high}`);
    assert.ok(r.source, `${key} has a source`);
  }
  for (const g of new Set(Object.values(COOK_GROUPS))) {
    for (const k of COOKED_KEYS) assert.ok(RETENTION[`${g}|cooked|${k}`], `${g} has a fallback row for ${k}`);
  }
});

test("cook groups: only catalog slugs, and never an FNRI row that is already cooked or canned", () => {
  for (const slug of Object.keys(COOK_GROUPS)) {
    const c = CANONICALS[slug];
    assert.ok(c, `${slug} is in the catalog`);
    const name = readFileSync(join(import.meta.dirname, "../../../data/catalog/canonicals.tsv"), "utf8")
      .split(/\r?\n/).find((l) => l.startsWith(`${slug}\t`))!.split("\t")[3] ?? "";
    assert.doesNotMatch(name, /boiled|fried|roasted|cooked|cnd/i, `${slug} (${name}) would be counted twice`);
  }
  assert.equal(COOK_GROUPS.rice_white_cooked, undefined);
  assert.equal(COOK_GROUPS.lechon_kawali, undefined);
});

test("dish methods from Filipino titles", () => {
  const m = (t: string, steps = "") => dishMethod(t, steps, null, []).method;
  assert.equal(m("Sinigang na Baboy"), "boil_broth");
  assert.equal(m("Tinolang Manok"), "boil_broth");
  assert.equal(m("Chicken Adobo"), "stew");
  assert.equal(m("Ginataang Kalabasa at Sitaw"), "stew");
  assert.equal(m("Ginisang Monggo"), "saute");
  assert.equal(m("Inihaw na Liempo"), "grill");
  assert.equal(m("Kinilaw na Tanigue"), "acid");
  assert.equal(m("Ensaladang Talong"), "raw");
  assert.equal(m("Something Special"), "cooked");
  assert.equal(dishMethod("Pritong Tilapia", "", "deep", []).method, "deep_fry");
  assert.equal(m("Kangkong with Bagoong", "Blanch the kangkong. Drain."), "boil_drained");
});

test("leafy greens in soups and stews count as added at the end; meat in a salad is cooked", () => {
  assert.equal(lineMethod("boil_broth", "leafy_veg"), "blanch");
  assert.equal(lineMethod("stew", "leafy_veg"), "blanch");
  assert.equal(lineMethod("boil_broth", "veg"), "boil_broth");
  assert.equal(lineMethod("raw", "animal"), "cooked");
  assert.equal(lineMethod("raw", "veg"), "raw");
  assert.deepEqual(retained(RETENTION, undefined, "stew", "vitaminC"), [1, 1, 1]);
});

test("sinigang: broth eaten, so iron and calcium stay; vitamin C drops", () => {
  const r = dish("Sinigang na Baboy", [ing("1", "lb", "pork belly"), ing("1", "bunch", "kangkong"), ing("2", null, "tomatoes")]);
  assert.equal(r.afterCooking.method, "boil_broth");
  assert.equal(line(r, "kangkong").cooked!.method, "blanch");
  const a = r.afterCooking.perServing;
  assert.ok(Math.abs(a.iron.value - r.perServing.iron) < 1e-9, "iron kept");
  assert.ok(Math.abs(a.calcium.value - r.perServing.calcium) < 1e-9, "calcium kept");
  assert.ok(a.vitaminC.value < r.perServing.vitaminC, "vitamin C lost");
  assert.ok(a.vitaminC.low <= a.vitaminC.value && a.vitaminC.value <= a.vitaminC.high);
});

test("blanched and drained greens lose iron and calcium too", () => {
  const r = dish("Kangkong Salad", [ing("1", "bunch", "kangkong")], ["Blanch the kangkong for 1 minute, then drain."]);
  // The title says salad, but the steps say the leaves were blanched and drained first.
  assert.equal(r.afterCooking.method, "boil_drained");
  assert.equal(dish("Kangkong Salad", [ing("1", "bunch", "kangkong")]).afterCooking.method, "raw");
  const s = dish("Kangkong with Bagoong", [ing("1", "bunch", "kangkong")], ["Boil the kangkong for 5 minutes and drain the water."]);
  assert.equal(s.afterCooking.method, "boil_drained");
  assert.ok(s.afterCooking.perServing.iron.value < s.perServing.iron);
  assert.ok(s.afterCooking.perServing.vitaminC.value <= 0.6 * s.perServing.vitaminC + 1e-9);
});

test("kinilaw keeps its vitamin C; cooked rice (an FNRI cooked row) is never reduced", () => {
  const k = dish("Kinilaw na Tilapia", [ing("1", "lb", "tilapia"), ing("1", null, "red onion")]);
  assert.ok(k.afterCooking.perServing.vitaminC.value >= 0.94 * k.perServing.vitaminC);
  const rice = dish("Pork Adobo", [ing("2", "cups", "cooked rice"), ing("1", "lb", "pork belly")]);
  assert.equal(line(rice, "rice_white_cooked").cooked, null);
  assert.ok(line(rice, "pork_belly").cooked!.vitaminA < line(rice, "pork_belly").nutrients!.vitaminA);
});

test("energy nutrients and ranking inputs are unchanged", () => {
  const r = dish("Sinigang na Baboy", [ing("1", "lb", "pork belly"), ing("1", "bunch", "kangkong")]);
  const noCook = compileRecipe({ id: 1, title: "Sinigang na Baboy", servings: 4, ingredients: [ing("1", "lb", "pork belly"), ing("1", "bunch", "kangkong")] }, { ...ctx, retention: undefined });
  assert.deepEqual(r.perServing, noCook.perServing);
  for (const k of COOKED_KEYS) assert.equal(noCook.afterCooking.perServing[k].value, noCook.perServing[k]);
});
