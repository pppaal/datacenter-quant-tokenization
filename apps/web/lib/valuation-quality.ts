import { getValuationFeatureSourceDescriptors } from '@/lib/valuation/feature-snapshot-usage';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

type AssetQualityInput = {
  leases?: Array<unknown> | null;
  capexLineItems?: Array<unknown> | null;
  comparableSet?: {
    entries?: Array<unknown> | null;
  } | null;
  energySnapshot?: {
    tariffKrwPerKwh?: number | null;
    pueTarget?: number | null;
  } | null;
  permitSnapshot?: {
    powerApprovalStatus?: string | null;
  } | null;
  ownershipRecords?: Array<unknown> | null;
  encumbranceRecords?: Array<unknown> | null;
  planningConstraints?: Array<unknown> | null;
};

type CoverageItem = {
  key: 'lease' | 'comparable' | 'capex' | 'power' | 'permit' | 'legal';
  label: string;
  status: 'good' | 'warn';
  detail: string;
};

export type ValuationQualitySummary = {
  coverage: CoverageItem[];
  missingInputs: string[];
  sourceStats: {
    apiCount: number;
    manualCount: number;
    fallbackCount: number;
  };
  featureSources: Array<{
    namespace: string;
    label: string;
    sourceVersion: string;
  }>;
};

function hasLegalCoverage(input: AssetQualityInput) {
  return (
    (input.ownershipRecords?.length ?? 0) > 0 ||
    (input.encumbranceRecords?.length ?? 0) > 0 ||
    (input.planningConstraints?.length ?? 0) > 0
  );
}

export function buildValuationQualitySummary(
  asset: AssetQualityInput,
  assumptions: unknown,
  provenance: ProvenanceEntry[] = []
): ValuationQualitySummary {
  const leaseCount = asset.leases?.length ?? 0;
  const comparableCount = asset.comparableSet?.entries?.length ?? 0;
  const capexCount = asset.capexLineItems?.length ?? 0;
  const hasPowerCoverage = Boolean(asset.energySnapshot?.tariffKrwPerKwh && asset.energySnapshot?.pueTarget);
  const hasPermitCoverage = Boolean(asset.permitSnapshot?.powerApprovalStatus);
  const hasLegal = hasLegalCoverage(asset);

  const coverage: CoverageItem[] = [
    {
      key: 'lease',
      label: 'Lease Book',
      status: leaseCount > 0 ? 'good' : 'warn',
      detail: leaseCount > 0 ? `${leaseCount} lease rows loaded into the DCF.` : 'No lease rows; valuation still leans on residual synthetic lease-up.'
    },
    {
      key: 'comparable',
      label: 'Comparables',
      status: comparableCount >= 3 ? 'good' : 'warn',
      detail:
        comparableCount >= 3
          ? `${comparableCount} comparables are available for pricing calibration.`
          : `${comparableCount} comparables loaded; add at least 3 for stable calibration.`
    },
    {
      key: 'capex',
      label: 'CAPEX Book',
      status: capexCount >= 4 ? 'good' : 'warn',
      detail:
        capexCount >= 4
          ? `${capexCount} line items support the replacement floor.`
          : `${capexCount} CAPEX lines loaded; replacement floor still partly fallback-driven.`
    },
    {
      key: 'power',
      label: 'Power Micro',
      status: hasPowerCoverage ? 'good' : 'warn',
      detail: hasPowerCoverage ? 'Tariff and PUE are both populated.' : 'Tariff and PUE are not both populated yet.'
    },
    {
      key: 'permit',
      label: 'Permit Visibility',
      status: hasPermitCoverage ? 'good' : 'warn',
      detail: hasPermitCoverage ? 'Power approval status is present.' : 'Power approval status is missing.'
    },
    {
      key: 'legal',
      label: 'Legal Micro',
      status: hasLegal ? 'good' : 'warn',
      detail: hasLegal ? 'Ownership, encumbrance, or planning detail is present.' : 'No legal micro coverage yet.'
    }
  ];

  const missingInputs = coverage
    .filter((item) => item.status === 'warn')
    .map((item) => {
      switch (item.key) {
        case 'lease':
          return 'Add at least one lease row with leased kW, rate, and term.';
        case 'comparable':
          return 'Add at least three comparable entries with pricing signals and weights.';
        case 'capex':
          return 'Split CAPEX into major categories instead of relying on a top-down budget.';
        case 'power':
          return 'Populate both tariff and PUE to tighten operating-cost assumptions.';
        case 'permit':
          return 'Capture current permit or power-approval status.';
        case 'legal':
          return 'Add ownership, encumbrance, or planning-constraint detail.';
      }
    });

  const sourceStats = provenance.reduce(
    (acc, entry) => {
      const mode = entry.mode.toLowerCase();
      if (mode === 'api') acc.apiCount += 1;
      else if (mode === 'manual') acc.manualCount += 1;
      else acc.fallbackCount += 1;
      return acc;
    },
    { apiCount: 0, manualCount: 0, fallbackCount: 0 }
  );

  return {
    coverage,
    missingInputs,
    sourceStats,
    featureSources: getValuationFeatureSourceDescriptors(assumptions)
  };
}
