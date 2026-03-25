import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCounterpartyRiskSummary, buildPortfolioRiskSummary } from '@/lib/services/dashboard';

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
