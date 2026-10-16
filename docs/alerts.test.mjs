// Runs docs/alerts.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./alerts.js", import.meta.url), "utf8")}
;globalThis.api = { loadAlerts, saveAlerts, upsertAlert, dueAlerts };`, ctx);
const { loadAlerts, saveAlerts, upsertAlert, dueAlerts } = ctx.api;
const plain = (v) => JSON.parse(JSON.stringify(v));

test("alerts: one per item; saved and loaded; junk ignored", () => {
  let list = upsertAlert([], { kind: "commodity", ref: "Pork Belly (Liempo), Local", label: "Pork belly", below: 340 });
  list = upsertAlert(list, { kind: "commodity", ref: "Pork Belly (Liempo), Local", label: "Pork belly", below: 330 });
  list = upsertAlert(list, { kind: "dish", ref: "315", label: "Arroz Caldo", below: 30 });
  assert.equal(list.length, 2);
  assert.equal(list.find((a) => a.kind === "commodity").below, 330);
  const m = new Map();
  const s = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(saveAlerts(s, list), true);
  assert.equal(loadAlerts(s).length, 2);
  m.set("sarapsulit.alerts.v1", "not json");
  assert.deepEqual(plain(loadAlerts(s)), []);
});

test("alerts: fire when below target, once per price day", () => {
  const list = [
    { kind: "commodity", ref: "Pork Belly", below: 340, lastHit: null },
    { kind: "commodity", ref: "Galunggong", below: 200, lastHit: null },
    { kind: "dish", ref: "315", below: 30, lastHit: "2026-10-15" },
    { kind: "dish", ref: "7", below: 50, lastHit: null },
  ];
  const prices = new Map([["Pork Belly", 335], ["Galunggong", 240]]);
  const dishes = new Map([[315, 25], [7, 49.5]]);
  const due = plain(dueAlerts(list, prices, dishes, "2026-10-15")).map((d) => `${d.alert.ref}@${d.now}`);
  assert.deepEqual(due, ["Pork Belly@335", "7@49.5"]); // 315 already fired today
  assert.equal(dueAlerts(list, prices, dishes, "2026-10-16").length, 3);
  assert.equal(dueAlerts([{ kind: "commodity", ref: "X", below: 10 }], new Map(), dishes, "d").length, 0);
});
