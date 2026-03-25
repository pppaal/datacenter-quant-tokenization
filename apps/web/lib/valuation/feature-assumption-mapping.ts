import { formatCurrency, formatNumber, formatPercent, toSentenceCase } from '@/lib/utils';

type RecordLike = Record<string, unknown>;

type FeatureValueLike = {
  id: string;
  key: string;
  numberValue: number | null;
  textValue: string | null;
  unit: string | null;
};

type FeatureSnapshotLike = {
  id: string;
  featureNamespace: string;
  sourceVersion: string | null;
  values: FeatureValueLike[];
};

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type MappingTarget = {
  kind: 'assumption' | 'provenance';
  path: string;
  label: string;
};

type MappingDefinition = {
  label: string;
  targets: MappingTarget[];
};

export type FeatureAssumptionMappingRow = {
  snapshotId: string;
  sourceVersion: string | null;
  namespace: string;
  featureKey: string;
  featureLabel: string;
  featureValue: string;
  targetKind: MappingTarget['kind'];
  targetPath: string;
  targetLabel: string;
  appliedValue: string;
  mode: string | null;
  freshnessLabel: string | null;
};

const mappingDefinitions: Record<string, MappingDefinition> = {
  'document.occupancy_pct': {
    label: 'Document Occupancy',
    targets: [
      { kind: 'assumption', path: 'documentFeatures.occupancyPct', label: 'Document Override' },
      { kind: 'assumption', path: 'metrics.occupancyPct', label: 'Final Occupancy Metric' }
    ]
  },
  'document.monthly_rate_per_kw_krw': {
    label: 'Document Monthly Rate / kW',
    targets: [
      { kind: 'assumption', path: 'documentFeatures.monthlyRatePerKwKrw', label: 'Document Override' },
      { kind: 'assumption', path: 'metrics.monthlyRatePerKwKrw', label: 'Final Monthly Rate Metric' }
    ]
  },
  'document.cap_rate_pct': {
    label: 'Document Cap Rate',
    targets: [
      { kind: 'assumption', path: 'documentFeatures.capRatePct', label: 'Document Override' },
      { kind: 'assumption', path: 'metrics.capRatePct', label: 'Final Cap Rate Metric' },
      { kind: 'provenance', path: 'capRatePct', label: 'Provenance Field' }
    ]
  },
  'document.discount_rate_pct': {
    label: 'Document Discount Rate',
    targets: [
      { kind: 'assumption', path: 'documentFeatures.discountRatePct', label: 'Document Override' },
      { kind: 'assumption', path: 'metrics.discountRatePct', label: 'Final Discount Rate Metric' }
    ]
  },
  'document.capex_krw': {
    label: 'Document CAPEX',
    targets: [
      { kind: 'assumption', path: 'documentFeatures.capexKrw', label: 'Document Override' },
      { kind: 'assumption', path: 'capex.totalCapexKrw', label: 'Applied Total CAPEX' },
      { kind: 'provenance', path: 'capexBreakdown', label: 'Provenance Field' }
    ]
  },
  'document.budget_krw': {
    label: 'Document Budget',
    targets: [
      { kind: 'assumption', path: 'documentFeatures.capexKrw', label: 'Document Override' },
      { kind: 'assumption', path: 'capex.totalCapexKrw', label: 'Applied Total CAPEX' },
      { kind: 'provenance', path: 'capexBreakdown', label: 'Provenance Field' }
    ]
  },
  'document.contracted_kw': {
    label: 'Document Contracted kW',
    targets: [
      { kind: 'assumption', path: 'documentFeatures.contractedKw', label: 'Document Override' },
      { kind: 'assumption', path: 'leasing.contractedKw', label: 'Applied Leasing Metric' }
    ]
  },
  'document.permit_status_note': {
    label: 'Document Permit Note',
    targets: [{ kind: 'assumption', path: 'documentFeatures.permitStatusNote', label: 'Document Override' }]
  },
  'market.monthly_rate_per_kw_krw': {
    label: 'Market Monthly Rate / kW',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.marketInputs.monthlyRatePerKwKrw', label: 'Curated Override' },
      { kind: 'assumption', path: 'metrics.monthlyRatePerKwKrw', label: 'Final Monthly Rate Metric' }
    ]
  },
  'market.cap_rate_pct': {
    label: 'Market Cap Rate',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.marketInputs.capRatePct', label: 'Curated Override' },
      { kind: 'assumption', path: 'metrics.capRatePct', label: 'Final Cap Rate Metric' },
      { kind: 'provenance', path: 'capRatePct', label: 'Provenance Field' }
    ]
  },
  'market.discount_rate_pct': {
    label: 'Market Discount Rate',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.marketInputs.discountRatePct', label: 'Curated Override' },
      { kind: 'assumption', path: 'metrics.discountRatePct', label: 'Final Discount Rate Metric' }
    ]
  },
  'market.debt_cost_pct': {
    label: 'Market Debt Cost',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.marketInputs.debtCostPct', label: 'Curated Override' },
      { kind: 'assumption', path: 'metrics.debtCostPct', label: 'Final Debt Cost Metric' }
    ]
  },
  'market.construction_cost_per_mw_krw': {
    label: 'Market Construction Cost / MW',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.marketInputs.constructionCostPerMwKrw', label: 'Curated Override' }
    ]
  },
  'market.note': {
    label: 'Market Note',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.marketInputs.note', label: 'Curated Override' }]
  },
  'satellite.flood_risk_score': {
    label: 'Flood Risk Score',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.satelliteRisk.floodRiskScore', label: 'Curated Override' },
      { kind: 'assumption', path: 'satelliteRisk.floodRiskScore', label: 'Applied Satellite Metric' },
      { kind: 'assumption', path: 'metrics.floodPenalty', label: 'Flood Penalty Metric' }
    ]
  },
  'satellite.wildfire_risk_score': {
    label: 'Wildfire Risk Score',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.satelliteRisk.wildfireRiskScore', label: 'Curated Override' },
      { kind: 'assumption', path: 'satelliteRisk.wildfireRiskScore', label: 'Applied Satellite Metric' },
      { kind: 'assumption', path: 'metrics.wildfirePenalty', label: 'Wildfire Penalty Metric' },
      { kind: 'provenance', path: 'wildfireRiskScore', label: 'Provenance Field' }
    ]
  },
  'satellite.climate_note': {
    label: 'Climate Note',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.satelliteRisk.climateNote', label: 'Curated Override' },
      { kind: 'assumption', path: 'satelliteRisk.climateNote', label: 'Applied Satellite Metric' }
    ]
  },
  'permit.stage': {
    label: 'Permit Stage',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.permitInputs.permitStage', label: 'Curated Override' }]
  },
  'permit.power_approval_status': {
    label: 'Power Approval Status',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.permitInputs.powerApprovalStatus', label: 'Curated Override' },
      { kind: 'assumption', path: 'metrics.permitPenalty', label: 'Permit Penalty Metric' }
    ]
  },
  'permit.timeline_note': {
    label: 'Permit Timeline Note',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.permitInputs.timelineNote', label: 'Curated Override' }]
  },
  'power.utility_name': {
    label: 'Utility Name',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.powerMicro.utilityName', label: 'Curated Override' }]
  },
  'power.substation_distance_km': {
    label: 'Substation Distance',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.powerMicro.substationDistanceKm', label: 'Curated Override' }]
  },
  'power.tariff_krw_per_kwh': {
    label: 'Power Tariff',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.powerMicro.tariffKrwPerKwh', label: 'Curated Override' },
      { kind: 'assumption', path: 'metrics.powerPriceKrwPerKwh', label: 'Final Power Price Metric' }
    ]
  },
  'power.renewable_availability_pct': {
    label: 'Renewable Availability',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.powerMicro.renewableAvailabilityPct', label: 'Curated Override' }
    ]
  },
  'power.pue_target': {
    label: 'PUE Target',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.powerMicro.pueTarget', label: 'Curated Override' },
      { kind: 'assumption', path: 'metrics.pueTarget', label: 'Final PUE Metric' }
    ]
  },
  'power.backup_fuel_hours': {
    label: 'Backup Fuel Coverage',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.powerMicro.backupFuelHours', label: 'Curated Override' }]
  },
  'revenue.primary_tenant': {
    label: 'Primary Tenant',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.revenueMicro.primaryTenant', label: 'Curated Override' }]
  },
  'revenue.leased_kw': {
    label: 'Leased kW',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.revenueMicro.leasedKw', label: 'Curated Override' }]
  },
  'revenue.base_rate_per_kw_krw': {
    label: 'Revenue Base Rate / kW',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.revenueMicro.baseRatePerKwKrw', label: 'Curated Override' },
      { kind: 'assumption', path: 'metrics.monthlyRatePerKwKrw', label: 'Final Monthly Rate Metric' }
    ]
  },
  'revenue.term_years': {
    label: 'Revenue Term',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.revenueMicro.termYears', label: 'Curated Override' }]
  },
  'revenue.probability_pct': {
    label: 'Lease Probability',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.revenueMicro.probabilityPct', label: 'Curated Override' }]
  },
  'revenue.annual_escalation_pct': {
    label: 'Annual Escalation',
    targets: [
      { kind: 'assumption', path: 'curatedFeatures.revenueMicro.annualEscalationPct', label: 'Curated Override' }
    ]
  },
  'legal.owner_name': {
    label: 'Legal Owner',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.ownerName', label: 'Curated Override' }]
  },
  'legal.owner_entity_type': {
    label: 'Owner Entity Type',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.ownerEntityType', label: 'Curated Override' }]
  },
  'legal.ownership_pct': {
    label: 'Ownership Percentage',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.ownershipPct', label: 'Curated Override' }]
  },
  'legal.encumbrance_type': {
    label: 'Encumbrance Type',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.encumbranceType', label: 'Curated Override' }]
  },
  'legal.encumbrance_holder': {
    label: 'Encumbrance Holder',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.encumbranceHolder', label: 'Curated Override' }]
  },
  'legal.secured_amount_krw': {
    label: 'Secured Amount',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.securedAmountKrw', label: 'Curated Override' }]
  },
  'legal.priority_rank': {
    label: 'Priority Rank',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.priorityRank', label: 'Curated Override' }]
  },
  'legal.constraint_type': {
    label: 'Constraint Type',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.constraintType', label: 'Curated Override' }]
  },
  'legal.constraint_title': {
    label: 'Constraint Title',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.constraintTitle', label: 'Curated Override' }]
  },
  'legal.constraint_severity': {
    label: 'Constraint Severity',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.legalMicro.constraintSeverity', label: 'Curated Override' }]
  },
  'readiness.status': {
    label: 'Readiness Status',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.reviewReadiness.readinessStatus', label: 'Curated Override' }]
  },
  'readiness.review_phase': {
    label: 'Review Phase',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.reviewReadiness.reviewPhase', label: 'Curated Override' }]
  },
  'readiness.legal_structure': {
    label: 'Legal Structure',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.reviewReadiness.legalStructure', label: 'Curated Override' }]
  },
  'readiness.next_action': {
    label: 'Next Action',
    targets: [{ kind: 'assumption', path: 'curatedFeatures.reviewReadiness.nextAction', label: 'Curated Override' }]
  }
};

