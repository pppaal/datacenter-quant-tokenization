import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, SourceStatus } from '@prisma/client';
import { buildMacroRegimeAnalysis } from '@/lib/services/macro/regime';

test('macro regime engine classifies tight capital and soft leasing conditions', () => {
  const now = new Date('2026-03-01T00:00:00.000Z');

  const regime = buildMacroRegimeAnalysis({
    assetClass: AssetClass.OFFICE,
    market: 'KR',
    marketSnapshot: {
      id: 'market_1',
      assetId: 'asset_1',
      metroRegion: 'Seoul CBD',
      vacancyPct: 12.4,
      colocationRatePerKwKrw: null,
      capRatePct: 6.2,
      debtCostPct: 6.4,
      inflationPct: 3.6,
      constructionCostPerMwKrw: null,
      discountRatePct: 9.3,
      marketNotes: 'Office vacancy remains elevated.',
      sourceStatus: SourceStatus.MANUAL,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    }
  });

  assert.equal(regime.market, 'Seoul CBD');
  assert.equal(regime.regimes.capitalMarkets.state, 'TIGHT');
  assert.equal(regime.regimes.leasing.state, 'SOFT');
  assert.equal(regime.regimes.construction.state, 'CONTAINED');
  assert.equal(regime.regimes.refinance.state, 'HIGH');
  assert.ok(regime.guidance.discountRateShiftPct > 0);
  assert.ok(regime.guidance.exitCapRateShiftPct > 0);
  assert.ok(regime.guidance.occupancyShiftPct < 0);
});

test('macro regime engine can derive a supportive view from series data', () => {
  const observationDate = new Date('2026-02-01T00:00:00.000Z');
  const sourceUpdatedAt = new Date('2026-02-20T00:00:00.000Z');

  const regime = buildMacroRegimeAnalysis({
    assetClass: AssetClass.INDUSTRIAL,
    market: 'KR',
    series: [
      {
        id: 'series_1',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'vacancy_pct',
        label: 'Vacancy',
        frequency: 'monthly',
        observationDate,
        value: 3.8,
        unit: '%',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      },
      {
        id: 'series_2',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'debt_cost_pct',
        label: 'Debt Cost',
        frequency: 'monthly',
        observationDate,
        value: 3.9,
        unit: '%',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      },
      {
        id: 'series_3',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'discount_rate_pct',
        label: 'Discount Rate',
        frequency: 'monthly',
        observationDate,
        value: 6.7,
        unit: '%',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      },
      {
        id: 'series_4',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'cap_rate_pct',
        label: 'Market Cap Rate',
        frequency: 'monthly',
        observationDate,
        value: 5.2,
        unit: '%',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      },
      {
        id: 'series_5',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'inflation_pct',
        label: 'Inflation',
        frequency: 'monthly',
        observationDate,
        value: 2.2,
        unit: '%',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      },
      {
        id: 'series_6',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'policy_rate_pct',
        label: 'Policy Rate',
        frequency: 'monthly',
        observationDate,
        value: 2.75,
        unit: '%',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      },
      {
        id: 'series_7',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'credit_spread_bps',
        label: 'Credit Spread',
        frequency: 'monthly',
        observationDate,
        value: 135,
        unit: 'bps',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      },
      {
        id: 'series_8',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'rent_growth_pct',
        label: 'Rent Growth',
        frequency: 'monthly',
        observationDate,
        value: 2.8,
        unit: '%',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      },
      {
        id: 'series_9',
        assetId: null,
        market: 'Incheon',
        seriesKey: 'transaction_volume_index',
        label: 'Transaction Volume',
        frequency: 'monthly',
        observationDate,
        value: 108,
        unit: 'idx',
        sourceSystem: 'custom-macro-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt,
        createdAt: sourceUpdatedAt,
        updatedAt: sourceUpdatedAt
      }
    ]
  });

  assert.equal(regime.regimes.capitalMarkets.state, 'SUPPORTIVE');
  assert.equal(regime.regimes.leasing.state, 'STRONG');
  assert.equal(regime.regimes.refinance.state, 'LOW');
  assert.ok(regime.guidance.discountRateShiftPct < 0);
  assert.ok(regime.guidance.occupancyShiftPct > 0);
  assert.ok(regime.guidance.summary.some((line) => line.includes('supportive')));
});

