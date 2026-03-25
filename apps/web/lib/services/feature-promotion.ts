import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

type PromotionDb = Pick<PrismaClient, 'documentVersion' | 'assetFeatureSnapshot' | 'asset'>;

type PromotedFeature = {
  key: string;
  numberValue: number | null;
  textValue: string | null;
  unit: string | null;
  sourceRef: string;
};

const PROMOTABLE_FACT_KEYS = new Set([
  'contracted_kw',
  'occupancy_pct',
  'cap_rate_pct',
  'discount_rate_pct',
  'capex_krw',
  'budget_krw',
  'monthly_rate_per_kw_krw',
  'permit_status_note',
  'counterparty_note',
  'tenant_status'
]);

function mapFactToFeature(fact: {
  factKey: string;
  factType: string;
  factValueNumber: number | null;
  factValueText: string | null;
  unit: string | null;
  id: string;
}): PromotedFeature | null {
  if (!PROMOTABLE_FACT_KEYS.has(fact.factKey)) return null;

  const feature: PromotedFeature = {
    key: `document.${fact.factKey}`,
    numberValue: fact.factValueNumber ?? null,
    textValue: fact.factValueText ?? null,
    unit: fact.unit ?? null,
    sourceRef: `document_fact:${fact.id}`
  };

  return feature;
}

function dedupePromotedFeatures(features: PromotedFeature[]) {
  const byKey = new Map<string, PromotedFeature>();
  for (const feature of features) {
    if (!byKey.has(feature.key)) {
      byKey.set(feature.key, feature);
      continue;
    }

    const current = byKey.get(feature.key)!;
    const currentHasNumber = current.numberValue !== null && current.numberValue !== undefined;
    const incomingHasNumber = feature.numberValue !== null && feature.numberValue !== undefined;
    if (!currentHasNumber && incomingHasNumber) {
      byKey.set(feature.key, feature);
      continue;
    }

    const currentTextLength = current.textValue?.length ?? 0;
    const incomingTextLength = feature.textValue?.length ?? 0;
    if (incomingTextLength > currentTextLength) {
      byKey.set(feature.key, feature);
    }
  }

  return Array.from(byKey.values());
}

export async function promoteDocumentFactsToFeatures(
  documentVersionId: string,
  db: PromotionDb = prisma
) {
  const version = await db.documentVersion.findUnique({
    where: { id: documentVersionId },
    include: {
      document: true,
      facts: {
        orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'asc' }]
      }
    }
  });

  if (!version?.document.assetId) return null;

  const mapped = version.facts.map((fact) =>
    mapFactToFeature({
      id: fact.id,
      factKey: fact.factKey,
      factType: fact.factType,
      factValueNumber: fact.factValueNumber,
      factValueText: fact.factValueText,
      unit: fact.unit
    })
  );

  const promoted = dedupePromotedFeatures(mapped.filter((feature): feature is PromotedFeature => feature !== null));

  if (promoted.length === 0) return null;

  const snapshot = await db.assetFeatureSnapshot.create({
    data: {
      assetId: version.document.assetId,
      featureNamespace: 'document_facts',
      sourceVersion: `document:${version.documentId}:v${version.versionNumber}`,
      values: {
        create: promoted.map((feature) => ({
          key: feature.key,
          numberValue: feature.numberValue ?? null,
          textValue: feature.textValue ?? null,
          unit: feature.unit ?? null,
          sourceRef: feature.sourceRef
        }))
      }
    },
    include: {
      values: {
        orderBy: {
          key: 'asc'
        }
      }
    }
  });

  return {
    snapshotId: snapshot.id,
    assetId: snapshot.assetId,
    valueCount: snapshot.values.length
  };
}

type CuratedFeatureSnapshotResult = {
  namespace: string;
  snapshotId: string;
  valueCount: number;
};

type CuratedFeatureValue = {
  key: string;
  numberValue: number | null;
  textValue: string | null;
  unit: string | null;
  sourceRef: string;
};

