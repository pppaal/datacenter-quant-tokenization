-- Convert FinancialStatement money columns from Float (double precision)
-- to Decimal(20, 2). Float8 silently rounds to 15-17 significant digits,
-- which loses 원 (KRW) precision once a value exceeds ~1 trillion (10^15).
-- For real-estate counterparties whose total assets routinely exceed
-- that threshold (Samsung Electronics, KEPCO, ...), Float was the wrong
-- type from day one.
--
-- Decimal(20, 2) covers values up to 999,999,999,999,999,999.99 — well
-- beyond any single counterparty's reasonable balance sheet — with two
-- subunits of precision so USD/JPY-denominated rows can carry their
-- original decimals through the conversion to KRW.
--
-- The USING clause runs an explicit cast for any row that already has
-- a value. NULLs pass through untouched. PG handles this in a single
-- table rewrite; for tables in the millions of rows this would need a
-- staged dual-write migration, but we're in single-tenant operator MVP
-- territory where the conversion is sub-second.
--
-- FinancialLineItem.valueKrw is converted alongside its parent so
-- aggregation queries don't get hit with cross-type comparisons.
-- fxRateToKrw stays DOUBLE PRECISION because it's a rate (1.0e-3..1.0e4
-- range) and double-precision is plenty for a four-decimal FX rate.

ALTER TABLE "FinancialStatement"
  ALTER COLUMN "revenueKrw"         TYPE NUMERIC(20, 2) USING "revenueKrw"::NUMERIC(20, 2),
  ALTER COLUMN "ebitdaKrw"          TYPE NUMERIC(20, 2) USING "ebitdaKrw"::NUMERIC(20, 2),
  ALTER COLUMN "cashKrw"            TYPE NUMERIC(20, 2) USING "cashKrw"::NUMERIC(20, 2),
  ALTER COLUMN "totalDebtKrw"       TYPE NUMERIC(20, 2) USING "totalDebtKrw"::NUMERIC(20, 2),
  ALTER COLUMN "totalAssetsKrw"     TYPE NUMERIC(20, 2) USING "totalAssetsKrw"::NUMERIC(20, 2),
  ALTER COLUMN "totalEquityKrw"     TYPE NUMERIC(20, 2) USING "totalEquityKrw"::NUMERIC(20, 2),
  ALTER COLUMN "interestExpenseKrw" TYPE NUMERIC(20, 2) USING "interestExpenseKrw"::NUMERIC(20, 2);

ALTER TABLE "FinancialLineItem"
  ALTER COLUMN "valueKrw" TYPE NUMERIC(20, 2) USING "valueKrw"::NUMERIC(20, 2);