test('macro regime engine applies harsher weighting to data-center construction and capital sensitivity', () => {
  const now = new Date('2026-03-01T00:00:00.000Z');

  const office = buildMacroRegimeAnalysis({
    assetClass: AssetClass.OFFICE,
    market: 'US',
    marketSnapshot: {
      id: 'market_office',
      assetId: 'asset_office',
      metroRegion: 'Northern Virginia',
      vacancyPct: 6.5,
      colocationRatePerKwKrw: null,
      capRatePct: 5.8,
      debtCostPct: 4.8,
      inflationPct: 2.8,
      constructionCostPerMwKrw: 7_400_000_000,
      discountRatePct: 7.0,
      marketNotes: 'Stable conditions.',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    }
  });

  const dataCenter = buildMacroRegimeAnalysis({
    assetClass: AssetClass.DATA_CENTER,
    market: 'US',
    marketSnapshot: {
      id: 'market_dc',
      assetId: 'asset_dc',
      metroRegion: 'Northern Virginia',
      vacancyPct: 6.5,
      colocationRatePerKwKrw: null,
      capRatePct: 5.8,
      debtCostPct: 4.8,
      inflationPct: 2.8,
      constructionCostPerMwKrw: 7_400_000_000,
      discountRatePct: 7.0,
      marketNotes: 'Stable conditions.',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    }
  });

  assert.equal(office.regimes.construction.state, 'CONTAINED');
  assert.equal(dataCenter.regimes.construction.state, 'HIGH');
  assert.equal(dataCenter.regimes.capitalMarkets.state, 'TIGHT');
  assert.ok(['NEUTRAL', 'TIGHT'].includes(office.regimes.capitalMarkets.state));
  assert.ok(dataCenter.profile.capitalRateSensitivity > office.profile.capitalRateSensitivity);
  assert.ok(dataCenter.guidance.replacementCostShiftPct > office.guidance.replacementCostShiftPct);
  assert.ok(dataCenter.guidance.discountRateShiftPct > office.guidance.discountRateShiftPct);
  assert.match(dataCenter.guidance.summary[0] ?? '', /Asset weighting/i);
});

test('macro regime engine applies country and submarket sensitivity overrides', () => {
  const now = new Date('2026-03-01T00:00:00.000Z');

  const seoulOffice = buildMacroRegimeAnalysis({
    assetClass: AssetClass.OFFICE,
    market: 'KR',
    country: 'KR',
    marketSnapshot: {
      id: 'market_seoul_office',
      assetId: 'asset_seoul_office',
      metroRegion: 'Seoul CBD',
      vacancyPct: 7.1,
      colocationRatePerKwKrw: null,
      capRatePct: 5.2,
      debtCostPct: 4.9,
      inflationPct: 2.7,
      constructionCostPerMwKrw: 7_100_000_000,
      discountRatePct: 7.4,
      marketNotes: 'Core office market.',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    }
  });

  const nycOffice = buildMacroRegimeAnalysis({
    assetClass: AssetClass.OFFICE,
    market: 'US',
    country: 'US',
    marketSnapshot: {
      id: 'market_nyc_office',
      assetId: 'asset_nyc_office',
      metroRegion: 'Manhattan',
      vacancyPct: 7.1,
      colocationRatePerKwKrw: null,
      capRatePct: 5.2,
      debtCostPct: 4.9,
      inflationPct: 2.7,
      constructionCostPerMwKrw: 7_100_000_000,
      discountRatePct: 7.4,
      marketNotes: 'Core office market.',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    }
  });

  const novaDataCenter = buildMacroRegimeAnalysis({
    assetClass: AssetClass.DATA_CENTER,
    market: 'US',
    country: 'US',
    marketSnapshot: {
      id: 'market_nova_dc',
      assetId: 'asset_nova_dc',
      metroRegion: 'Northern Virginia',
      vacancyPct: 6.4,
      colocationRatePerKwKrw: null,
      capRatePct: 5.7,
      debtCostPct: 5.1,
      inflationPct: 2.7,
      constructionCostPerMwKrw: 7_900_000_000,
      discountRatePct: 7.5,
      marketNotes: 'Data-center hub.',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: now,
      createdAt: now,
      updatedAt: now
    }
  });

  assert.equal(seoulOffice.profile.country, 'KR');
  assert.equal(seoulOffice.profile.submarket, 'seoul cbd');
  assert.ok(seoulOffice.profile.adjustmentSummary.some((line) => /Korea/i.test(line)));
  assert.ok(seoulOffice.profile.adjustmentSummary.some((line) => /Seoul office/i.test(line)));
  assert.ok(nycOffice.profile.adjustmentSummary.some((line) => /US liquidity/i.test(line)));
  assert.ok(nycOffice.profile.adjustmentSummary.some((line) => /NYC office/i.test(line)));
  assert.ok(nycOffice.profile.liquiditySensitivity > seoulOffice.profile.liquiditySensitivity);
  assert.ok(novaDataCenter.profile.adjustmentSummary.some((line) => /Northern Virginia/i.test(line)));
  assert.ok(novaDataCenter.profile.constructionSensitivity > 1.4);
});
