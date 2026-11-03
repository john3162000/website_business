-- One row per visitor per day (Manila time). "visitor" is a salted hash of the IP address, never the IP.
CREATE TABLE IF NOT EXISTS "Visit" (
  "id" SERIAL PRIMARY KEY,
  "day" TEXT NOT NULL,
  "visitor" TEXT NOT NULL,
  "country" TEXT,
  "region" TEXT,
  "city" TEXT,
  "page" TEXT,
  "lang" TEXT,
  "hits" INTEGER NOT NULL DEFAULT 1,
  "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Visit_day_visitor_key" ON "Visit"("day", "visitor");
CREATE INDEX IF NOT EXISTS "Visit_visitor_idx" ON "Visit"("visitor");
