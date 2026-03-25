import assert from 'node:assert/strict';
import test from 'node:test';
import { promoteAssetSnapshotsToFeatures } from '@/lib/services/feature-promotion';

test('curated feature promotion creates market, satellite, permit, and readiness snapshots', async () => {
  const createdNamespaces: string[] = [];

  const results = await promoteAssetSnapshotsToFeatures('asset_1', {
    asset: {
      async findUnique() {
        return {
          id: 'asset_1',
          updatedAt: new Date('2026-03-22T00:00:00.000Z'),
          siteProfile: {
            floodRiskScore: 2.4,
            wildfireRiskScore: 1.1,
            siteNotes: 'NASA overlay indicates moderate flood diligence pressure.',
            sourceUpdatedAt: new Date('2026-03-22T01:00:00.000Z')
          },
          marketSnapshot: {
            colocationRatePerKwKrw: 214000,
            capRatePct: 6.4,
            discountRatePct: 9.6,
            debtCostPct: 5.2,
            constructionCostPerMwKrw: 7600000000,
            marketNotes: 'Seoul west corridor benchmark.',
            sourceUpdatedAt: new Date('2026-03-22T02:00:00.000Z')
          },
          permitSnapshot: {
            permitStage: 'Power allocation review',
            powerApprovalStatus: 'Pending final utility committee slot',
            timelineNotes: 'Expected within two quarters.',
            sourceUpdatedAt: new Date('2026-03-22T03:00:00.000Z')
          },
          readinessProject: {
            readinessStatus: 'READY',
            reviewPhase: 'Committee review',
            legalStructure: 'SPV review pending',
            nextAction: 'Ready for committee evidence packaging.',
            updatedAt: new Date('2026-03-22T04:00:00.000Z')
          }
        };
      }
    },
    assetFeatureSnapshot: {
      async create(args: any) {
        createdNamespaces.push(args.data.featureNamespace);
        return {
          id: `${args.data.featureNamespace}_snapshot`,
          assetId: args.data.assetId,
          values: args.data.values.create
        };
      }
    }
  } as any);

  assert.deepEqual(createdNamespaces, ['satellite_risk', 'market_inputs', 'permit_inputs', 'readiness_legal']);
  assert.equal(results.length, 4);
  assert.ok(results.some((result) => result.namespace === 'market_inputs' && result.valueCount >= 5));
});
