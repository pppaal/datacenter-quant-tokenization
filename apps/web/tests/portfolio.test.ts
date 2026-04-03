import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass, CovenantStatus, PortfolioAssetStatus } from '@prisma/client';
import {
  buildCovenantStatusSummary,
  buildPortfolioDashboard,
  buildPortfolioOperatorBriefs
} from '@/lib/services/portfolio';

test('buildCovenantStatusSummary groups latest covenant outcomes', () => {
  const summary = buildCovenantStatusSummary([
    {
      id: 'old-pass',
      testName: 'DSCR',
      status: CovenantStatus.PASS,
      asOfDate: new Date('2025-12-31')
    },
    {
      id: 'latest-watch',
      testName: 'DSCR',
      status: CovenantStatus.WATCH,
      asOfDate: new Date('2026-01-31')
    },
    {
      id: 'ltv-breach',
      testName: 'LTV',
      status: CovenantStatus.BREACH,
      asOfDate: new Date('2026-01-31')
    }
  ] as any);

  assert.equal(summary.items.length, 2);
  assert.equal(summary.watchCount, 1);
  assert.equal(summary.breachCount, 1);
});

test('buildPortfolioDashboard aggregates hold KPIs, rollover watchlist, debt wall, and exit cases', () => {
  const dashboard = buildPortfolioDashboard({
    id: 'portfolio-1',
    code: 'KR-INCOME-I',
    name: 'Korea Income Portfolio',
    market: 'KR',
    assets: [
      {
        id: 'pa-office',
        status: PortfolioAssetStatus.ACTIVE,
        currentHoldValueKrw: 320_000_000_000,
        acquisitionCostKrw: 300_000_000_000,
        asset: {
          id: 'asset-office',
          name: 'Yeouido Core Office Tower',
          assetCode: 'SEOUL-YEOUIDO-01',
          assetClass: AssetClass.OFFICE,
          market: 'KR',
          address: { city: 'Seoul' },
          valuations: [{ baseCaseValueKrw: 330_000_000_000, createdAt: new Date('2026-03-01') }],
          leases: [],
          debtFacilities: [
            {
              id: 'debt-office',
              lenderName: 'Office Bank',
              facilityType: 'TERM',
              commitmentKrw: 150_000_000_000,
              createdAt: new Date('2025-01-01'),
              amortizationTermMonths: 60,
              draws: []
            }
          ],
          documents: [{ documentHash: 'office-doc-hash' }],
          readinessProject: { onchainRecords: [{ txHash: '0xabc' }] },
          energySnapshot: null,
          permitSnapshot: null,
          ownershipRecords: [],
          encumbranceRecords: [],
          planningConstraints: [],
          marketSnapshot: null,
          macroFactors: [],
          transactionComps: [],
          rentComps: [],
          pipelineProjects: [],
          marketIndicatorSeries: [],
          featureSnapshots: []
        },
        businessPlans: [],
        monthlyKpis: [
          {
            periodStart: new Date('2026-01-01'),
            occupancyPct: 93,
            leasedAreaSqm: 34000,
            passingRentKrwPerSqmMonth: 40000,
            marketRentKrwPerSqmMonth: 43000,
            effectiveRentKrwPerSqmMonth: 39500,
            noiKrw: 1_800_000_000,
            debtServiceCoverage: 1.45,
            ltvPct: 48
          },
          {
            periodStart: new Date('2025-12-01'),
            occupancyPct: 92.5,
            leasedAreaSqm: 33800,
            passingRentKrwPerSqmMonth: 39800,
            marketRentKrwPerSqmMonth: 42800,
            effectiveRentKrwPerSqmMonth: 39200,
            noiKrw: 1_770_000_000,
            debtServiceCoverage: 1.42,
            ltvPct: 48.5
          }
        ],
        leaseRollSnapshots: [
          {
            asOfDate: new Date('2026-01-01'),
            next12MonthsExpiringPct: 12,
            next24MonthsExpiringPct: 28,
            watchlistSummary: 'Normal office rollover profile'
          }
        ],
        budgets: [
          {
            lineItems: [
              { annualBudgetKrw: 22_000_000_000, ytdActualKrw: 1_800_000_000, varianceKrw: -100_000_000 }
            ]
          }
        ],
        capexProjects: [{ approvedBudgetKrw: 1_500_000_000, spentToDateKrw: 500_000_000 }],
        covenantTests: [{ testName: 'DSCR', status: CovenantStatus.PASS, asOfDate: new Date('2026-01-31') }],
        exitCases: [{ id: 'exit-office', targetExitDate: new Date('2027-09-30'), statusLabel: 'ACTIVE' }]
      },
      {
        id: 'pa-dc',
        status: PortfolioAssetStatus.WATCHLIST,
        currentHoldValueKrw: 295_000_000_000,
        acquisitionCostKrw: 286_000_000_000,
        asset: {
          id: 'asset-dc',
          name: 'Seoul Hyperscale Campus I',
          assetCode: 'SEOUL-GANGSEO-01',
          assetClass: AssetClass.DATA_CENTER,
          market: 'KR',
          address: { city: 'Seoul' },
          valuations: [{ baseCaseValueKrw: 301_000_000_000, createdAt: new Date('2026-03-10') }],
          leases: [],
          debtFacilities: [
            {
              id: 'debt-dc',
              lenderName: 'Infra Bank',
              facilityType: 'CONSTRUCTION',
              commitmentKrw: 98_000_000_000,
              createdAt: new Date('2025-06-01'),
              amortizationTermMonths: 84,
              draws: []
            }
          ],
          documents: [{ documentHash: 'dc-doc-hash' }],
          readinessProject: { onchainRecords: [] },
          energySnapshot: null,
          permitSnapshot: null,
          ownershipRecords: [],
          encumbranceRecords: [],
          planningConstraints: [],
          marketSnapshot: null,
          macroFactors: [],
          transactionComps: [],
          rentComps: [],
          pipelineProjects: [],
          marketIndicatorSeries: [],
          featureSnapshots: []
        },
        businessPlans: [],
        monthlyKpis: [
          {
            periodStart: new Date('2026-01-01'),
            occupancyPct: 71,
            leasedAreaSqm: 52000,
            passingRentKrwPerSqmMonth: 225000,
            marketRentKrwPerSqmMonth: 228000,
            effectiveRentKrwPerSqmMonth: 218000,
            noiKrw: 2_610_000_000,
            debtServiceCoverage: 1.23,
            ltvPct: 60.4
          }
        ],
        leaseRollSnapshots: [
          {
            asOfDate: new Date('2026-01-01'),
            next12MonthsExpiringPct: 22,
            next24MonthsExpiringPct: 39,
            watchlistSummary: 'AI pod remains unsigned'
          }
        ],
        budgets: [
          {
            lineItems: [
              { annualBudgetKrw: 31_500_000_000, ytdActualKrw: 2_610_000_000, varianceKrw: -140_000_000 }
            ]
          }
        ],
        capexProjects: [{ approvedBudgetKrw: 2_600_000_000, spentToDateKrw: 1_440_000_000 }],
        covenantTests: [{ testName: 'DSCR', status: CovenantStatus.WATCH, asOfDate: new Date('2026-01-31') }],
        exitCases: [{ id: 'exit-dc', targetExitDate: new Date('2028-06-30'), statusLabel: 'ACTIVE' }]
      }
    ]
  } as any);

  assert.equal(dashboard.summary.assetCount, 2);
  assert.equal(dashboard.summary.watchlistCount, 1);
  assert.equal(dashboard.summary.grossHoldValueKrw, 615_000_000_000);
  assert.ok((dashboard.summary.averageOccupancyPct ?? 0) > 80);
  assert.equal(dashboard.leaseRolloverWatchlist[0].portfolioAsset.asset.name, 'Seoul Hyperscale Campus I');
  assert.equal(dashboard.debtMaturityWall.length, 2);
  assert.equal(dashboard.exitCaseTracker.length, 2);
  assert.ok(dashboard.operatorSummary.includes('Korea Income Portfolio'));
});

