-- Recipes added from Panlasang Pinoy keep short method phrases instead of the steps.
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "methodNotes" TEXT;
