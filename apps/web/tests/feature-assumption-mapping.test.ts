import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFeatureAssumptionMappings } from '@/lib/valuation/feature-assumption-mapping';

test('feature assumption mapping resolves feature values to assumptions and provenance fields', () => {
  const rows = buildFeatureAssumptionMappings(
    [
      {
        id: 'snapshot_document',
        featureNamespace: 'document_facts',
        sourceVersion: 'document:doc_1:v2',
        values: [
          {
            id: 'value_document_cap_rate',
            key: 'document.cap_rate_pct',
            numberValue: 6.2,
            textValue: null,
            unit: 'pct'
          }
        ]
      },
      {
        id: 'snapshot_satellite',
        featureNamespace: 'satellite_risk',
        sourceVersion: 'siteProfile:2026-03-22T00:00:00.000Z',
        values: [
          {
            id: 'value_satellite_wildfire',
            key: 'satellite.wildfire_risk_score',
            numberValue: 2.4,
            textValue: null,
            unit: 'score'
          }
        ]
      },
      {
        id: 'snapshot_power',
        featureNamespace: 'power_micro',
        sourceVersion: 'energySnapshot:2026-03-22T00:00:00.000Z',
        values: [
          {
            id: 'value_power_tariff',
            key: 'power.tariff_krw_per_kwh',
            numberValue: 158,
            textValue: null,
            unit: 'KRW'
          }
        ]
      }
    ],
    {
      documentFeatures: {
        capRatePct: 6.2
      },
      metrics: {
        capRatePct: 6.35,
        powerPriceKrwPerKwh: 158,
        wildfirePenalty: 0.976
      },
      curatedFeatures: {
        powerMicro: {
          tariffKrwPerKwh: 158
        },
        satelliteRisk: {
          wildfireRiskScore: 2.4
        }
      },
      satelliteRisk: {
        wildfireRiskScore: 2.4
      }
    },
    [
      {
        field: 'capRatePct',
        sourceSystem: 'market_feature_snapshot',
        value: 6.35,
        mode: 'manual',
        freshnessLabel: 'marketSnapshot:2026-03-22T00:00:00.000Z'
      },
      {
        field: 'wildfireRiskScore',
        sourceSystem: 'satellite_feature_snapshot',
        value: 2.4,
        mode: 'api',
        freshnessLabel: 'siteProfile:2026-03-22T00:00:00.000Z'
      }
    ]
  );

  const targetPaths = rows.map((row) => row.targetPath);

  assert.deepEqual(targetPaths, [
    'documentFeatures.capRatePct',
    'metrics.capRatePct',
    'capRatePct',
    'curatedFeatures.satelliteRisk.wildfireRiskScore',
    'satelliteRisk.wildfireRiskScore',
    'metrics.wildfirePenalty',
    'wildfireRiskScore',
    'curatedFeatures.powerMicro.tariffKrwPerKwh',
    'metrics.powerPriceKrwPerKwh'
  ]);
  assert.equal(rows[1]?.appliedValue, '6.35%');
  assert.equal(rows[5]?.appliedValue, '0.976');
  assert.equal(rows[6]?.mode, 'api');
  assert.equal(rows[8]?.appliedValue, '₩158');
});
