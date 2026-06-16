-- Clear all SM Markets snapshots so the next scrape re-populates with
-- food/grocery categories only (the scraper now filters by category name).
TRUNCATE TABLE "StoreProduct" RESTART IDENTITY;

-- Also reset any running/interrupted SM scraping logs so the next run starts
-- fresh with the filtered category tree.
UPDATE "ScrapingLog"
SET "status" = 'DONE', "cursor" = NULL, "itemsScraped" = 0, "finishedAt" = NOW()
WHERE "type" = 'SM' AND "status" != 'DONE';
