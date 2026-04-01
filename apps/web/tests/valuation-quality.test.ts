import assert from 'node:assert/strict';
import test from 'node:test';
import { buildValuationQualitySummary } from '@/lib/valuation-quality';

test('valuation quality summary flags missing core inputs and exposes active feature sources', () => {
  const summary = buildValuationQualitySummary(
    {
      leases: [{ reviewStatus: 'PENDING' }],
      capexLineItems: [{}, {}],
      comparableSet: { entries: [{}, {}] },
      energySnapshot: { tariffKrwPerKwh: 158, pueTarget: null, reviewStatus: 'PENDING' },
      permitSnapshot: { powerApprovalStatus: '', reviewStatus: 'PENDING' },
      ownershipRecords: [],
      encumbranceRecords: [],
      planningConstraints: [{ reviewStatus: 'PENDING' }]
    },
    {
      documentFeatures: {
        sourceVersion: 'document:doc_1:v3'
      },
      curatedFeatures: {
        marketInputs: {
          sourceVersion: 'marketSnapshot:2026-03-22T00:00:00.000Z'
        },
        satelliteRisk: {
          sourceVersion: null
        },
        permitInputs: {
          sourceVersion: null
        },
        powerMicro: {
          sourceVersion: 'energySnapshot:2026-03-22T00:00:00.000Z'
        },
        revenueMicro: {
          sourceVersion: null
        },
        legalMicro: {
          sourceVersion: null
        },
        reviewReadiness: {
          sourceVersion: null
        }
      }
    },
    [
      { field: 'capRatePct', sourceSystem: 'market_feature_snapshot', value: 6.4, mode: 'manual', freshnessLabel: 'market' },
      { field: 'wildfireRiskScore', sourceSystem: 'satellite_feature_snapshot', value: 2.1, mode: 'api', freshnessLabel: 'satellite' },
      { field: 'powerFeatureSnapshot', sourceSystem: 'power_feature_snapshot', value: null, mode: 'fallback', freshnessLabel: 'not applied' }
    ]
  );

  assert.equal(summary.coverage.find((item) => item.key === 'lease')?.status, 'warn');
  assert.equal(summary.coverage.find((item) => item.key === 'power')?.status, 'warn');
  assert.equal(summary.coverage.find((item) => item.key === 'comparable')?.status, 'warn');
  assert.ok(summary.missingInputs.some((item) => item.includes('lease row')));
  assert.ok(summary.missingInputs.some((item) => item.includes('three comparable')));
  assert.equal(summary.approvedEvidenceCount, 0);
  assert.equal(summary.pendingEvidenceCount, 4);
  assert.deepEqual(
    summary.featureSources.map((item) => item.namespace),
    ['document_facts', 'market_inputs', 'power_micro']
  );
  assert.equal(summary.sourceStats.apiCount, 1);
  assert.equal(summary.sourceStats.manualCount, 1);
  assert.equal(summary.sourceStats.fallbackCount, 1);
});
