-- Additive: a closed trade the owner leaves out of the statistics (one leg of a hedge).
ALTER TABLE "ClosedTrade" ADD COLUMN IF NOT EXISTS "excluded" BOOLEAN NOT NULL DEFAULT false;
