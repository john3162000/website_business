-- The FNRI nutrition scraper's column mapping was wrong (it was matching
-- against a directory table that doesn't contain nutrient values), so all
-- existing NutritionFact rows have garbage foodCode/foodName/nutrient data.
-- The scraper now reads each food's nutrient modal directly; clear the table
-- so the next full scrape repopulates it with correct data.
TRUNCATE TABLE "NutritionFact" RESTART IDENTITY;

-- Drop any saved cursor/progress from the old (incorrect) nutrition scrape
-- so the next run starts over with the fixed extraction logic.
UPDATE "ScrapingLog" SET "status" = 'DONE', "cursor" = NULL, "finishedAt" = NOW()
WHERE "type" = 'NUTRITION' AND "status" != 'DONE';

