import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCounterpartyRiskSummary,
  buildDealReminderSummary,
  buildPortfolioRiskSummary
} from '@/lib/services/dashboard';

test('portfolio risk summary uses latest valuation per asset and ranks risk watchlist', () => {
  const now = new Date('2026-03-23T09:00:00.000Z');

  const summary = buildPortfolioRiskSummary([
    {
      id: 'run_old',
      assetId: 'asset_1',
      createdAt: new Date('2026-03-20T09:00:00.000Z'),
      confidenceScore: 7.5,
      assumptions: {
        credit: {
          liquiditySignals: {
            refinanceRiskLevel: 'LOW',
            covenantPressureLevel: 'LOW',
            downsideDscrHaircutPct: 0
          }
        }
      },
      asset: {
        id: 'asset_1',
        name: 'Maple Office Tower',
        assetCode: 'OFF-1',
        assetClass: 'OFFICE'
      }
    },
    {
      id: 'run_new',
      assetId: 'asset_1',
      createdAt: now,
      confidenceScore: 6.8,
      assumptions: {
        credit: {
          liquiditySignals: {
            refinanceRiskLevel: 'HIGH',
            covenantPressureLevel: 'MODERATE',
            downsideDscrHaircutPct: 12.5,
            downsideValueHaircutPct: 5.5,
            weakestCurrentRatio: 0.94,
            weakestMaturityCoverage: 0.88
          }
        }
      },
      asset: {
        id: 'asset_1',
        name: 'Maple Office Tower',
        assetCode: 'OFF-1',
        assetClass: 'OFFICE'
      }
    },
    {
      id: 'run_2',
      assetId: 'asset_2',
      createdAt: now,
      confidenceScore: 7.1,
      assumptions: {
        credit: {
          liquiditySignals: {
            refinanceRiskLevel: 'MODERATE',
            covenantPressureLevel: 'LOW',
            downsideDscrHaircutPct: 4.5,
            downsideValueHaircutPct: 1.8,
            weakestCurrentRatio: 1.18,
            weakestMaturityCoverage: 1.11
          }
        }
      },
      asset: {
        id: 'asset_2',
        name: 'Harbor Logistics Hub',
        assetCode: 'IND-2',
        assetClass: 'INDUSTRIAL'
      }
    }
  ]);

  assert.equal(summary.assetCoverage, 2);
  assert.equal(summary.refinanceWatchCount, 2);
  assert.equal(summary.covenantWatchCount, 1);
  assert.equal(summary.highRiskCount, 1);
  assert.equal(summary.watchlist[0]?.runId, 'run_new');
  assert.equal(summary.watchlist[0]?.refinanceRiskLevel, 'HIGH');
  assert.equal(summary.watchlist[1]?.runId, 'run_2');
});

test('counterparty risk summary groups latest assessments by role and builds watchlist', () => {
  const now = new Date('2026-03-23T09:00:00.000Z');

  const summary = buildCounterpartyRiskSummary([
    {
      id: 'assessment_old',
      score: 74,
      riskLevel: 'LOW',
      createdAt: new Date('2026-03-20T09:00:00.000Z'),
      asset: {
        id: 'asset_1',
        name: 'Maple Office Tower',
        assetCode: 'OFF-1'
      },
      counterparty: {
        id: 'cp_1',
        name: 'Maple Sponsor',
        role: 'SPONSOR'
      }
    },
    {
      id: 'assessment_new',
      score: 41,
      riskLevel: 'HIGH',
      createdAt: now,
      asset: {
        id: 'asset_1',
        name: 'Maple Office Tower',
        assetCode: 'OFF-1'
      },
      counterparty: {
        id: 'cp_1',
        name: 'Maple Sponsor',
        role: 'SPONSOR'
      }
    },
    {
      id: 'assessment_tenant',
      score: 58,
      riskLevel: 'MODERATE',
      createdAt: now,
      asset: {
        id: 'asset_2',
        name: 'Harbor Logistics Hub',
        assetCode: 'IND-2'
      },
      counterparty: {
        id: 'cp_2',
        name: 'Blue Anchor Tenant',
        role: 'TENANT'
      }
    },
    {
      id: 'assessment_operator',
      score: 79,
      riskLevel: 'LOW',
      createdAt: now,
      asset: {
        id: 'asset_3',
        name: 'Core Data Campus',
        assetCode: 'DC-3'
      },
      counterparty: {
        id: 'cp_3',
        name: 'Core Operations',
        role: 'OPERATOR'
      }
    }
  ]);

  assert.equal(summary.coverage, 3);
  assert.equal(summary.highRiskCount, 1);
  assert.equal(summary.roleSummary.find((item) => item.role === 'SPONSOR')?.highRiskCount, 1);
  assert.equal(summary.roleSummary.find((item) => item.role === 'TENANT')?.moderateRiskCount, 1);
  assert.equal(summary.watchlist[0]?.assessmentId, 'assessment_new');
  assert.equal(summary.watchlist[1]?.counterpartyRole, 'TENANT');
});

