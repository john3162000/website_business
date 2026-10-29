// The recipe crawl's second daily run (vercel.json, 15:15 UTC): the same handler as
// /api/cron/recipes, under its own path so it can have its own schedule.
export { GET } from "../recipes/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
