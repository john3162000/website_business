-- Age bracket the visitor chose on the site (child, teen, young, adult, midlife, senior).
ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "age" TEXT;
