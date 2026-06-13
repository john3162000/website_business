import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  const latest = await prisma.commodity.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });

  if (!latest) return Response.json({ commodities: [], date: null });

  const where: Record<string, unknown> = { date: latest.date };
  if (q) where.name = { contains: q, mode: "insensitive" };

  const commodities = await prisma.commodity.findMany({
    where,
    orderBy: { name: "asc" },
  });

  return Response.json({ commodities, date: latest.date });
}
