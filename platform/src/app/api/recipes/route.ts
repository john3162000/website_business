import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q");
  const category = searchParams.get("category");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "24");

  const where: Record<string, unknown> = {};
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (category) where.category = { contains: category, mode: "insensitive" };

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        score: {
          select: {
            valueScore: true,
            nutritionScore: true,
            costPerServing: true,
            calories: true,
            protein: true,
          },
        },
        _count: { select: { ingredients: true } },
      },
    }),
    prisma.recipe.count({ where }),
  ]);

  return Response.json({ recipes, total, page, totalPages: Math.ceil(total / limit) });
}
