import assert from 'node:assert/strict';
import test from 'node:test';
import {
  capRateGapToMarket,
  hedonicResidual,
  summarizeMonteCarloRisk,
  summarizeScenarioSkew,
  summarizeTornado
} from '@/lib/services/valuation/insights';

test('summarizeTornado ranks the top driver and flags concentration', () => {
  const r = summarizeTornado(
    [
      { label: '진입 캡레이트', irrSwing: 1.0, lowIrr: 12, highIrr: 13 },
      { label: 'Exit 캡레이트', irrSwing: 6.0, lowIrr: 9.0, highIrr: 15.0, deltaLabel: '±0.5%' },
      { label: '임대료', irrSwing: 1.0, lowIrr: 12, highIrr: 13 }
    ],
    13.1
  );
  assert.equal(r.topDriver, 'Exit 캡레이트');
  assert.equal(r.concentrationFlag, true); // 6 / 8 = 75% > 40%
  assert.ok(r.bullets[0].includes('Exit 캡레이트'));
  assert.ok(r.bullets[0].includes('6pp') || r.bullets[0].includes('6.0pp'));
});

test('summarizeTornado surfaces degenerate (non-converged) drivers', () => {
  const r = summarizeTornado([{ label: 'DSCR', irrSwing: 2, lowIrr: null, highIrr: 4 }], 10);
  assert.deepEqual(r.degenerateDrivers, ['DSCR']);
});

test('summarizeMonteCarloRisk flags base-vs-median optimism + tail', () => {
  const r = summarizeMonteCarloRisk({
    baseLeveredIrrPct: 14,
    p5Pct: 3.2,
    p50Pct: 11,
    expectedShortfall95Pct: 1.5,
    probBelowZeroPct: 4
  });
  assert.equal(r.optimismGapPct, 3); // 14 - 11
  assert.ok(r.bullets.some((b) => b.includes('낙관적')));
  assert.ok(r.bullets.some((b) => b.includes('20분의 1')));
  assert.ok(r.bullets.some((b) => b.includes('원금손실')));
});

test('summarizeMonteCarloRisk: no optimism bullet when base ≤ median', () => {
  const r = summarizeMonteCarloRisk({ baseLeveredIrrPct: 10, p5Pct: null, p50Pct: 11 });
  assert.equal(r.optimismGapPct, -1);
  assert.ok(!r.bullets.some((b) => b.includes('낙관적')));
});

test('summarizeScenarioSkew classifies favorable / negative / symmetric', () => {
  assert.equal(summarizeScenarioSkew({ upsidePct: 20, downsidePct: -10 }).verdict, 'favorable');
  assert.equal(summarizeScenarioSkew({ upsidePct: 10, downsidePct: -30 }).verdict, 'negative');
  assert.equal(summarizeScenarioSkew({ upsidePct: 12, downsidePct: -11 }).verdict, 'symmetric');
  assert.equal(summarizeScenarioSkew({ upsidePct: null, downsidePct: -10 }).verdict, null);
});

test('capRateGapToMarket: inside = rich, above = cheap, near = in-line', () => {
  assert.equal(capRateGapToMarket(5.0, 4.6).classification, 'rich'); // -40bps
  assert.equal(capRateGapToMarket(4.6, 5.0).classification, 'cheap'); // +40bps
  assert.equal(capRateGapToMarket(5.0, 5.02).classification, 'in-line'); // +2bps
  assert.equal(capRateGapToMarket(5.0, 4.6).gapBps, -40);
});

test('hedonicResidual: outlier-cheap below fit, weak-fit guard, in-line band', () => {
  const fit = {
    fittedLogPricePerSqm: Math.log(5_000_000),
    residualStdErr: 0.1,
    adjustedRSquared: 0.6
  };
  const cheap = hedonicResidual(fit, 5_000_000 * Math.exp(-0.25)); // z = -2.5
  assert.equal(cheap.classification, 'outlier-cheap');
  assert.ok((cheap.pctGap ?? 0) < 0);

  const inline = hedonicResidual(fit, 5_000_000 * Math.exp(0.05)); // z = 0.5
  assert.equal(inline.classification, 'in-line');

  const weak = hedonicResidual({ ...fit, adjustedRSquared: 0.1 }, 6_000_000);
  assert.equal(weak.classification, 'fit-too-weak');
  assert.equal(weak.zScore, null);
});
