import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceStatus } from '@prisma/client';
import { buildMacroFactorCreateInputs, buildMacroFactorSnapshot } from '@/lib/services/macro/factors';

test('macro factor engine derives common factors from raw series history', () => {
  const olderDate = new Date('2026-01-01T00:00:00.000Z');
  const currentDate = new Date('2026-02-01T00:00:00.000Z');
  const updatedAt = new Date('2026-02-15T00:00:00.000Z');

  const snapshot = buildMacroFactorSnapshot({
    market: 'US',
    series: [
      {
        id: 'p1',
        assetId: null,
        market: 'US',
        seriesKey: 'policy_rate_pct',
        label: 'Policy Rate',
        frequency: 'monthly',
        observationDate: olderDate,
        value: 4.75,
        unit: '%',
        sourceSystem: 'us-fred',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 'p2',
        assetId: null,
        market: 'US',
        seriesKey: 'policy_rate_pct',
        label: 'Policy Rate',
        frequency: 'monthly',
        observationDate: currentDate,
        value: 5,
        unit: '%',
        sourceSystem: 'us-fred',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 'd1',
        assetId: null,
        market: 'US',
        seriesKey: 'debt_cost_pct',
        label: 'Debt Cost',
        frequency: 'monthly',
        observationDate: olderDate,
        value: 5.4,
        unit: '%',
        sourceSystem: 'us-fred',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 'd2',
        assetId: null,
        market: 'US',
        seriesKey: 'debt_cost_pct',
        label: 'Debt Cost',
        frequency: 'monthly',
        observationDate: currentDate,
        value: 5.8,
        unit: '%',
        sourceSystem: 'us-fred',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 'r1',
        assetId: null,
        market: 'US',
        seriesKey: 'rent_growth_pct',
        label: 'Rent Growth',
        frequency: 'monthly',
        observationDate: currentDate,
        value: 2.7,
        unit: '%',
        sourceSystem: 'global-market-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 'v1',
        assetId: null,
        market: 'US',
        seriesKey: 'vacancy_pct',
        label: 'Vacancy',
        frequency: 'monthly',
        observationDate: currentDate,
        value: 4.4,
        unit: '%',
        sourceSystem: 'global-market-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 't1',
        assetId: null,
        market: 'US',
        seriesKey: 'transaction_volume_index',
        label: 'Transaction Volume',
        frequency: 'monthly',
        observationDate: currentDate,
        value: 109,
        unit: 'idx',
        sourceSystem: 'global-market-api',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 'c1',
        assetId: null,
        market: 'US',
        seriesKey: 'credit_spread_bps',
        label: 'Credit Spread',
        frequency: 'monthly',
        observationDate: currentDate,
        value: 148,
        unit: 'bps',
        sourceSystem: 'us-fred',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 'i1',
        assetId: null,
        market: 'US',
        seriesKey: 'inflation_pct',
        label: 'Inflation',
        frequency: 'monthly',
        observationDate: currentDate,
        value: 2.4,
        unit: '%',
        sourceSystem: 'us-bls',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      },
      {
        id: 'cc1',
        assetId: null,
        market: 'US',
        seriesKey: 'construction_cost_index',
        label: 'Construction Cost Index',
        frequency: 'monthly',
        observationDate: currentDate,
        value: 118,
        unit: 'idx',
        sourceSystem: 'us-bls',
        sourceStatus: SourceStatus.FRESH,
        sourceUpdatedAt: updatedAt,
        createdAt: updatedAt,
        updatedAt
      }
    ]
  });

  const rateMomentum = snapshot.factors.find((factor) => factor.key === 'rate_momentum_bps');
  const liquidity = snapshot.factors.find((factor) => factor.key === 'liquidity');
  const propertyDemand = snapshot.factors.find((factor) => factor.key === 'property_demand');

  assert.ok(rateMomentum);
  assert.notEqual(rateMomentum.value, null);
  assert.ok(rateMomentum.value! > 0);
  assert.equal(rateMomentum.direction, 'NEGATIVE');

  assert.ok(liquidity);
  assert.equal(liquidity.direction, 'POSITIVE');

  assert.ok(propertyDemand);
  assert.equal(propertyDemand.direction, 'POSITIVE');
  assert.equal(snapshot.market, 'US');
});

test('macro factor builder creates persistable factor rows', () => {
  const sourceUpdatedAt = new Date('2026-03-01T00:00:00.000Z');

  const rows = buildMacroFactorCreateInputs({
    market: 'KR',
    marketSnapshot: {
      id: 'market_1',
      assetId: 'asset_1',
      metroRegion: 'Seoul',
      vacancyPct: 7.1,
      colocationRatePerKwKrw: null,
      capRatePct: 6.2,
      debtCostPct: 5.4,
      inflationPct: 2.6,
      constructionCostPerMwKrw: null,
      discountRatePct: 8.9,
      marketNotes: 'Macro fallback',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt,
      createdAt: sourceUpdatedAt,
      updatedAt: sourceUpdatedAt
    },
    series: [],
    sourceSystem: 'macro-factor-engine',
    sourceStatus: SourceStatus.FRESH,
    sourceUpdatedAt
  });

  assert.ok(rows.some((row) => row.factorKey === 'rate_level'));
  assert.ok(rows.some((row) => row.factorKey === 'property_demand'));
  assert.ok(rows.every((row) => row.sourceSystem === 'macro-factor-engine'));
});

test('macro factor engine keeps missing inputs neutral and does not persist them', () => {
  const sourceUpdatedAt = new Date('2026-03-01T00:00:00.000Z');

  const snapshot = buildMacroFactorSnapshot({
    market: 'US',
    series: []
  });

  const creditStress = snapshot.factors.find((factor) => factor.key === 'credit_stress');
  const liquidity = snapshot.factors.find((factor) => factor.key === 'liquidity');
  const rateMomentum = snapshot.factors.find((factor) => factor.key === 'rate_momentum_bps');

  assert.ok(creditStress);
  assert.equal(creditStress.isObserved, false);
  assert.equal(creditStress.value, null);
  assert.equal(creditStress.direction, 'NEUTRAL');

  assert.ok(liquidity);
  assert.equal(liquidity.isObserved, false);
  assert.equal(liquidity.direction, 'NEUTRAL');

  assert.ok(rateMomentum);
  assert.equal(rateMomentum.isObserved, false);
  assert.equal(rateMomentum.direction, 'NEUTRAL');

  const rows = buildMacroFactorCreateInputs({
    market: 'US',
    series: [],
    sourceSystem: 'macro-factor-engine',
    sourceStatus: SourceStatus.FRESH,
    sourceUpdatedAt
  });

  assert.equal(rows.length, 0);
});