function createCuratedFeature(
  key: string,
  sourceRef: string,
  value: { numberValue?: number | null; textValue?: string | null; unit?: string | null }
): CuratedFeatureValue | null {
  const numberValue = value.numberValue ?? null;
  const textValue = value.textValue ?? null;
  const unit = value.unit ?? null;
  if (numberValue === null && textValue === null) return null;

  return {
    key,
    numberValue,
    textValue,
    unit,
    sourceRef
  };
}

async function createNamespaceSnapshot(
  db: PromotionDb,
  assetId: string,
  featureNamespace: string,
  sourceVersion: string,
  features: Array<CuratedFeatureValue | null>
) {
  const values = features.filter((feature): feature is CuratedFeatureValue => feature !== null);
  if (values.length === 0) return null;

  const snapshot = await db.assetFeatureSnapshot.create({
    data: {
      assetId,
      featureNamespace,
      sourceVersion,
      values: {
        create: values.map((feature) => ({
          key: feature.key,
          numberValue: feature.numberValue,
          textValue: feature.textValue,
          unit: feature.unit,
          sourceRef: feature.sourceRef
        }))
      }
    },
    include: {
      values: true
    }
  });

  return {
    namespace: featureNamespace,
    snapshotId: snapshot.id,
    valueCount: snapshot.values.length
  } satisfies CuratedFeatureSnapshotResult;
}

