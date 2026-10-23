import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin, requireCron, safeEqual } from "./admin-auth.ts";

const env = process.env as Record<string, string | undefined>;
const saved = { ADMIN_TOKEN: env.ADMIN_TOKEN, CRON_SECRET: env.CRON_SECRET, NODE_ENV: env.NODE_ENV };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

const req = (headers: Record<string, string> = {}) => new Request("https://x.test/api/scrape/da", { method: "POST", headers });

test("safeEqual: equal and different strings, including different lengths", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});

test("requireAdmin: no ADMIN_TOKEN is open in dev and closed in production", () => {
  delete env.ADMIN_TOKEN;
  env.NODE_ENV = "development";
  assert.equal(requireAdmin(req()), null);
  env.NODE_ENV = "production";
  assert.equal(requireAdmin(req())?.status, 503);
});

test("requireAdmin: right token passes (trimmed), wrong or missing token is 401", async () => {
  env.ADMIN_TOKEN = " secret-token\n";
  env.NODE_ENV = "production";
  assert.equal(requireAdmin(req({ "x-admin-token": "secret-token " })), null);
  const wrong = requireAdmin(req({ "x-admin-token": "nope" }));
  assert.equal(wrong?.status, 401);
  assert.equal(requireAdmin(req())?.status, 401);
  // The 401 must not reveal anything about the token, such as its length.
  assert.doesNotMatch(JSON.stringify(await wrong!.json()), /characters/);
});

test("requireCron: no CRON_SECRET is open in dev and closed in production; bearer must match", () => {
  delete env.CRON_SECRET;
  env.NODE_ENV = "development";
  assert.equal(requireCron(req()), null);
  env.NODE_ENV = "production";
  assert.equal(requireCron(req())?.status, 503);
  env.CRON_SECRET = "cron-secret";
  assert.equal(requireCron(req({ authorization: "Bearer cron-secret" })), null);
  assert.equal(requireCron(req({ authorization: "Bearer wrong" }))?.status, 401);
  assert.equal(requireCron(req())?.status, 401);
});
