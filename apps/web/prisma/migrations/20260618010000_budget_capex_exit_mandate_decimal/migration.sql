-- Final slice of the Float → Decimal money-tier migration (after
-- 20260618000000_nav_portfolio_decimal). Convert the remaining roll-up money
-- columns on budget / capex / exit / mandate tables from Float (double
-- precision) to Decimal(20, 2). Same rationale as capital_accounts_decimal:
-- Float8 silently loses precision beyond ~10^15. Ratio/percentage columns
-- (targetCapRatePct, targetIrrPct, probabilityPct) stay Float by design.
--
-- The USING clause casts existing values; NULLs pass through;
-- BudgetLineItem.annualBudgetKrw is NOT NULL and stays NOT NULL.
--
-- NOTE: `prisma migrate dev` also emits a spurious DROP of
-- "DocumentEmbedding_embedding_hnsw_idx" (Prisma 5 can't represent the pgvector
-- HNSW index); intentionally omitted — the CI drift guard strips it.

ALTER TABLE "BudgetLineItem"
  ALTER COLUMN "annualBudgetKrw" TYPE NUMERIC(20, 2) USING "annualBudgetKrw"::NUMERIC(20, 2),
  ALTER COLUMN "ytdActualKrw"    TYPE NUMERIC(20, 2) USING "ytdActualKrw"::NUMERIC(20, 2),
  ALTER COLUMN "varianceKrw"     TYPE NUMERIC(20, 2) USING "varianceKrw"::NUMERIC(20, 2);

ALTER TABLE "CapexProject"
  ALTER COLUMN "budgetKrw"         TYPE NUMERIC(20, 2) USING "budgetKrw"::NUMERIC(20, 2),
  ALTER COLUMN "approvedBudgetKrw" TYPE NUMERIC(20, 2) USING "approvedBudgetKrw"::NUMERIC(20, 2),
  ALTER COLUMN "spentToDateKrw"    TYPE NUMERIC(20, 2) USING "spentToDateKrw"::NUMERIC(20, 2);

ALTER TABLE "ExitCase"
  ALTER COLUMN "underwritingValueKrw" TYPE NUMERIC(20, 2) USING "underwritingValueKrw"::NUMERIC(20, 2);

ALTER TABLE "Mandate"
  ALTER COLUMN "targetAumKrw" TYPE NUMERIC(20, 2) USING "targetAumKrw"::NUMERIC(20, 2);
