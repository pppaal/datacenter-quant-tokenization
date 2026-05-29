/**
 * Correctness-property tests for the property-analysis engine.
 *
 * These lock invariants that the explainability work depends on but which were
 * previously unguarded:
 *
 *   1. MC base == headline    — the Monte Carlo base case and the headline
 *      levered IRR now share ONE pro-forma base. We assert the end-of-year
 *      recompute off the headline pro-forma exactly equals the MC base case
 *      (mirroring two-model-noi.test.ts), and that the headline (mid-year) is
 *      close, accounting for the known discounting-convention gap.
 *   2. Line-item integrity    — the fabricated revenue/opex line-item splits in
 *      the synthetic pro-forma sum to their aggregates, and NOI == revenue −
 *      opex, every year.
 *   3. IRR monotonic in entry cap — holding all else equal, a higher entry cap
 *      rate (lower price, same yield) yields a higher levered IRR.
 *   4. Verdict consistency    — the investment verdict's Base Levered IRR
 *      dimension reflects returnMetrics.equityIrr with no divergent recompute.
 *
 * All offline (no network / no DB / no API key).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { autoAnalyzeProperty } from '@/lib/services/property-analyzer/auto-analyze';
import { buildFullReport } from '@/lib/services/property-analyzer/full-report';
import {
  buildSyntheticProForma,
  type ProFormaInputs
} from '@/lib/services/valuation/synthetic-pro-forma';
import { computeReturnMetricsFromProForma } from '@/lib/services/valuation/return-metrics';

const OFFICE_ADDRESS = '서울특별시 강남구 압구정로 340';

// Reusable synthetic input (mirrors two-model-noi.test.ts's baseline).
function baseInputs(overrides: Partial<ProFormaInputs> = {}): ProFormaInputs {
  return {
    purchasePriceKrw: 50_000_000_000,
    ltvPct: 60,
    interestRatePct: 5.4,
    amortTermMonths: 180,
    capRatePct: 6,
    exitCapRatePct: 6.25,
    year1Noi: 3_000_000_000,
    growthPct: 2.5,
    opexRatio: 0.25,
    propertyTaxPct: 0.25,
    insurancePct: 0.08,
    corpTaxPct: 22,
    exitTaxPct: 22,
    acquisitionTaxPct: 4.6,
    landValuePct: 25,
    depreciationYears: 40,
    exitCostPct: 1.5,
    propertyTaxGrowthPct: 3,
    assetClass: 'OFFICE',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// 1. MC base == headline (one shared base)
// ---------------------------------------------------------------------------

test('property: MC base levered IRR equals end-of-year recompute off the headline pro-forma', async () => {
  const auto = await autoAnalyzeProperty({ address: OFFICE_ADDRESS });
  const report = await buildFullReport(auto);

  // End-of-year recompute off the SAME pro-forma the headline used must equal
  // the MC base exactly — proving they share one base (not divergent models).
  const eoy = computeReturnMetricsFromProForma(
    report.proForma,
    report.proFormaExtras.totalBasisKrw,
    report.proForma.summary.initialDebtFundingKrw,
    report.proForma.summary.netExitProceedsKrw,
    report.proForma.summary.terminalValueKrw,
    false
  );

  assert.equal(report.monteCarlo.baseLeveredIrr !== null, true);
  assert.equal(
    eoy.leveragedIrr,
    report.monteCarlo.baseLeveredIrr,
    `EOY recompute ${eoy.leveragedIrr} must equal MC base ${report.monteCarlo.baseLeveredIrr}`
  );

  // Headline uses mid-year; only the discount convention should differ, so the
  // two must stay tight. This is robust to the parallel MC agent shifting the
  // TAILS — it touches only the base case here.
  assert.ok(report.returnMetrics.leveragedIrr !== null);
  assert.ok(
    Math.abs(report.returnMetrics.leveragedIrr! - report.monteCarlo.baseLeveredIrr!) < 1.5,
    `headline ${report.returnMetrics.leveragedIrr} and MC base ${report.monteCarlo.baseLeveredIrr} should differ only by convention`
  );

  // And the memo reconciliation must report the same MC base + a within-tolerance flag.
  assert.equal(report.memo.reconciliation.monteCarloBaseIrrPct, report.monteCarlo.baseLeveredIrr);
  assert.equal(report.memo.reconciliation.baseLeveredIrrPct, report.returnMetrics.equityIrr);
  assert.equal(
    report.memo.reconciliation.flagged,
    false,
    'base vs MC-base should reconcile within tolerance'
  );
});

// ---------------------------------------------------------------------------
// 2. Line-item integrity — fabricated splits sum to the aggregates, every year
// ---------------------------------------------------------------------------

test('property: synthetic line-item splits sum to revenue/opex aggregates and NOI identity holds', () => {
  const { proForma } = buildSyntheticProForma(baseInputs());

  for (const y of proForma.years) {
    // Revenue components: rental (contracted + renewal + residual) + recoveries
    // (fixed + site + utility pass-through) == total revenue.
    const rentalComponents = y.contractedRevenueKrw + y.renewalRevenueKrw + y.residualRevenueKrw;
    const recoveryComponents =
      y.fixedRecoveriesKrw + y.siteRecoveriesKrw + y.utilityPassThroughRevenueKrw;
    assert.equal(
      recoveryComponents,
      y.reimbursementRevenueKrw,
      `year ${y.year}: recovery components must sum to reimbursement revenue`
    );
    assert.ok(
      Math.abs(rentalComponents + recoveryComponents - y.revenueKrw) <= 2,
      `year ${y.year}: revenue components ${rentalComponents + recoveryComponents} must sum to total revenue ${y.revenueKrw}`
    );

    // Opex components: power + site-op + non-recoverable + maintenance == total opex.
    const opexComponents =
      y.powerCostKrw +
      y.siteOperatingExpenseKrw +
      y.nonRecoverableOperatingExpenseKrw +
      y.maintenanceReserveKrw;
    assert.equal(
      opexComponents,
      y.operatingExpenseKrw,
      `year ${y.year}: opex components must sum to total opex`
    );

    // NOI identity: NOI == revenue − opex (reserves are below-NOI in this model).
    assert.equal(
      y.noiKrw,
      y.revenueKrw - y.operatingExpenseKrw,
      `year ${y.year}: NOI must equal revenue − opex`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. IRR monotonic in entry cap rate (higher cap → lower price → higher IRR)
// ---------------------------------------------------------------------------

test('property: higher entry cap rate yields higher levered IRR, all else equal', () => {
  // Drive entry cap directly: hold NOI fixed and lower the purchase price as the
  // entry cap rises (price = NOI / cap), keeping every other lever constant. A
  // cheaper entry at the same NOI MUST produce a higher levered IRR.
  const noi = 3_000_000_000;
  const caps = [5.0, 5.5, 6.0, 6.5, 7.0];

  const irrs = caps.map((capRatePct) => {
    const price = Math.round((noi / capRatePct) * 100);
    const inputs = baseInputs({
      capRatePct,
      year1Noi: noi,
      purchasePriceKrw: price
    });
    const { proForma, extras } = buildSyntheticProForma(inputs);
    const metrics = computeReturnMetricsFromProForma(
      proForma,
      extras.totalBasisKrw,
      proForma.summary.initialDebtFundingKrw,
      proForma.summary.netExitProceedsKrw,
      proForma.summary.terminalValueKrw
    );
    return metrics.equityIrr;
  });

  for (let i = 1; i < irrs.length; i++) {
    assert.ok(irrs[i] !== null && irrs[i - 1] !== null, `IRR should be computable at every cap`);
    assert.ok(
      irrs[i]! > irrs[i - 1]!,
      `IRR must increase with entry cap: cap ${caps[i]}% → ${irrs[i]} should exceed cap ${caps[i - 1]}% → ${irrs[i - 1]}`
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Verdict consistency — verdict's headline IRR reflects returnMetrics
// ---------------------------------------------------------------------------

test('property: investment verdict Base Levered IRR dimension matches returnMetrics (no divergent recompute)', async () => {
  const auto = await autoAnalyzeProperty({ address: OFFICE_ADDRESS });
  const report = await buildFullReport(auto);

  const irrDim = report.verdict.dimensions.find((d) => d.dimension === 'Base Levered IRR');
  assert.ok(irrDim, 'verdict must score a Base Levered IRR dimension');

  const headline = report.returnMetrics.equityIrr;
  const expectedObserved = headline === null ? 'N/A' : `${headline.toFixed(2)}%`;
  assert.equal(
    irrDim!.observed,
    expectedObserved,
    `verdict Base Levered IRR observed (${irrDim!.observed}) must reflect returnMetrics.equityIrr (${expectedObserved})`
  );

  // The memo reconciliation's base IRR must also equal returnMetrics — the verdict
  // and the memo cannot disagree on the headline number.
  assert.equal(report.memo.reconciliation.baseLeveredIrrPct, report.returnMetrics.equityIrr);
});
