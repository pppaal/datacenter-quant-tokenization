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
    reviewStatus?: string | null;
  } | null;
  permitSnapshot?: {
    powerApprovalStatus?: string | null;
    reviewStatus?: string | null;
  } | null;
  ownershipRecords?: Array<{ reviewStatus?: string | null } | unknown> | null;
  encumbranceRecords?: Array<{ reviewStatus?: string | null } | unknown> | null;
  planningConstraints?: Array<{ reviewStatus?: string | null } | unknown> | null;
  permits?: Array<{ reviewStatus?: string | null } | unknown> | null;
};

type CoverageItem = {
  key: 'lease' | 'comparable' | 'capex' | 'power' | 'permit' | 'legal';
  label: string;
  status: 'good' | 'warn';
  detail: string;
};

type ReviewCount = {
  approved: number;
  pending: number;
  rejected: number;
};

export type ValuationQualitySummary = {
  coverage: CoverageItem[];
  missingInputs: string[];
  approvedEvidenceCount: number;
  pendingEvidenceCount: number;
  rejectedEvidenceCount: number;
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
    input.ownershipRecords?.some((record: any) => record?.reviewStatus === 'APPROVED') ||
    input.encumbranceRecords?.some((record: any) => record?.reviewStatus === 'APPROVED') ||
    input.planningConstraints?.some((record: any) => record?.reviewStatus === 'APPROVED')
  );
}

function countByReviewStatus(
  records: Array<{ reviewStatus?: string | null } | unknown> | null | undefined
): ReviewCount {
  return (records ?? []).reduce<ReviewCount>(
    (acc, record: any) => {
      if (record?.reviewStatus === 'APPROVED') acc.approved += 1;
      else if (record?.reviewStatus === 'PENDING') acc.pending += 1;
      else if (record?.reviewStatus === 'REJECTED') acc.rejected += 1;
      return acc;
    },
    { approved: 0, pending: 0, rejected: 0 }
  );
}

export function buildValuationQualitySummary(
  asset: AssetQualityInput,
  assumptions: unknown,
  provenance: ProvenanceEntry[] = []
): ValuationQualitySummary {
  const leaseReview = countByReviewStatus(
    asset.leases as Array<{ reviewStatus?: string | null } | unknown>
  );
  const ownershipReview = countByReviewStatus(asset.ownershipRecords);
  const encumbranceReview = countByReviewStatus(asset.encumbranceRecords);
  const planningReview = countByReviewStatus(asset.planningConstraints);
  const comparableCount = asset.comparableSet?.entries?.length ?? 0;
  const capexCount = asset.capexLineItems?.length ?? 0;
  const hasPowerCoverage =
    asset.energySnapshot?.reviewStatus === 'APPROVED' &&
    Boolean(asset.energySnapshot?.tariffKrwPerKwh && asset.energySnapshot?.pueTarget);
  const hasPermitCoverage =
    asset.permitSnapshot?.reviewStatus === 'APPROVED' &&
    Boolean(asset.permitSnapshot?.powerApprovalStatus);
  const hasLegal = hasLegalCoverage(asset);
  const approvedEvidenceCount =
    leaseReview.approved +
    ownershipReview.approved +
    encumbranceReview.approved +
    planningReview.approved +
    (asset.energySnapshot?.reviewStatus === 'APPROVED' ? 1 : 0) +
    (asset.permitSnapshot?.reviewStatus === 'APPROVED' ? 1 : 0);
  const pendingEvidenceCount =
    leaseReview.pending +
    ownershipReview.pending +
    encumbranceReview.pending +
    planningReview.pending +
    (asset.energySnapshot?.reviewStatus === 'PENDING' ? 1 : 0) +
    (asset.permitSnapshot?.reviewStatus === 'PENDING' ? 1 : 0);
  const rejectedEvidenceCount =
    leaseReview.rejected +
    ownershipReview.rejected +
    encumbranceReview.rejected +
    planningReview.rejected +
    (asset.energySnapshot?.reviewStatus === 'REJECTED' ? 1 : 0) +
    (asset.permitSnapshot?.reviewStatus === 'REJECTED' ? 1 : 0);

  const coverage: CoverageItem[] = [
    {
      key: 'lease',
      label: 'Lease Book',
      status: leaseReview.approved > 0 ? 'good' : 'warn',
      detail:
        leaseReview.approved > 0
          ? `${leaseReview.approved} approved lease row(s) are valuation-ready${leaseReview.pending > 0 ? `, ${leaseReview.pending} pending review` : ''}.`
          : leaseReview.pending > 0
            ? `${leaseReview.pending} lease row(s) are pending review; valuation falls back to raw revenue inputs.`
            : 'No lease rows; valuation still leans on residual synthetic lease-up.'
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
      detail: hasPowerCoverage
        ? 'Approved power evidence includes tariff and PUE.'
        : asset.energySnapshot?.reviewStatus === 'PENDING'
          ? 'Power evidence is present but still pending review.'
          : 'Approved tariff and PUE evidence are not both populated yet.'
    },
    {
      key: 'permit',
      label: 'Permit Visibility',
      status: hasPermitCoverage ? 'good' : 'warn',
      detail: hasPermitCoverage
        ? 'Approved permit evidence includes current power approval status.'
        : asset.permitSnapshot?.reviewStatus === 'PENDING'
          ? 'Permit evidence is present but still pending review.'
          : 'Approved power approval status is missing.'
    },
    {
      key: 'legal',
      label: 'Legal Micro',
      status: hasLegal ? 'good' : 'warn',
      detail: hasLegal
        ? `Approved legal evidence is present${ownershipReview.pending + encumbranceReview.pending + planningReview.pending > 0 ? `, with ${ownershipReview.pending + encumbranceReview.pending + planningReview.pending} pending item(s)` : ''}.`
        : ownershipReview.pending + encumbranceReview.pending + planningReview.pending > 0
          ? `${ownershipReview.pending + encumbranceReview.pending + planningReview.pending} legal item(s) are pending review.`
          : 'No legal micro coverage yet.'
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
    approvedEvidenceCount,
    pendingEvidenceCount,
    rejectedEvidenceCount,
    sourceStats,
    featureSources: getValuationFeatureSourceDescriptors(assumptions)
  };
}
