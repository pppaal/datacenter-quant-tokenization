import assert from 'node:assert/strict';
import test from 'node:test';
import { promoteAssetSnapshotsToFeatures } from '@/lib/services/feature-promotion';

test('curated feature promotion creates market, satellite, permit, and readiness snapshots', async () => {
  const createdNamespaces: string[] = [];
  const createdSnapshots: any[] = [];

  const results = await promoteAssetSnapshotsToFeatures('asset_1', {
    asset: {
      async findUnique() {
        return {
          id: 'asset_1',
          updatedAt: new Date('2026-03-22T00:00:00.000Z'),
          siteProfile: {
            gridAvailability: '132kV corridor available',
            fiberAccess: 'Dual metro paths',
            latencyProfile: 'Seoul edge',
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
            id: 'permit_1',
            permitStage: 'Power allocation review',
            powerApprovalStatus: 'Pending final utility committee slot',
            timelineNotes: 'Expected within two quarters.',
            sourceUpdatedAt: new Date('2026-03-22T03:00:00.000Z'),
            updatedAt: new Date('2026-03-22T03:00:00.000Z'),
            reviewStatus: 'APPROVED',
            reviewedById: 'user_permit'
          },
          energySnapshot: {
            id: 'energy_1',
            utilityName: 'KEPCO',
            substationDistanceKm: 1.4,
            tariffKrwPerKwh: 158,
            renewableAvailabilityPct: 21,
            pueTarget: 1.28,
            backupFuelHours: 48,
            sourceUpdatedAt: new Date('2026-03-22T03:30:00.000Z'),
            updatedAt: new Date('2026-03-22T03:30:00.000Z'),
            reviewStatus: 'APPROVED',
            reviewedById: 'user_power'
          },
          ownershipRecords: [
            {
              id: 'owner_1',
              ownerName: 'Seoul Infra SPV',
              entityType: 'SPV',
              ownershipPct: 100,
              updatedAt: new Date('2026-03-22T03:45:00.000Z'),
              reviewStatus: 'APPROVED',
              reviewedById: 'user_legal'
            }
          ],
          encumbranceRecords: [
            {
              id: 'enc_1',
              encumbranceType: 'Senior mortgage',
              holderName: 'Infra Bank',
              securedAmountKrw: 42000000000,
              priorityRank: 1,
              updatedAt: new Date('2026-03-22T03:50:00.000Z'),
              reviewStatus: 'APPROVED',
              reviewedById: 'user_legal'
            }
          ],
          planningConstraints: [
            {
              id: 'plan_1',
              constraintType: 'Access easement',
              title: 'Shared ingress corridor',
              severity: 'Medium',
              updatedAt: new Date('2026-03-22T03:55:00.000Z'),
              reviewStatus: 'APPROVED',
              reviewedById: 'user_legal'
            }
          ],
          leases: [
            {
              id: 'lease_1',
              tenantName: 'Anchor Cloud',
              leasedKw: 12000,
              baseRatePerKwKrw: 215000,
              termYears: 10,
              probabilityPct: 85,
              annualEscalationPct: 2.5,
              updatedAt: new Date('2026-03-22T04:00:00.000Z'),
              reviewStatus: 'APPROVED',
              reviewedById: 'user_revenue'
            }
          ],
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
      async deleteMany() {
        return { count: 0 };
      },
      async create(args: any) {
        createdNamespaces.push(args.data.featureNamespace);
        createdSnapshots.push(args.data);
        return {
          id: `${args.data.featureNamespace}_snapshot`,
          assetId: args.data.assetId,
          values: args.data.values.create
        };
      }
    }
  } as any);

  assert.deepEqual(createdNamespaces, [
    'satellite_risk',
    'site_micro',
    'market_inputs',
    'permit_inputs',
    'power_micro',
    'revenue_micro',
    'legal_micro',
    'readiness_legal'
  ]);
  assert.equal(results.length, 8);
  assert.ok(
    results.some((result) => result.namespace === 'market_inputs' && result.valueCount >= 5)
  );
  assert.equal(
    createdSnapshots.find((snapshot) => snapshot.featureNamespace === 'power_micro')?.approvedById,
    'user_power'
  );
  assert.ok(
    createdSnapshots
      .find((snapshot) => snapshot.featureNamespace === 'legal_micro')
      ?.values.create.some(
        (value: any) => value.sourceRef === 'ownership_record:owner_1:owner_name'
      )
  );
});

test('curated feature promotion ignores pending and rejected normalized evidence', async () => {
  const createdNamespaces: string[] = [];

  await promoteAssetSnapshotsToFeatures('asset_2', {
    asset: {
      async findUnique() {
        return {
          id: 'asset_2',
          updatedAt: new Date('2026-03-22T00:00:00.000Z'),
          siteProfile: null,
          marketSnapshot: null,
          permitSnapshot: {
            id: 'permit_pending',
            permitStage: 'Pending',
            powerApprovalStatus: 'Pending',
            timelineNotes: null,
            sourceUpdatedAt: new Date('2026-03-22T03:00:00.000Z'),
            updatedAt: new Date('2026-03-22T03:00:00.000Z'),
            reviewStatus: 'PENDING',
            reviewedById: null
          },
          energySnapshot: {
            id: 'energy_rejected',
            utilityName: 'KEPCO',
            tariffKrwPerKwh: 158,
            pueTarget: 1.28,
            sourceUpdatedAt: new Date('2026-03-22T03:30:00.000Z'),
            updatedAt: new Date('2026-03-22T03:30:00.000Z'),
            reviewStatus: 'REJECTED',
            reviewedById: null
          },
          ownershipRecords: [],
          encumbranceRecords: [],
          planningConstraints: [],
          leases: [
            {
              id: 'lease_pending',
              tenantName: 'Pending tenant',
              leasedKw: 8000,
              baseRatePerKwKrw: 210000,
              termYears: 7,
              probabilityPct: 70,
              annualEscalationPct: 2,
              updatedAt: new Date('2026-03-22T04:00:00.000Z'),
              reviewStatus: 'PENDING',
              reviewedById: null
            }
          ],
          readinessProject: null
        };
      }
    },
    assetFeatureSnapshot: {
      async deleteMany() {
        return { count: 0 };
      },
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

  assert.deepEqual(createdNamespaces, []);
});
