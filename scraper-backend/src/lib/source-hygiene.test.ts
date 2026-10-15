import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Regexes written through unescaped strings have twice turned \b into a
// backspace byte (0x08), silently breaking word-boundary matches.
test("backend sources have no stray control characters", () => {
  const root = join(import.meta.dirname, "..");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== "generated") walk(p); }
      else if (/\.(ts|tsx|mjs)$/.test(f)) files.push(p);
    }
  };
  walk(root);
  for (const f of files) {
    const m = readFileSync(f, "utf8").match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
    assert.equal(m, null, `${f}: control character ${m ? JSON.stringify(m[0]) : ""}`);
  }
});
