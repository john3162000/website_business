// More daily runs of the recipe crawl (vercel.json: extra-1 … extra-4), the same handler as
// /api/cron/recipes. Hobby crons fire once a day each, so extra times keep the first full pass of
// the new recipe sites moving even if a run's self-chaining stops early.
export { GET } from "../route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
