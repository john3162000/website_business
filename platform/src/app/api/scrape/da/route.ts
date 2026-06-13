import { fetchAndStoreDAPrices, storePdfUpload } from "@/lib/scrapers/da-scraper";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let count: number;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("pdf") as File | null;
      const dateStr = form.get("date") as string | null;

      if (!file) {
        return Response.json({ error: "No PDF file provided" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const date = dateStr ? new Date(dateStr) : new Date();
      count = await storePdfUpload(buffer, date);
    } else {
      count = await fetchAndStoreDAPrices();
    }

    return Response.json({ success: true, count });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapingLog.create({
      data: { source: "DA", status: "error", message },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const logs = await prisma.scrapingLog.findMany({
    where: { source: { in: ["DA", "DA-UPLOAD"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return Response.json(logs);
}
