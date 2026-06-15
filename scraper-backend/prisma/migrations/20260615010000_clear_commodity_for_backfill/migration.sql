-- The DA scraper now backfills the last 30 days of Daily Price Index data
-- (one Commodity row per commodity per day) instead of a single snapshot.
-- Clear the stale single-day data (Nov 17, 2025) and reset any DA scrape log
-- so the next run starts the 30-day backfill cleanly.
TRUNCATE TABLE "Commodity" RESTART IDENTITY;

UPDATE "ScrapingLog" SET "status" = 'DONE', "cursor" = NULL, "itemsScraped" = 0, "finishedAt" = NOW()
WHERE "type" = 'DA' AND "status" != 'DONE';
