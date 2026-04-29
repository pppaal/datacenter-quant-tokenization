import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import type { UnderwritingAnalysis, UnderwritingBundle } from '@/lib/services/valuation/types';

test('credit overlay reduces confidence and adds diligence when a counterparty screens high risk', () => {
  const now = new Date();
  const analysis: UnderwritingAnalysis = {
    asset: {
      name: 'Sample Asset',
      assetCode: 'ASSET-1',
      assetClass: 'OFFICE',
      stage: 'STABILIZED',
      market: 'KR'
    },
    baseCaseValueKrw: 100000000000,
    confidenceScore: 7.4,
    underwritingMemo: '',
    keyRisks: ['Base leasing risk'],
    ddChecklist: ['Base diligence item'],
    assumptions: {},
    provenance: [],
    scenarios: [
      {
        name: 'Bull',
        valuationKrw: 112000000000,
        impliedYieldPct: 5.8,
        exitCapRatePct: 5.1,
        debtServiceCoverage: 1.55,
        notes: 'Bull case',
        scenarioOrder: 0
      },
      {
        name: 'Base',
        valuationKrw: 100000000000,
        impliedYieldPct: 5.5,
        exitCapRatePct: 5.4,
        debtServiceCoverage: 1.32,
        notes: 'Base case',
        scenarioOrder: 1
      },
      {
        name: 'Bear',
        valuationKrw: 89000000000,
        impliedYieldPct: 5.9,
        exitCapRatePct: 6,
        debtServiceCoverage: 1.08,
        notes: 'Bear case',
        scenarioOrder: 2
      }
    ]
  };

  const bundle: UnderwritingBundle = {
    asset: {} as any,
    address: null,
    siteProfile: null,
    buildingSnapshot: null,
    permitSnapshot: null,
    energySnapshot: null,
    marketSnapshot: null,
    creditAssessments: [
      {
        id: 'credit_1',
        assetId: 'asset_1',
        counterpartyId: 'cp_1',
        financialStatementId: 'fs_1',
        documentVersionId: null,
        assessmentType: 'SPONSOR_CREDIT',
        score: 41,
        riskLevel: 'HIGH',
        summary: 'Weak sponsor credit.',
        metrics: {
          currentRatio: 0.92,
          currentMaturityCoverage: 0.86,
          operatingCashFlowToDebtRatio: 0.05,
          cashToDebtRatio: 0.06
        },
        createdAt: now,
        updatedAt: now,
        counterparty: {
          id: 'cp_1',
          assetId: 'asset_1',
          dealId: null,
          name: 'Han River Sponsor',
          role: 'SPONSOR',
          shortName: null,
          company: null,
          email: null,
          phone: null,
          coverageOwner: null,
          coverageStatus: 'PASSIVE',
          lastContactAt: null,
          notes: null,
          createdAt: now,
          updatedAt: now
        },
        financialStatement: {
          id: 'fs_1',
          assetId: 'asset_1',
          counterpartyId: 'cp_1',
          documentVersionId: null,
          statementType: 'ANNUAL',
          fiscalYear: 2024,
          fiscalPeriod: 'FY',
          periodEndDate: null,
          currency: 'KRW',
          sourceCurrency: null,
          fxRateToKrw: null,
          fxAsOf: null,
          provenanceSystem: null,
          revenueKrw: 100,
          ebitdaKrw: 20,
          cashKrw: 5,
          totalDebtKrw: 80,
          totalAssetsKrw: 120,
          totalEquityKrw: 15,
          interestExpenseKrw: 8,
          createdAt: now,
          updatedAt: now
        }
      }
    ]
  };

  const adjusted = applyCreditOverlay(analysis, bundle);

  assert.ok(adjusted.confidenceScore < analysis.confidenceScore);
  assert.ok(adjusted.keyRisks.some((risk) => risk.includes('Han River Sponsor')));
  assert.ok(adjusted.ddChecklist.some((item) => item.toLowerCase().includes('liquidity')));
  assert.equal((adjusted.assumptions as any).credit.riskMix.high, 1);
  assert.equal((adjusted.assumptions as any).credit.liquiditySignals.refinanceRiskLevel, 'HIGH');
  assert.ok((adjusted.assumptions as any).credit.liquiditySignals.downsideDscrHaircutPct > 0);
  assert.ok(adjusted.keyRisks.some((risk) => risk.toLowerCase().includes('refinance')));
  assert.ok(adjusted.ddChecklist.some((item) => item.toLowerCase().includes('covenant')));
  const adjustedBear = adjusted.scenarios.find((scenario) => scenario.name === 'Bear');
  assert.ok(adjustedBear);
  assert.ok((adjustedBear?.debtServiceCoverage ?? 99) < 1.08);
});
