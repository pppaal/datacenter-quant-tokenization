import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterValuationFeatureSnapshots,
  getValuationFeatureSourceDescriptors
} from '@/lib/valuation/feature-snapshot-usage';

test('valuation feature source descriptors collect promoted feature source versions in display order', () => {
  const descriptors = getValuationFeatureSourceDescriptors({
    documentFeatures: {
      sourceVersion: 'document:doc_1:v3'
    },
    curatedFeatures: {
      marketInputs: {
        sourceVersion: 'marketSnapshot:2026-03-22T00:00:00.000Z'
      },
      satelliteRisk: {
        sourceVersion: 'siteProfile:2026-03-22T00:00:00.000Z'
      },
      permitInputs: {
        sourceVersion: null
      },
      powerMicro: {
        sourceVersion: 'energySnapshot:2026-03-22T00:00:00.000Z'
      },
      revenueMicro: {
        sourceVersion: 'lease:2026-03-22T00:00:00.000Z'
      },
      legalMicro: {
        sourceVersion: 'legal:2026-03-22T00:00:00.000Z'
      },
      reviewReadiness: {
        sourceVersion: 'readiness:2026-03-22T00:00:00.000Z'
      }
    }
  });

  assert.deepEqual(
    descriptors.map((descriptor) => descriptor.namespace),
    [
      'document_facts',
      'market_inputs',
      'satellite_risk',
      'power_micro',
      'revenue_micro',
      'legal_micro',
      'readiness_legal'
    ]
  );
  assert.equal(descriptors[0]?.label, 'Document Facts');
  assert.equal(descriptors[2]?.sourceVersion, 'siteProfile:2026-03-22T00:00:00.000Z');
  assert.equal(descriptors[4]?.label, 'Revenue Micro');
});

test('valuation feature snapshot filter returns only snapshots used by the run', () => {
  const snapshots = [
    {
      id: 'snapshot_market',
      featureNamespace: 'market_inputs',
      sourceVersion: 'marketSnapshot:2026-03-22T00:00:00.000Z'
    },
    {
      id: 'snapshot_document',
      featureNamespace: 'document_facts',
      sourceVersion: 'document:doc_1:v3'
    },
    {
      id: 'snapshot_satellite',
      featureNamespace: 'satellite_risk',
      sourceVersion: 'siteProfile:2026-03-22T00:00:00.000Z'
    },
    {
      id: 'snapshot_unused',
      featureNamespace: 'permit_inputs',
      sourceVersion: 'permitSnapshot:2026-03-01T00:00:00.000Z'
    },
    {
      id: 'snapshot_power',
      featureNamespace: 'power_micro',
      sourceVersion: 'energySnapshot:2026-03-22T00:00:00.000Z'
    },
    {
      id: 'snapshot_legal',
      featureNamespace: 'legal_micro',
      sourceVersion: 'legal:2026-03-22T00:00:00.000Z'
    }
  ];

  const filtered = filterValuationFeatureSnapshots(snapshots, {
    documentFeatures: {
      sourceVersion: 'document:doc_1:v3'
    },
    curatedFeatures: {
      marketInputs: {
        sourceVersion: 'marketSnapshot:2026-03-22T00:00:00.000Z'
      },
      satelliteRisk: {
        sourceVersion: 'siteProfile:2026-03-22T00:00:00.000Z'
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
        sourceVersion: 'legal:2026-03-22T00:00:00.000Z'
      },
      reviewReadiness: {
        sourceVersion: null
      }
    }
  });

  assert.deepEqual(
    filtered.map((snapshot) => snapshot.id),
    [
      'snapshot_document',
      'snapshot_market',
      'snapshot_satellite',
      'snapshot_power',
      'snapshot_legal'
    ]
  );
});
