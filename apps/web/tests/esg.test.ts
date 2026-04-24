import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEsgReport,
  estimateRetrofitEconomics,
  projectCarbonCost,
  scoreEsg,
  type EsgInput,
  DEFAULT_ESG_CONFIG
} from '@/lib/services/valuation/esg';

const greenAsset: EsgInput = {
  assetClass: 'OFFICE',
  gfaSqm: 10_000,
  energyGrade: '1+',
  gSeedGrade: 'EXCELLENT',
  zebLevel: 'ZEB4',
  electricityIntensityKwhPerSqm: 120,
  renewablePct: 30,
  re100TenantSharePct: 40,
  monthlyRentKrwPerSqm: 55_000
};

const strandedAsset: EsgInput = {
  ...greenAsset,
  energyGrade: '4',
  gSeedGrade: null,
  zebLevel: null,
  electricityIntensityKwhPerSqm: 220,
  renewablePct: 0,
  re100TenantSharePct: 0
};

test('scoreEsg: green asset scores higher than stranded', () => {
  const green = scoreEsg(greenAsset);
  const stranded = scoreEsg(strandedAsset);
  assert.ok(green.overall > stranded.overall);
  assert.equal(green.stranding, 'LOW');
  assert.equal(stranded.stranding, 'HIGH');
});

test('scoreEsg: moderate stranding when only one axis is weak', () => {
  const partial = scoreEsg({
    ...greenAsset,
    energyGrade: '3',
    gSeedGrade: 'EXCELLENT'
  });
  assert.equal(partial.stranding, 'MODERATE');
});

test('projectCarbonCost: tapering free allocation increases liability', () => {
  const rows = projectCarbonCost(strandedAsset);
  assert.equal(rows.length, DEFAULT_ESG_CONFIG.holdYears);
  // Liable tCO2 should grow year over year as free allocation tapers.
  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      rows[i]!.liableTco2 >= rows[i - 1]!.liableTco2,
      `year ${i + 1} liable tCO2 should >= year ${i}`
    );
  }
  // Price escalator: year 5 > year 1
  assert.ok(rows[4]!.carbonPriceKrw > rows[0]!.carbonPriceKrw);
});

test('projectCarbonCost: 100% renewable => zero Scope 2', () => {
  const clean = projectCarbonCost({
    ...greenAsset,
    renewablePct: 100
  });
  for (const r of clean) {
    assert.equal(r.scope2Tco2, 0);
    assert.equal(r.carbonCostKrw, 0);
  }
});

test('estimateRetrofitEconomics: computes capex and premium for stranded asset', () => {
  const econ = estimateRetrofitEconomics(strandedAsset);
  assert.ok(econ.estimatedCapexKrw > 0);
  assert.ok(econ.annualPremiumRevenueUpliftKrw > 0);
  assert.ok(econ.carbonCostSavedOverHoldKrw > 0);
  // For a mid-size 10,000sqm asset with grade-4 → target retrofit, capex-heavy economics
  // typically SKIP on 10yr horizon; verify that when NPV is negative, verdict is SKIP.
  if (econ.npv10yrKrw < 0) assert.equal(econ.verdict, 'SKIP');
});

test('estimateRetrofitEconomics: large high-rent asset justifies retrofit', () => {
  const premiumAsset: EsgInput = {
    ...strandedAsset,
    gfaSqm: 50_000,
    monthlyRentKrwPerSqm: 95_000,
    energyGrade: '3' // lower retrofit cost than '4'
  };
  const econ = estimateRetrofitEconomics(premiumAsset);
  assert.ok(['STRONG_UPGRADE', 'MARGINAL_UPGRADE'].includes(econ.verdict));
  assert.ok(econ.npv10yrKrw > 0);
});

test('estimateRetrofitEconomics: zero capex if already at top grade', () => {
  const econ = estimateRetrofitEconomics({
    ...greenAsset,
    energyGrade: '1++',
    gSeedGrade: 'BEST'
  });
  // premium = 0 because already EXCELLENT+ (no uplift captured); capex = 0.
  assert.equal(econ.estimatedCapexKrw, 0);
  assert.equal(econ.annualPremiumRevenueUpliftKrw, 0);
});

test('buildEsgReport: flags tenant RE100 vs renewable gap', () => {
  const report = buildEsgReport({
    ...greenAsset,
    renewablePct: 10,
    re100TenantSharePct: 50
  });
  assert.ok(report.notes.some((n) => n.includes('RE100')));
});

test('buildEsgReport: flags HIGH stranding risk', () => {
  const report = buildEsgReport(strandedAsset);
  assert.ok(report.notes.some((n) => n.includes('HIGH stranding risk')));
  assert.ok(report.totalCarbonCostOverHoldKrw > 0);
});
