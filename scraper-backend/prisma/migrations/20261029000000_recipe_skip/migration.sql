-- Pages the recipe crawl skipped (not a recipe, or a dish already listed from another site).
CREATE TABLE IF NOT EXISTS "RecipeSkip" (
  "url" TEXT PRIMARY KEY,
  "reason" TEXT NOT NULL,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