function asRecord(value: unknown): RecordLike | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as RecordLike;
}

function getNestedValue(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    const record = asRecord(current);
    if (!record) return null;
    return record[segment];
  }, source);
}

function formatUnknownValue(path: string, value: unknown, unit?: string | null) {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'string') return value;
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value);

  const lowerPath = path.toLowerCase();
  if (lowerPath.includes('krw') || lowerPath.includes('value') || lowerPath.includes('revenue') || lowerPath.includes('capex')) {
    return formatCurrency(value);
  }
  if (lowerPath.includes('pct')) {
    return formatPercent(value, 2);
  }

  return `${formatNumber(value, 3)}${unit ? ` ${unit}` : ''}`;
}

function formatFeatureValue(feature: FeatureValueLike) {
  if (feature.textValue) return feature.textValue;
  return formatUnknownValue(feature.key, feature.numberValue, feature.unit);
}

export function buildFeatureAssumptionMappings(
  snapshots: FeatureSnapshotLike[],
  assumptions: unknown,
  provenance: ProvenanceEntry[]
): FeatureAssumptionMappingRow[] {
  const provenanceByField = new Map(provenance.map((entry) => [entry.field, entry] as const));

  return snapshots.flatMap((snapshot) =>
    snapshot.values.flatMap((value) => {
      const definition = mappingDefinitions[value.key];
      if (!definition) {
        return [
          {
            snapshotId: snapshot.id,
            sourceVersion: snapshot.sourceVersion,
            namespace: snapshot.featureNamespace,
            featureKey: value.key,
            featureLabel: toSentenceCase(value.key.split('.').slice(1).join('_') || value.key),
            featureValue: formatFeatureValue(value),
            targetKind: 'assumption',
            targetPath: 'not-mapped',
            targetLabel: 'No direct valuation field',
            appliedValue: 'Tracked in promoted snapshot only',
            mode: null,
            freshnessLabel: null
          }
        ];
      }

      return definition.targets.map((target) => {
        if (target.kind === 'provenance') {
          const provenanceEntry = provenanceByField.get(target.path);

          return {
            snapshotId: snapshot.id,
            sourceVersion: snapshot.sourceVersion,
            namespace: snapshot.featureNamespace,
            featureKey: value.key,
            featureLabel: definition.label,
            featureValue: formatFeatureValue(value),
            targetKind: target.kind,
            targetPath: target.path,
            targetLabel: target.label,
            appliedValue: formatUnknownValue(target.path, provenanceEntry?.value ?? null),
            mode: provenanceEntry?.mode ?? null,
            freshnessLabel: provenanceEntry?.freshnessLabel ?? null
          } satisfies FeatureAssumptionMappingRow;
        }

        const appliedValue = getNestedValue(assumptions, target.path);

        return {
          snapshotId: snapshot.id,
          sourceVersion: snapshot.sourceVersion,
          namespace: snapshot.featureNamespace,
          featureKey: value.key,
          featureLabel: definition.label,
          featureValue: formatFeatureValue(value),
          targetKind: target.kind,
          targetPath: target.path,
          targetLabel: target.label,
          appliedValue: formatUnknownValue(target.path, appliedValue),
          mode: null,
          freshnessLabel: null
        } satisfies FeatureAssumptionMappingRow;
      });
    })
  );
}
