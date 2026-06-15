-- The recipe scraper previously crawled the curated "/recipes/" landing page
-- (only ~68 recipes, with broken placeholder imageUrls). It now crawls the
-- full post-sitemap catalog (~3000 posts) with correct image extraction.
-- Clear existing recipes (and their ingredients/instructions via cascade) so
-- the full sitemap crawl repopulates everything cleanly.
TRUNCATE TABLE "Recipe", "RecipeIngredient", "RecipeInstruction" RESTART IDENTITY CASCADE;

UPDATE "ScrapingLog" SET "status" = 'DONE', "cursor" = NULL, "itemsScraped" = 0, "finishedAt" = NOW()
WHERE "type" = 'RECIPES' AND "status" != 'DONE';
