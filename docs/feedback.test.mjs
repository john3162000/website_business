// Runs docs/feedback.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./feedback.js", import.meta.url), "utf8")}
;globalThis.api = { feedbackPayload, feedbackReady, feedbackMailto, FEEDBACK_EMAIL };`, ctx);
const { feedbackPayload, feedbackReady, feedbackMailto, FEEDBACK_EMAIL } = ctx.api;
const plain = (o) => JSON.parse(JSON.stringify(o));

test("the payload is trimmed and only reviews carry stars", () => {
  assert.deepEqual(plain(feedbackPayload({ kind: "review", rating: 4, message: "  Sulit!  ", name: " ", contact: "a@b.ph", page: "browse", lang: "en", website: "" })),
    { kind: "review", rating: 4, message: "Sulit!", name: null, contact: "a@b.ph", page: "browse", lang: "en", website: "" });
  assert.equal(feedbackPayload({ kind: "suggestion", rating: 5, message: "More fish" }).rating, null);
  assert.equal(feedbackPayload({ kind: "nope", message: "hi there" }).kind, "suggestion");
});

test("ready when there's a message, or stars on a review", () => {
  assert.equal(feedbackReady(feedbackPayload({ kind: "review", rating: 5, message: "" })), true);
  assert.equal(feedbackReady(feedbackPayload({ kind: "review", rating: 0, message: "" })), false);
  assert.equal(feedbackReady(feedbackPayload({ kind: "problem", message: "ok" })), false);
  assert.equal(feedbackReady(feedbackPayload({ kind: "problem", message: "Planner won't open" })), true);
});

test("the email fallback carries the whole message", () => {
  const url = feedbackMailto(feedbackPayload({ kind: "review", rating: 3, message: "Good, but add more fish", name: "Ana", contact: "ana@x.ph", page: "planner" }));
  assert.ok(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=SarapSulit%20Review&body=`));
  const body = decodeURIComponent(url.split("body=")[1]);
  assert.match(body, /★★★☆☆ \(3\/5\)/);
  assert.match(body, /Good, but add more fish/);
  assert.match(body, /Name: Ana/);
  assert.match(body, /Reply to: ana@x\.ph/);
  assert.match(body, /Sent from: planner/);
});
