import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, CovenantStatus, PortfolioAssetStatus, SourceStatus } from '@prisma/client';

import {
  buildPortfolioOptimizationLab,
  buildPortfolioOptimizationWorkspaceItem
} from '@/lib/services/portfolio-optimization';

// ---------------------------------------------------------------------------
// (C) Honest labeling proof. buildObjective is a self-HHI concentration-penalty
// screening heuristic, NOT mean-variance. The lab now carries an explicit
// honesty signal (isHeuristicScreen + methodology) so objectiveScorePct cannot
// be mistaken for a risk-optimized result. The legacy fields are UNCHANGED.
// ---------------------------------------------------------------------------

function asset(id: string, assetClass: AssetClass, freshness: SourceStatus, occupancyPct: number) {
  return {
    id: `pa-${id}`,
    status: PortfolioAssetStatus.ACTIVE,
    currentHoldValueKrw: 300_000_000_000,
    acquisitionCostKrw: 290_000_000_000,
    asset: {
      id: `asset-${id}`,
      name: `Asset ${id}`,
      assetCode: `A-${id}`,
      assetClass,
      market: 'KR',
      address: { city: 'Seoul' },
      researchSnapshots: [
        {
          title: 'thesis',
          sourceSystem: 'research-market-aggregate',
          freshnessStatus: freshness,
          freshnessLabel: 'as of March 2026',
          snapshotDate: new Date('2026-03-31'),
          metrics: null
        }
      ],
      coverageTasks: [],
      siteProfile: { districtName: 'Seoul' },
      buildingSnapshot: null,
      marketSnapshot: { metroRegion: 'Seoul', vacancyPct: 7 },
      marketIndicatorSeries: [],
      transactionComps: [],
      rentComps: [],
      macroFactors: [],
      documents: [],
      valuations: [{ id: `val-${id}`, baseCaseValueKrw: 305_000_000_000 }],
      leases: [],
      ownershipRecords: [],
      encumbranceRecords: [],
      planningConstraints: [],
      debtFacilities: [],
      taxAssumption: null,
      readinessProject: { onchainRecords: [] }
    },
    monthlyKpis: [
      {
        periodStart: new Date('2026-01-01'),
        occupancyPct,
        passingRentKrwPerSqmMonth: 41000,
        marketRentKrwPerSqmMonth: 44000,
        debtServiceCoverage: 1.4,
        ltvPct: 51
      }
    ],
    leaseRollSnapshots: [
      { asOfDate: new Date('2026-01-01'), next12MonthsExpiringPct: 11, next24MonthsExpiringPct: 26 }
    ],
    covenantTests: [
      { testName: 'DSCR', status: CovenantStatus.PASS, asOfDate: new Date('2026-01-31') }
    ],
    exitCases: []
  };
}

function portfolio() {
  return {
    id: 'portfolio-opt',
    code: 'KR-CORE-I',
    name: 'Korea Core Portfolio',
    market: 'KR',
    assets: [
      asset('office', AssetClass.OFFICE, SourceStatus.FRESH, 94),
      asset('dc', AssetClass.DATA_CENTER, SourceStatus.STALE, 72)
    ]
  } as never;
}

test('lab carries an explicit isHeuristicScreen honesty flag', () => {
  const lab = buildPortfolioOptimizationLab(portfolio());
  assert.equal(lab.isHeuristicScreen, true);
});

test('lab.methodology states it is NOT mean-variance and names the self-HHI penalty', () => {
  const lab = buildPortfolioOptimizationLab(portfolio());
  assert.match(lab.methodology, /NOT mean-variance/i);
  assert.match(lab.methodology, /HHI/);
  // No false claim of covariance / efficient frontier — it explicitly denies them.
  assert.match(lab.methodology, /no covariance/i);
  assert.match(lab.methodology, /no efficient frontier/i);
});

test('legacy fields are UNCHANGED (purely additive honesty signal)', () => {
  const lab = buildPortfolioOptimizationLab(portfolio());
  // methodologyLabel and objectiveScorePct keep their original shape/semantics.
  assert.equal(lab.methodologyLabel, 'Allocation screening heuristic');
  assert.equal(typeof lab.objectiveScorePct, 'number');
  assert.ok(lab.objectiveScorePct >= 15 && lab.objectiveScorePct <= 95);
  // The descriptive summary still flags this is not a risk-model optimization.
  assert.match(lab.summary, /not a returns\/covariance\/risk-model optimization/i);
});

test('the workspace item propagates the same honesty signal', () => {
  const item = buildPortfolioOptimizationWorkspaceItem(portfolio());
  assert.equal(item.isHeuristicScreen, true);
  assert.match(item.methodology, /NOT mean-variance/i);
  assert.equal(item.methodologyLabel, 'Allocation screening heuristic');
});