test('buildPortfolioOperatorBriefs produces operator-facing research and watchlist narrative', () => {
  const portfolio = {
    id: 'portfolio-1',
    code: 'KR-INCOME-I',
    name: 'Korea Income Portfolio',
    market: 'KR',
    assets: [
      {
        id: 'pa-office',
        status: PortfolioAssetStatus.WATCHLIST,
        currentHoldValueKrw: 320_000_000_000,
        acquisitionCostKrw: 300_000_000_000,
        asset: {
          id: 'asset-office',
          name: 'Yeouido Core Office Tower',
          assetCode: 'SEOUL-YEOUIDO-01',
          assetClass: AssetClass.OFFICE,
          market: 'KR',
          address: { city: 'Seoul' },
          valuations: [{ baseCaseValueKrw: 330_000_000_000, createdAt: new Date('2026-03-01') }],
          leases: [],
          debtFacilities: [],
          documents: [],
          readinessProject: { onchainRecords: [] },
          energySnapshot: null,
          permitSnapshot: null,
          siteProfile: { districtName: 'Yeouido' },
          buildingSnapshot: null,
          ownershipRecords: [],
          encumbranceRecords: [],
          planningConstraints: [],
          marketSnapshot: {
            metroRegion: 'Seoul CBD',
            rentGrowthPct: 3.2,
            vacancyPct: 8.1
          },
          taxAssumption: null,
          macroFactors: [],
          transactionComps: [],
          rentComps: [],
          pipelineProjects: [],
          marketIndicatorSeries: [
            {
              id: 'indicator-1',
              indicatorKey: 'office.vacancy_pct',
              label: 'Office Vacancy',
              value: 7.1,
              observationDate: new Date('2026-03-01')
            }
          ],
          featureSnapshots: []
        },
        businessPlans: [],
        monthlyKpis: [
          {
            periodStart: new Date('2026-01-01'),
            occupancyPct: 91,
            leasedAreaSqm: 34000,
            passingRentKrwPerSqmMonth: 40000,
            marketRentKrwPerSqmMonth: 43000,
            effectiveRentKrwPerSqmMonth: 39500,
            noiKrw: 1_800_000_000,
            debtServiceCoverage: 1.18,
            ltvPct: 56
          }
        ],
        leaseRollSnapshots: [
          {
            asOfDate: new Date('2026-01-01'),
            next12MonthsExpiringPct: 24,
            next24MonthsExpiringPct: 31,
            watchlistSummary: 'Rollover concentration in the next 12 months'
          }
        ],
        budgets: [{ lineItems: [{ annualBudgetKrw: 1_000_000_000, ytdActualKrw: 600_000_000, varianceKrw: 50_000_000 }] }],
        capexProjects: [{ approvedBudgetKrw: 800_000_000, spentToDateKrw: 550_000_000 }],
        covenantTests: [{ testName: 'DSCR', status: CovenantStatus.WATCH, asOfDate: new Date('2026-01-31') }],
        exitCases: [{ id: 'exit-office', targetExitDate: new Date('2027-09-30'), statusLabel: 'ACTIVE' }]
      }
    ]
  } as any;

  const dashboard = buildPortfolioDashboard(portfolio);
  const briefs = buildPortfolioOperatorBriefs(portfolio, dashboard);

  assert.ok(briefs.researchBrief.includes('Korea Income Portfolio'));
  assert.ok(briefs.covenantBrief.includes('Yeouido Core Office Tower'));
  assert.ok(briefs.watchlistBrief.includes('24.0%'));
  assert.ok(briefs.capexBrief.includes('Yeouido Core Office Tower'));
  assert.ok(briefs.researchBrief.includes('Office Vacancy 7.1%'));
});
