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
  assert.ok(
    createdSnapshot.data.values.create.some((value: any) => value.key === 'document.contracted_kw')
  );
});

test('feature promotion keeps the numeric value when a longer text fact shares the key', async () => {
  // Two facts promote to the SAME feature key (document.cap_rate_pct): one
  // carries the numeric cap rate, the other is a longer free-text restatement.
  // The numeric value is the promotable signal and must survive dedup — it must
  // not be clobbered just because the text-only candidate has a longer string.
  let createdSnapshot: any;

  await promoteDocumentFactsToFeatures('version_2', {
    documentVersion: {
      async findUnique() {
        return {
          id: 'version_2',
          versionNumber: 1,
          documentId: 'document_2',
          document: { id: 'document_2', assetId: 'asset_2' },
          // Ordered as the service orders facts: confidence desc → the numeric
          // fact (higher confidence) is seen first, the long text fact second.
          facts: [
            {
              id: 'fact_num',
              factType: 'metric',
              factKey: 'cap_rate_pct',
              factValueNumber: 5.5,
              factValueText: null,
              unit: 'pct'
            },
            {
              id: 'fact_text',
              factType: 'metric',
              factKey: 'cap_rate_pct',
              factValueNumber: null,
              factValueText:
                'The going-in capitalization rate is approximately five point five percent.',
              unit: 'pct'
            }
          ]
        };
      }
    },
    assetFeatureSnapshot: {
      async create(args: any) {
        createdSnapshot = args;
        return { id: 'snapshot_2', assetId: args.data.assetId, values: args.data.values.create };
      }
    }
  } as any);

  const values = createdSnapshot.data.values.create as Array<{
    key: string;
    numberValue: number | null;
    textValue: string | null;
  }>;
  const capRate = values.filter((v) => v.key === 'document.cap_rate_pct');
  assert.equal(capRate.length, 1); // deduped to a single feature
  assert.equal(capRate[0]!.numberValue, 5.5); // numeric value preserved, not dropped
});

test('feature promotion still upgrades a text-only feature to the numeric one regardless of order', async () => {
  // The long text fact arrives first; the numeric fact arrives second. The
  // numeric value must win (it is the promotable signal).
  let createdSnapshot: any;

  await promoteDocumentFactsToFeatures('version_3', {
    documentVersion: {
      async findUnique() {
        return {
          id: 'version_3',
          versionNumber: 1,
          documentId: 'document_3',
          document: { id: 'document_3', assetId: 'asset_3' },
          facts: [
            {
              id: 'fact_text',
              factType: 'metric',
              factKey: 'occupancy_pct',
              factValueNumber: null,
              factValueText:
                'Stabilized occupancy is expected to reach the low nineties over time.',
              unit: 'pct'
            },
            {
              id: 'fact_num',
              factType: 'metric',
              factKey: 'occupancy_pct',
              factValueNumber: 92,
              factValueText: null,
              unit: 'pct'
            }
          ]
        };
      }
    },
    assetFeatureSnapshot: {
      async create(args: any) {
        createdSnapshot = args;
        return { id: 'snapshot_3', assetId: args.data.assetId, values: args.data.values.create };
      }
    }
  } as any);

  const values = createdSnapshot.data.values.create as Array<{
    key: string;
    numberValue: number | null;
  }>;
  const occ = values.filter((v) => v.key === 'document.occupancy_pct');
  assert.equal(occ.length, 1);
  assert.equal(occ[0]!.numberValue, 92);
});
