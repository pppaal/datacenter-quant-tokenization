import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFxHedge, type FxHedgeInput } from '@/lib/services/valuation/fx-hedge';

const baseInput: FxHedgeInput = {
  cashflowsKrw: [
    { year: 0, krwAmount: -100_000_000_000 }, // 100bn KRW initial equity
    { year: 1, krwAmount: 5_000_000_000 },
    { year: 2, krwAmount: 5_500_000_000 },
    { year: 3, krwAmount: 6_000_000_000 },
    { year: 4, krwAmount: 6_500_000_000 },
    { year: 5, krwAmount: 7_000_000_000 }
  ],
  exitProceedsKrw: 140_000_000_000,
  exitYear: 5,
  spotUsdKrw: 1_380,
  annualKrwDepreciationPct: 2,
  annualKrwForwardPremiumPct: 1.5,
  hedgeStrategy: 'NONE',
  hedgeRatioPct: 0
};

test('NONE strategy: KRW IRR > USD IRR when KRW depreciates', () => {
  const result = applyFxHedge(baseInput);
  assert.ok(result.krwIrr !== null && result.unhedgedIrrUsd !== null);
  // KRW weakens, so USD return is strictly worse than KRW return.
  assert.ok(result.krwIrr > result.unhedgedIrrUsd);
  // hedgedIrrUsd equals unhedged when strategy is NONE
  assert.equal(result.hedgedIrrUsd, result.unhedgedIrrUsd);
  assert.equal(result.totalHedgePnlUsd, 0);
});

test('ROLLING_FORWARDS at 100% removes spot path from USD IRR', () => {
  const hedged = applyFxHedge({
    ...baseInput,
    hedgeStrategy: 'ROLLING_FORWARDS',
    hedgeRatioPct: 100
  });
  const unhedged = applyFxHedge(baseInput);
  // Hedged IRR is driven by forward premium (1.5%), not spot depreciation (2%),
  // so hedge should improve USD IRR vs unhedged when premium < depreciation.
  assert.ok(
    hedged.hedgedIrrUsd! > unhedged.unhedgedIrrUsd!,
    `hedged USD IRR ${hedged.hedgedIrrUsd} should beat unhedged ${unhedged.unhedgedIrrUsd} when forward premium < spot depreciation`
  );
  // Hedge P&L is positive (hedged USD > unhedged USD per year) in this scenario.
  assert.ok(hedged.totalHedgePnlUsd > 0);
});

test('ROLLING_FORWARDS with premium > depreciation costs carry', () => {
  const costly = applyFxHedge({
    ...baseInput,
    hedgeStrategy: 'ROLLING_FORWARDS',
    hedgeRatioPct: 100,
    annualKrwForwardPremiumPct: 5, // hedge cost > KRW depreciation (2%)
    annualKrwDepreciationPct: 2
  });
  const unhedged = applyFxHedge({
    ...baseInput,
    annualKrwDepreciationPct: 2
  });
  // Over-hedging costs money when premium > actual spot weakening.
  assert.ok(
    costly.hedgedIrrUsd! < unhedged.unhedgedIrrUsd!,
    'expensive hedge should underperform unhedged when forward premium exceeds realized spot depreciation'
  );
  assert.ok(costly.totalHedgePnlUsd < 0);
});

test('EXIT_ONLY_NDF hedges only terminal year', () => {
  const result = applyFxHedge({
    ...baseInput,
    hedgeStrategy: 'EXIT_ONLY_NDF',
    hedgeRatioPct: 100
  });
  // Years 1-4 should have null hedgedUsdKrw; exit year gets the forward.
  for (const row of result.years) {
    if (row.year === baseInput.exitYear) {
      assert.notEqual(row.hedgedUsdKrw, null);
      assert.notEqual(row.hedgePnlUsd, 0);
    } else if (row.year > 0 && row.year < baseInput.exitYear) {
      assert.equal(row.hedgedUsdKrw, null);
      assert.equal(row.hedgePnlUsd, 0);
    }
  }
});

test('partial hedge ratio reduces hedge effectiveness proportionally', () => {
  const half = applyFxHedge({
    ...baseInput,
    hedgeStrategy: 'ROLLING_FORWARDS',
    hedgeRatioPct: 50
  });
  const full = applyFxHedge({
    ...baseInput,
    hedgeStrategy: 'ROLLING_FORWARDS',
    hedgeRatioPct: 100
  });
  const unhedged = applyFxHedge(baseInput);
  assert.ok(
    half.totalHedgePnlUsd > 0 && half.totalHedgePnlUsd < full.totalHedgePnlUsd,
    'partial hedge P&L should be between 0 and full-hedge P&L'
  );
  // Half-hedge IRR lies strictly between unhedged and full-hedged
  assert.ok(unhedged.unhedgedIrrUsd! < half.hedgedIrrUsd!);
  assert.ok(half.hedgedIrrUsd! < full.hedgedIrrUsd!);
});

test('terminal depreciation pct matches projected spot vs start', () => {
  const result = applyFxHedge({
    ...baseInput,
    annualKrwDepreciationPct: 3,
    exitYear: 5
  });
  // (1.03)^5 - 1 = 15.927% deprec at year 5
  assert.ok(Math.abs(result.terminalKrwDepreciationPct - 15.93) < 0.02);
});
