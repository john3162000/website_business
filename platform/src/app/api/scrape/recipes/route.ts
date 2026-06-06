import { scrapeAndStoreRecipes } from "@/lib/scrapers/recipe-scraper";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const maxPages = typeof body.maxPages === "number" ? body.maxPages : 3;

    const count = await scrapeAndStoreRecipes(maxPages);
    return Response.json({ success: true, count });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapingLog.create({
      data: { source: "PanlasangPinoy", status: "error", message },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const logs = await prisma.scrapingLog.findMany({
    where: { source: "PanlasangPinoy" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return Response.json(logs);
}
