import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, geoFrom, isBot, lastDays, manilaDay, visitorCode } from "./visits.ts";

test("the visitor code is stable per IP, differs between IPs and salts, and isn't the IP", () => {
  const a = visitorCode("203.177.1.2", "s1");
  assert.equal(a, visitorCode("203.177.1.2", "s1"));
  assert.notEqual(a, visitorCode("203.177.1.3", "s1"));
  assert.notEqual(a, visitorCode("203.177.1.2", "s2"));
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.ok(!a.includes("203"));
});

test("IP and location come from the request headers", () => {
  const h = new Headers({
    "x-forwarded-for": "112.198.5.9, 10.0.0.1",
    "x-vercel-ip-country": "PH",
    "x-vercel-ip-country-region": "00",
    "x-vercel-ip-city": "Quezon%20City",
  });
  assert.equal(clientIp(h), "112.198.5.9");
  assert.deepEqual({ ...geoFrom(h) }, { country: "PH", region: "00", city: "Quezon City" });
  assert.equal(clientIp(new Headers({ "x-real-ip": "1.2.3.4" })), "1.2.3.4");
  assert.equal(clientIp(new Headers()), null);
  assert.deepEqual({ ...geoFrom(new Headers()) }, { country: null, region: null, city: null });
});

test("bots and empty user agents aren't counted", () => {
  assert.equal(isBot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36"), false);
  assert.equal(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)"), true);
  assert.equal(isBot("facebookexternalhit/1.1"), true);
  assert.equal(isBot("Mozilla/5.0 HeadlessChrome/130"), true);
  assert.equal(isBot(null), true);
});

test("days are Manila days", () => {
  assert.equal(manilaDay(new Date("2026-11-02T17:00:00Z")), "2026-11-03"); // 1am Manila
  assert.equal(manilaDay(new Date("2026-11-03T15:59:00Z")), "2026-11-03"); // 11:59pm Manila
  assert.deepEqual(lastDays("2026-11-03", 3), ["2026-11-01", "2026-11-02", "2026-11-03"]);
});
