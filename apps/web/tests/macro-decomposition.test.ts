import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, SourceStatus } from '@prisma/client';
import { buildMacroDecomposition } from '@/lib/services/macro/decomposition';
import { buildMacroRegimeAnalysis } from '@/lib/services/macro/regime';

test('macro decomposition compares current and previous regime shifts', () => {
  const previousRegime = buildMacroRegimeAnalysis({
    assetClass: AssetClass.OFFICE,
    market: 'US',
    country: 'US',
    submarket: 'Manhattan',
    marketSnapshot: {
      id: 'market_prev',
      assetId: 'asset_1',
      metroRegion: 'Manhattan',
      vacancyPct: 7.2,
      colocationRatePerKwKrw: null,
      capRatePct: 5.1,
      debtCostPct: 4.4,
      inflationPct: 2.2,
      constructionCostPerMwKrw: null,
      discountRatePct: 6.8,
      marketNotes: 'Earlier snapshot',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date('2026-02-15T00:00:00.000Z'),
      createdAt: new Date('2026-02-15T00:00:00.000Z'),
      updatedAt: new Date('2026-02-15T00:00:00.000Z')
    }
  });

  const currentRegime = buildMacroRegimeAnalysis({
    assetClass: AssetClass.OFFICE,
    market: 'US',
    country: 'US',
    submarket: 'Manhattan',
    marketSnapshot: {
      id: 'market_now',
      assetId: 'asset_1',
      metroRegion: 'Manhattan',
      vacancyPct: 9.6,
      colocationRatePerKwKrw: null,
      capRatePct: 5.8,
      debtCostPct: 5.4,
      inflationPct: 3.1,
      constructionCostPerMwKrw: null,
      discountRatePct: 7.7,
      marketNotes: 'Current snapshot',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date('2026-03-15T00:00:00.000Z'),
      createdAt: new Date('2026-03-15T00:00:00.000Z'),
      updatedAt: new Date('2026-03-15T00:00:00.000Z')
    }
  });

  const decomposition = buildMacroDecomposition('run_current', currentRegime, [
    {
      id: 'run_current',
      runLabel: 'Current',
      createdAt: new Date('2026-03-15T00:00:00.000Z'),
      assumptions: {
        macroRegime: currentRegime
      }
    },
    {
      id: 'run_previous',
      runLabel: 'Previous',
      createdAt: new Date('2026-02-15T00:00:00.000Z'),
      assumptions: {
        macroRegime: previousRegime
      }
    }
  ]);

  assert.ok(decomposition);
  assert.equal(decomposition.previousRunLabel, 'Previous');
  assert.ok(decomposition.guidanceChanges.some((item) => item.delta !== null && Math.abs(item.delta) > 0));
  assert.ok(decomposition.impactChanges.some((item) => item.delta !== null && Math.abs(item.delta) > 0));
  assert.ok(decomposition.factorDrivers.length > 0);
});

test('macro decomposition tolerates legacy macro regime payloads without guidance', () => {
  const currentRegime = buildMacroRegimeAnalysis({
    assetClass: AssetClass.OFFICE,
    market: 'US',
    country: 'US',
    submarket: 'Manhattan',
    marketSnapshot: {
      id: 'market_legacy',
      assetId: 'asset_1',
      metroRegion: 'Manhattan',
      vacancyPct: 8.4,
      colocationRatePerKwKrw: null,
      capRatePct: 5.4,
      debtCostPct: 4.9,
      inflationPct: 2.7,
      constructionCostPerMwKrw: null,
      discountRatePct: 7.1,
      marketNotes: 'Legacy-safe snapshot',
      sourceStatus: SourceStatus.FRESH,
      sourceUpdatedAt: new Date('2026-03-20T00:00:00.000Z'),
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      updatedAt: new Date('2026-03-20T00:00:00.000Z')
    }
  });

  const legacyRegime = {
    ...currentRegime,
    guidance: undefined
  };

  const decomposition = buildMacroDecomposition('run_current', legacyRegime as any, [
    {
      id: 'run_current',
      runLabel: 'Current',
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      assumptions: {
        macroRegime: legacyRegime
      }
    }
  ]);

  assert.ok(decomposition);
  assert.equal(decomposition.guidanceChanges.every((item) => item.currentValue === null), true);
  assert.equal(decomposition.summary[0], 'No prior guidance baseline available yet.');
});
