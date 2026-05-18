const FEATURE_SOURCE_CONFIG = [
  {
    namespace: 'document_facts',
    label: 'Document Facts',
    path: ['documentFeatures', 'sourceVersion']
  },
  {
    namespace: 'market_inputs',
    label: 'Market Inputs',
    path: ['curatedFeatures', 'marketInputs', 'sourceVersion']
  },
  {
    namespace: 'satellite_risk',
    label: 'Satellite Risk',
    path: ['curatedFeatures', 'satelliteRisk', 'sourceVersion']
  },
  {
    namespace: 'permit_inputs',
    label: 'Permit Inputs',
    path: ['curatedFeatures', 'permitInputs', 'sourceVersion']
  },
  {
    namespace: 'power_micro',
    label: 'Power Micro',
    path: ['curatedFeatures', 'powerMicro', 'sourceVersion']
  },
  {
    namespace: 'revenue_micro',
    label: 'Revenue Micro',
    path: ['curatedFeatures', 'revenueMicro', 'sourceVersion']
  },
  {
    namespace: 'legal_micro',
    label: 'Legal Micro',
    path: ['curatedFeatures', 'legalMicro', 'sourceVersion']
  },
  {
    namespace: 'readiness_legal',
    label: 'Review Readiness',
    path: ['curatedFeatures', 'reviewReadiness', 'sourceVersion']
  }
] as const;

type RecordLike = Record<string, unknown>;

export type ValuationFeatureSourceDescriptor = {
  namespace: (typeof FEATURE_SOURCE_CONFIG)[number]['namespace'];
  label: (typeof FEATURE_SOURCE_CONFIG)[number]['label'];
  sourceVersion: string;
};

type FeatureSnapshotLike = {
  featureNamespace: string;
  sourceVersion: string | null;
};

function asRecord(value: unknown): RecordLike | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as RecordLike;
}

function readNestedString(source: unknown, path: readonly string[]) {
  let current: unknown = source;

  for (const segment of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[segment];
  }

  return typeof current === 'string' && current.length > 0 ? current : null;
}

export function getValuationFeatureSourceDescriptors(
  assumptions: unknown
): ValuationFeatureSourceDescriptor[] {
  return FEATURE_SOURCE_CONFIG.flatMap((config) => {
    const sourceVersion = readNestedString(assumptions, config.path);
    if (!sourceVersion) return [];

    return [
      {
        namespace: config.namespace,
        label: config.label,
        sourceVersion
      }
    ];
  });
}

export function filterValuationFeatureSnapshots<T extends FeatureSnapshotLike>(
  snapshots: T[],
  assumptions: unknown
): T[] {
  const sourceVersions = new Set(
    getValuationFeatureSourceDescriptors(assumptions).map((entry) => entry.sourceVersion)
  );

  return snapshots
    .filter((snapshot) => snapshot.sourceVersion && sourceVersions.has(snapshot.sourceVersion))
    .sort((left, right) => {
      const leftIndex = FEATURE_SOURCE_CONFIG.findIndex(
        (entry) => entry.namespace === left.featureNamespace
      );
      const rightIndex = FEATURE_SOURCE_CONFIG.findIndex(
        (entry) => entry.namespace === right.featureNamespace
      );

      return leftIndex - rightIndex;
    });
}
