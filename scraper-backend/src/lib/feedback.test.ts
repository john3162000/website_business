import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeedback } from "./feedback.ts";

test("a review keeps its stars and message; other kinds have no stars", () => {
  assert.deepEqual(parseFeedback({ kind: "review", rating: 5, message: "  Ang galing!\nSalamat ", name: " Ana ", page: "browse", lang: "tl" }),
    { kind: "review", rating: 5, message: "Ang galing!\nSalamat", name: "Ana", contact: null, page: "browse", lang: "tl" });
  assert.equal((parseFeedback({ kind: "suggestion", rating: 4, message: "Add more fish dishes" }) as { rating: unknown }).rating, null);
  // Stars alone are enough for a review.
  assert.equal((parseFeedback({ kind: "review", rating: 4, message: "" }) as { rating: unknown }).rating, 4);
});

test("bad input: no message, odd kind, too-long fields, bots", () => {
  assert.deepEqual(parseFeedback({ kind: "suggestion", message: " " }), { error: "Write a short message" });
  assert.deepEqual(parseFeedback(null), { error: "Send a JSON object" });
  assert.equal((parseFeedback({ kind: "hack", message: "hello there" }) as { kind: string }).kind, "suggestion");
  assert.equal((parseFeedback({ kind: "review", rating: 9, message: "ok ok" }) as { rating: unknown }).rating, null);
  assert.equal((parseFeedback({ message: "x".repeat(5000) }) as { message: string }).message.length, 2000);
  assert.deepEqual(parseFeedback({ message: "buy now", website: "http://spam" }), { spam: true });
});
