-- SM Markets (smmarkets.ph) retail product price snapshots. Acts as a second
-- price source alongside the DA Daily Price Index, sourced from the store's
-- Magento GraphQL API. One row per product per snapshot date.
CREATE TABLE "StoreProduct" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "uom" TEXT,
    "price" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SMMarkets',
    "sourceDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreProduct_sku_sourceDate_key" ON "StoreProduct"("sku", "sourceDate");

CREATE INDEX "StoreProduct_sku_sourceDate_idx" ON "StoreProduct"("sku", "sourceDate");
