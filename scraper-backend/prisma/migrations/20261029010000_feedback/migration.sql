-- Reviews and suggestions sent from the site.
CREATE TABLE IF NOT EXISTS "Feedback" (
  "id" SERIAL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "rating" INTEGER,
  "message" TEXT NOT NULL,
  "name" TEXT,
  "contact" TEXT,
  "page" TEXT,
  "lang" TEXT,
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx" ON "Feedback"("createdAt");
