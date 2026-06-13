import { scrapeAndStoreNutrition } from "@/lib/scrapers/nutrition-scraper";
import { computeAndSaveScores } from "@/lib/scoring";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const nutritionCount = await scrapeAndStoreNutrition();
    const scoredCount = await computeAndSaveScores();
    return Response.json({ success: true, nutritionCount, scoredCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapingLog.create({
      data: { source: "FNRI", status: "error", message },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const logs = await prisma.scrapingLog.findMany({
    where: { source: "FNRI" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return Response.json(logs);
}