export async function promoteAssetSnapshotsToFeatures(assetId: string, db: PromotionDb = prisma) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: {
      siteProfile: true,
      energySnapshot: true,
      marketSnapshot: true,
      permitSnapshot: true,
      ownershipRecords: {
        orderBy: {
          effectiveDate: 'desc'
        },
        take: 1
      },
      encumbranceRecords: {
        orderBy: {
          effectiveDate: 'desc'
        },
        take: 1
      },
      planningConstraints: {
        orderBy: {
          updatedAt: 'desc'
        },
        take: 1
      },
      leases: {
        orderBy: {
          startYear: 'asc'
        },
        take: 1
      },
      readinessProject: true
    }
  });

  if (!asset) return [];

  const results: CuratedFeatureSnapshotResult[] = [];

  const satelliteSnapshot = await createNamespaceSnapshot(
    db,
    asset.id,
    'satellite_risk',
    `siteProfile:${asset.siteProfile?.sourceUpdatedAt?.toISOString() ?? asset.updatedAt.toISOString()}`,
    [
      createCuratedFeature('satellite.flood_risk_score', 'site_profile:flood', {
        numberValue: asset.siteProfile?.floodRiskScore ?? null,
        unit: 'score'
      }),
      createCuratedFeature('satellite.wildfire_risk_score', 'site_profile:wildfire', {
        numberValue: asset.siteProfile?.wildfireRiskScore ?? null,
        unit: 'score'
      }),
      createCuratedFeature('satellite.climate_note', 'site_profile:climate_note', {
        textValue: asset.siteProfile?.siteNotes ?? null
      })
    ]
  );
  if (satelliteSnapshot) results.push(satelliteSnapshot);

  const marketSnapshot = await createNamespaceSnapshot(
    db,
    asset.id,
    'market_inputs',
    `marketSnapshot:${asset.marketSnapshot?.sourceUpdatedAt?.toISOString() ?? asset.updatedAt.toISOString()}`,
    [
      createCuratedFeature('market.monthly_rate_per_kw_krw', 'market_snapshot:colocation_rate', {
        numberValue: asset.marketSnapshot?.colocationRatePerKwKrw ?? null,
        unit: 'KRW'
      }),
      createCuratedFeature('market.cap_rate_pct', 'market_snapshot:cap_rate', {
        numberValue: asset.marketSnapshot?.capRatePct ?? null,
        unit: 'pct'
      }),
      createCuratedFeature('market.discount_rate_pct', 'market_snapshot:discount_rate', {
        numberValue: asset.marketSnapshot?.discountRatePct ?? null,
        unit: 'pct'
      }),
      createCuratedFeature('market.debt_cost_pct', 'market_snapshot:debt_cost', {
        numberValue: asset.marketSnapshot?.debtCostPct ?? null,
        unit: 'pct'
      }),
      createCuratedFeature('market.construction_cost_per_mw_krw', 'market_snapshot:construction_cost', {
        numberValue: asset.marketSnapshot?.constructionCostPerMwKrw ?? null,
        unit: 'KRW'
      }),
      createCuratedFeature('market.note', 'market_snapshot:note', {
        textValue: asset.marketSnapshot?.marketNotes ?? null
      })
    ]
  );
  if (marketSnapshot) results.push(marketSnapshot);

  const permitSnapshot = await createNamespaceSnapshot(
    db,
    asset.id,
    'permit_inputs',
    `permitSnapshot:${asset.permitSnapshot?.sourceUpdatedAt?.toISOString() ?? asset.updatedAt.toISOString()}`,
    [
      createCuratedFeature('permit.stage', 'permit_snapshot:stage', {
        textValue: asset.permitSnapshot?.permitStage ?? null
      }),
      createCuratedFeature('permit.power_approval_status', 'permit_snapshot:power_status', {
        textValue: asset.permitSnapshot?.powerApprovalStatus ?? null
      }),
      createCuratedFeature('permit.timeline_note', 'permit_snapshot:timeline', {
        textValue: asset.permitSnapshot?.timelineNotes ?? null
      })
    ]
  );
  if (permitSnapshot) results.push(permitSnapshot);

  const powerSnapshot = await createNamespaceSnapshot(
    db,
    asset.id,
    'power_micro',
    `energySnapshot:${asset.energySnapshot?.sourceUpdatedAt?.toISOString() ?? asset.updatedAt.toISOString()}`,
    [
      createCuratedFeature('power.utility_name', 'energy_snapshot:utility_name', {
        textValue: asset.energySnapshot?.utilityName ?? null
      }),
      createCuratedFeature('power.substation_distance_km', 'energy_snapshot:substation_distance_km', {
        numberValue: asset.energySnapshot?.substationDistanceKm ?? null,
        unit: 'km'
      }),
      createCuratedFeature('power.tariff_krw_per_kwh', 'energy_snapshot:tariff_krw_per_kwh', {
        numberValue: asset.energySnapshot?.tariffKrwPerKwh ?? null,
        unit: 'KRW'
      }),
      createCuratedFeature('power.renewable_availability_pct', 'energy_snapshot:renewable_pct', {
        numberValue: asset.energySnapshot?.renewableAvailabilityPct ?? null,
        unit: 'pct'
      }),
      createCuratedFeature('power.pue_target', 'energy_snapshot:pue_target', {
        numberValue: asset.energySnapshot?.pueTarget ?? null
      }),
      createCuratedFeature('power.backup_fuel_hours', 'energy_snapshot:backup_fuel_hours', {
        numberValue: asset.energySnapshot?.backupFuelHours ?? null,
        unit: 'hours'
      })
    ]
  );
  if (powerSnapshot) results.push(powerSnapshot);

  const primaryLease = Array.isArray(asset.leases) ? asset.leases[0] : null;
  const revenueSnapshot = await createNamespaceSnapshot(
    db,
    asset.id,
    'revenue_micro',
    `lease:${primaryLease?.updatedAt?.toISOString() ?? asset.updatedAt.toISOString()}`,
    [
      createCuratedFeature('revenue.primary_tenant', 'lease:tenant_name', {
        textValue: primaryLease?.tenantName ?? null
      }),
      createCuratedFeature('revenue.leased_kw', 'lease:leased_kw', {
        numberValue: primaryLease?.leasedKw ?? null,
        unit: 'kW'
      }),
      createCuratedFeature('revenue.base_rate_per_kw_krw', 'lease:base_rate_per_kw_krw', {
        numberValue: primaryLease?.baseRatePerKwKrw ?? null,
        unit: 'KRW'
      }),
      createCuratedFeature('revenue.term_years', 'lease:term_years', {
        numberValue: primaryLease?.termYears ?? null,
        unit: 'years'
      }),
      createCuratedFeature('revenue.probability_pct', 'lease:probability_pct', {
        numberValue: primaryLease?.probabilityPct ?? null,
        unit: 'pct'
      }),
      createCuratedFeature('revenue.annual_escalation_pct', 'lease:annual_escalation_pct', {
        numberValue: primaryLease?.annualEscalationPct ?? null,
        unit: 'pct'
      })
    ]
  );
  if (revenueSnapshot) results.push(revenueSnapshot);

  const primaryOwner = Array.isArray(asset.ownershipRecords) ? asset.ownershipRecords[0] : null;
  const primaryEncumbrance = Array.isArray(asset.encumbranceRecords) ? asset.encumbranceRecords[0] : null;
  const primaryConstraint = Array.isArray(asset.planningConstraints) ? asset.planningConstraints[0] : null;
  const legalSnapshot = await createNamespaceSnapshot(
    db,
    asset.id,
    'legal_micro',
    `legal:${primaryConstraint?.updatedAt?.toISOString() ?? primaryEncumbrance?.updatedAt?.toISOString() ?? primaryOwner?.updatedAt?.toISOString() ?? asset.updatedAt.toISOString()}`,
    [
      createCuratedFeature('legal.owner_name', 'ownership_record:owner_name', {
        textValue: primaryOwner?.ownerName ?? null
      }),
      createCuratedFeature('legal.owner_entity_type', 'ownership_record:entity_type', {
        textValue: primaryOwner?.entityType ?? null
      }),
      createCuratedFeature('legal.ownership_pct', 'ownership_record:ownership_pct', {
        numberValue: primaryOwner?.ownershipPct ?? null,
        unit: 'pct'
      }),
      createCuratedFeature('legal.encumbrance_type', 'encumbrance_record:type', {
        textValue: primaryEncumbrance?.encumbranceType ?? null
      }),
      createCuratedFeature('legal.encumbrance_holder', 'encumbrance_record:holder_name', {
        textValue: primaryEncumbrance?.holderName ?? null
      }),
      createCuratedFeature('legal.secured_amount_krw', 'encumbrance_record:secured_amount_krw', {
        numberValue: primaryEncumbrance?.securedAmountKrw ?? null,
        unit: 'KRW'
      }),
      createCuratedFeature('legal.priority_rank', 'encumbrance_record:priority_rank', {
        numberValue: primaryEncumbrance?.priorityRank ?? null
      }),
      createCuratedFeature('legal.constraint_type', 'planning_constraint:type', {
        textValue: primaryConstraint?.constraintType ?? null
      }),
      createCuratedFeature('legal.constraint_title', 'planning_constraint:title', {
        textValue: primaryConstraint?.title ?? null
      }),
      createCuratedFeature('legal.constraint_severity', 'planning_constraint:severity', {
        textValue: primaryConstraint?.severity ?? null
      })
    ]
  );
  if (legalSnapshot) results.push(legalSnapshot);

  const readinessSnapshot = await createNamespaceSnapshot(
    db,
    asset.id,
    'readiness_legal',
    `readiness:${asset.readinessProject?.updatedAt?.toISOString() ?? asset.updatedAt.toISOString()}`,
    [
      createCuratedFeature('readiness.status', 'review_package:status', {
        textValue: asset.readinessProject?.readinessStatus ?? null
      }),
      createCuratedFeature('readiness.review_phase', 'review_package:phase', {
        textValue: asset.readinessProject?.reviewPhase ?? null
      }),
      createCuratedFeature('readiness.legal_structure', 'review_package:legal_structure', {
        textValue: asset.readinessProject?.legalStructure ?? null
      }),
      createCuratedFeature('readiness.next_action', 'review_package:next_action', {
        textValue: asset.readinessProject?.nextAction ?? null
      })
    ]
  );
  if (readinessSnapshot) results.push(readinessSnapshot);

  return results;
}
