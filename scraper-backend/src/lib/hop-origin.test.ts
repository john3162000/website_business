import { test } from "node:test";
import assert from "node:assert/strict";
import { hopOrigin } from "./hop-origin.ts";

const req = (headers: Record<string, string> = {}) => new Request("https://website-business-abc123-team.vercel.app/api/cron/recipes", { headers });
const url = new URL("https://website-business-abc123-team.vercel.app/api/cron/recipes");

test("the next crawl hop goes to the production domain, not the guarded deployment URL", () => {
  assert.equal(hopOrigin(req(), url, "website-business-beta.vercel.app"), "https://website-business-beta.vercel.app");
  assert.equal(hopOrigin(req({ "x-forwarded-host": "website-business-beta.vercel.app" }), url, ""), "https://website-business-beta.vercel.app");
  assert.equal(hopOrigin(req(), url, undefined), "https://website-business-abc123-team.vercel.app");
});

test("in production with no production URL the hop is refused, not sent to a request-supplied host", () => {
  assert.equal(hopOrigin(req({ "x-forwarded-host": "evil.example" }), url, undefined, "production"), null);
  assert.equal(hopOrigin(req(), url, "website-business-beta.vercel.app", "production"), "https://website-business-beta.vercel.app");
});
