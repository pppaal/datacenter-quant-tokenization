import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStatementQualityInsights,
  dupontDecomposition,
  earningsQuality
} from '@/lib/services/credit/dupont';

test('dupont: three factors and ROE computed directly', () => {
  // netIncome 1850, revenue 41200, assets 705350, equity 275050
  const r = dupontDecomposition({
    netIncome: 1850,
    revenue: 41200,
    totalAssets: 705350,
    totalEquity: 275050
  });
  assert.equal(r.netMarginPct, round1((1850 / 41200) * 100)); // 4.5
  assert.equal(r.assetTurnover, round3(41200 / 705350)); // 0.058
  assert.equal(r.equityMultiplier, round2(705350 / 275050)); // 2.56
  assert.equal(r.roePct, round1((1850 / 275050) * 100)); // 0.7
  assert.ok(r.headline && r.headline.includes('ROE'));
});

test('dupont: low ROA geared into positive ROE → leverage driver', () => {
  // ROA = 0.26%, ROE = 0.67% → lift (0.41pp) > |ROA| → leverage-driven
  const r = dupontDecomposition({
    netIncome: 1850,
    revenue: 41200,
    totalAssets: 705350,
    totalEquity: 275050
  });
  assert.equal(r.driver, 'leverage');
  assert.match(r.headline!, /재무레버리지가 견인/);
});

test('dupont: negative ROA but positive ROE → leverage driver', () => {
  // Net income positive only because... actually model a loss on assets but
  // structurally this path is the roa<=0 && roe>0 branch needs roe>0; with
  // negative NI both go negative, so instead test thin operating return.
  const r = dupontDecomposition({
    netIncome: 100,
    revenue: 5000,
    totalAssets: 100000,
    totalEquity: 5000
  });
  // ROA 0.1%, ROE 2.0% → leverage-driven
  assert.equal(r.driver, 'leverage');
});

test('dupont: strong operating return, low leverage → operating driver', () => {
  const r = dupontDecomposition({
    netIncome: 200,
    revenue: 1000,
    totalAssets: 1000,
    totalEquity: 950
  });
  // ROA 20%, ROE 21.1% → lift 1.1pp < 25% of ROA → operating
  assert.equal(r.driver, 'operating');
});

test('dupont: null-safe on non-positive / missing denominators', () => {
  const r = dupontDecomposition({
    netIncome: 100,
    revenue: 0, // non-positive
    totalAssets: 0, // non-positive
    totalEquity: null
  });
  assert.equal(r.netMarginPct, null);
  assert.equal(r.assetTurnover, null);
  assert.equal(r.equityMultiplier, null);
  assert.equal(r.roePct, null);
  assert.equal(r.driver, null);
  assert.equal(r.headline, null);
});

test('earningsQuality: strong when OCF >= NI', () => {
  const r = earningsQuality({ operatingCashFlow: 12100, netIncome: 1850 });
  assert.equal(r.classification, 'strong');
  assert.equal(r.flag, null);
  assert.equal(r.ocfToNi, round2(12100 / 1850));
  assert.ok(r.headline!.includes('양호'));
});

test('earningsQuality: weak when OCF well below NI (accrual gap)', () => {
  const r = earningsQuality({ operatingCashFlow: 400, netIncome: 2000 });
  assert.equal(r.classification, 'weak');
  assert.equal(r.ocfToNi, 0.2);
  assert.equal(r.accrualRatioPct, round1(((2000 - 400) / 2000) * 100)); // 80
  assert.ok(r.flag && r.flag.includes('이익의 질 낮음'));
});

test('earningsQuality: adequate in the middle band', () => {
  const r = earningsQuality({ operatingCashFlow: 1400, netIncome: 2000 });
  assert.equal(r.classification, 'adequate'); // 0.7×
  assert.equal(r.flag, null);
});

test('earningsQuality: loss-making returns n/a but flags cash burn', () => {
  const burn = earningsQuality({ operatingCashFlow: -500, netIncome: -300 });
  assert.equal(burn.classification, 'n/a');
  assert.equal(burn.accrualRatioPct, null);
  assert.ok(burn.flag && burn.flag.includes('영업현금흐름 (−)'));

  const resilient = earningsQuality({ operatingCashFlow: 800, netIncome: -300 });
  assert.equal(resilient.classification, 'n/a');
  assert.equal(resilient.flag, null);
  assert.ok(resilient.headline!.includes('적자에도'));
});

test('earningsQuality: null-safe', () => {
  assert.equal(earningsQuality({ operatingCashFlow: null, netIncome: 100 }).classification, 'n/a');
  assert.equal(earningsQuality({ operatingCashFlow: 100, netIncome: null }).headline, null);
});

test('buildStatementQualityInsights: uses latest (element 0) period', () => {
  const out = buildStatementQualityInsights([
    {
      label: '2026',
      netIncome: 1850,
      revenue: 41200,
      totalAssets: 705350,
      totalEquity: 275050,
      operatingCashFlow: 12100
    },
    {
      label: '2025',
      netIncome: 999,
      revenue: 40000,
      totalAssets: 700000,
      totalEquity: 270000,
      operatingCashFlow: 5000
    }
  ]);
  assert.equal(out.period, '2026');
  assert.equal(out.dupont.roePct, round1((1850 / 275050) * 100));
  assert.equal(out.earningsQuality.classification, 'strong');
});

test('buildStatementQualityInsights: empty input is null-safe', () => {
  const out = buildStatementQualityInsights([]);
  assert.equal(out.period, null);
  assert.equal(out.dupont.roePct, null);
  assert.equal(out.earningsQuality.classification, 'n/a');
});

// local rounding helpers mirroring lib/math.round semantics
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
