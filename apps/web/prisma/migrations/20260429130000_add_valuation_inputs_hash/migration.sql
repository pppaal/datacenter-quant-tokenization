-- Pin a deterministic hash of (engineVersion, assumptions) per ValuationRun
-- so two runs against the same input bundle can be detected as equivalent.
-- Until now the only signal that two runs "should match" was creation time
-- + manual inspection of the JSON blob; with a hash the equivalence becomes
-- a single SQL comparison.

ALTER TABLE "ValuationRun" ADD COLUMN IF NOT EXISTS "inputsHash" TEXT;

CREATE INDEX IF NOT EXISTS "ValuationRun_assetId_inputsHash_idx"
  ON "ValuationRun"("assetId", "inputsHash");
