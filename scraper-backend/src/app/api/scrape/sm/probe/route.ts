import { prisma } from "@/lib/db";
import { probeSMProduct } from "@/lib/scrapers/sm-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnostic: probe one SM Markets product's full GraphQL fields (description +
 * custom attributes) to discover which carry nutrition facts. Pass `?sku=...`,
 * or it defaults to the first stored food product. Keyed by SKU so whatever
 * nutrition fields we find can be wired back to the priced StoreProduct row.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let sku = searchParams.get("sku")?.trim();

  if (!sku) {
    const sample = await prisma.storeProduct.findFirst({
      orderBy: { id: "asc" },
      select: { sku: true },
    });
    sku = sample?.sku;
  }

  if (!sku) {
    return Response.json({ error: "No SKU provided and no StoreProduct rows exist yet." }, { status: 400 });
  }

  try {
    const probe = await probeSMProduct(sku);
    return Response.json(probe);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