test('portfolio risk watchlist orders equal-risk assets deterministically regardless of input order', () => {
  const makeRun = (assetCode: string, createdAt: Date) => ({
    id: `run_${assetCode}`,
    assetId: assetCode,
    createdAt,
    confidenceScore: 7,
    assumptions: {
      credit: {
        liquiditySignals: {
          refinanceRiskLevel: 'HIGH',
          covenantPressureLevel: 'LOW',
          downsideDscrHaircutPct: 0
        }
      }
    },
    asset: {
      id: assetCode,
      name: assetCode,
      assetCode,
      assetClass: 'OFFICE'
    }
  });

  const older = new Date('2026-06-01T00:00:00.000Z');
  const newer = new Date('2026-06-10T00:00:00.000Z');

  // Identical risk scores; tie-break must put the more recent run first and be
  // stable no matter how the DB returned the rows.
  const forward = buildPortfolioRiskSummary([makeRun('AAA', older), makeRun('BBB', newer)]);
  const reversed = buildPortfolioRiskSummary([makeRun('BBB', newer), makeRun('AAA', older)]);

  assert.deepEqual(
    forward.watchlist.map((item) => item.assetCode),
    ['BBB', 'AAA']
  );
  assert.deepEqual(
    reversed.watchlist.map((item) => item.assetCode),
    ['BBB', 'AAA']
  );
});

test('deal reminder summary excludes archived deals from overdue and due-soon counts', () => {
  const now = Date.now();
  const overdueAt = new Date(now - 1000 * 60 * 60 * 24);
  const dueSoonAt = new Date(now + 1000 * 60 * 60 * 24);

  const makeDeal = (overrides: Record<string, unknown>) => ({
    id: 'deal',
    dealCode: 'DEAL',
    title: 'Deal',
    stage: 'DD' as const,
    statusLabel: 'ACTIVE',
    archivedAt: null,
    updatedAt: new Date(now),
    nextAction: 'follow up',
    nextActionAt: null,
    tasks: [] as Array<{
      status: string;
      priority: string;
      dueDate: Date | null;
      checklistKey: string | null;
      isRequired: boolean;
    }>,
    counterparties: [] as Array<{ role: string }>,
    ...overrides
  });

  const summary = buildDealReminderSummary([
    makeDeal({
      id: 'active-overdue',
      statusLabel: 'ACTIVE',
      tasks: [
        {
          status: 'OPEN',
          priority: 'HIGH',
          dueDate: overdueAt,
          checklistKey: null,
          isRequired: false
        }
      ]
    }),
    makeDeal({
      id: 'archived-overdue',
      statusLabel: 'ARCHIVED',
      tasks: [
        {
          status: 'OPEN',
          priority: 'HIGH',
          dueDate: overdueAt,
          checklistKey: null,
          isRequired: false
        }
      ]
    }),
    makeDeal({
      id: 'archived-due-soon',
      statusLabel: 'ARCHIVED',
      tasks: [
        {
          status: 'OPEN',
          priority: 'LOW',
          dueDate: dueSoonAt,
          checklistKey: null,
          isRequired: false
        }
      ]
    })
  ]);

  // Only the active deal should count toward open-action counters; the archived
  // deals are surfaced solely under archivedDeals and never in the reminders feed.
  assert.equal(summary.overdueDeals, 1);
  assert.equal(summary.dueSoonDeals, 0);
  assert.equal(summary.archivedDeals, 2);
  assert.equal(summary.reminders.length, 1);
  assert.equal(summary.reminders[0]?.id, 'active-overdue');
});
