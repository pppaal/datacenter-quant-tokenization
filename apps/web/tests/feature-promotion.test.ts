import assert from 'node:assert/strict';
import test from 'node:test';
import { promoteDocumentFactsToFeatures } from '@/lib/services/feature-promotion';

test('feature promotion creates a document_facts snapshot from extracted facts', async () => {
  let createdSnapshot: any;

  const result = await promoteDocumentFactsToFeatures('version_1', {
    documentVersion: {
      async findUnique() {
        return {
          id: 'version_1',
          versionNumber: 1,
          documentId: 'document_1',
          document: {
            id: 'document_1',
            assetId: 'asset_1'
          },
          facts: [
            {
              id: 'fact_1',
              factType: 'capacity',
              factKey: 'contracted_kw',
              factValueNumber: 12000,
              factValueText: null,
              unit: 'kW'
            },
            {
              id: 'fact_2',
              factType: 'metric',
              factKey: 'occupancy_pct',
              factValueNumber: 78,
              factValueText: null,
              unit: 'pct'
            },
            {
              id: 'fact_3',
              factType: 'permit',
              factKey: 'permit_status_note',
              factValueNumber: null,
              factValueText: 'Power approval status remains pending.',
              unit: null
            }
          ]
        };
      }
    },
    assetFeatureSnapshot: {
      async create(args: any) {
        createdSnapshot = args;
        return {
          id: 'snapshot_1',
          assetId: args.data.assetId,
          values: args.data.values.create
        };
      }
    }
  } as any);

  assert.equal(result?.snapshotId, 'snapshot_1');
  assert.equal(result?.valueCount, 3);
  assert.equal(createdSnapshot.data.featureNamespace, 'document_facts');
  assert.equal(createdSnapshot.data.sourceVersion, 'document:document_1:v1');
  assert.ok(createdSnapshot.data.values.create.some((value: any) => value.key === 'document.contracted_kw'));
});
