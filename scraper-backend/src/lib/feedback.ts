/**
 * Reviews and suggestions sent from the site's 💬 dialog (POST /api/feedback). Pure: checks and
 * trims the request body, so the route and the tests share it.
 */
export const FEEDBACK_KINDS = ["review", "suggestion", "problem"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export interface FeedbackInput {
  kind: FeedbackKind;
  /** 1–5 stars; only for reviews, and optional there. */
  rating: number | null;
  message: string;
  name: string | null;
  /** An email or Facebook name, if they want a reply. */
  contact: string | null;
  /** The site section it was sent from ("browse", "planner", …). */
  page: string | null;
  lang: string | null;
}

export const FEEDBACK_MAX_MESSAGE = 2000;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) || null : null);

/**
 * The feedback in a request body, `{ spam: true }` when the hidden "website" field (left empty by
 * people, filled by bots) has text, or `{ error }` when it can't be used.
 */
export function parseFeedback(body: unknown): FeedbackInput | { spam: true } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Send a JSON object" };
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim()) return { spam: true };
  const kind = FEEDBACK_KINDS.includes(b.kind as FeedbackKind) ? (b.kind as FeedbackKind) : "suggestion";
  // Keep line breaks in the message; only trim it.
  const message = typeof b.message === "string" ? b.message.trim().slice(0, FEEDBACK_MAX_MESSAGE) : "";
  const r = Number(b.rating);
  const rating = kind === "review" && Number.isInteger(r) && r >= 1 && r <= 5 ? r : null;
  if (message.length < 3 && rating == null) return { error: "Write a short message" };
  return { kind, rating, message, name: str(b.name, 80), contact: str(b.contact, 120), page: str(b.page, 40), lang: str(b.lang, 5) };
}
