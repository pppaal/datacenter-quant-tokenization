type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  fetchedAt?: string;
  freshnessLabel: string;
};

type ScenarioEntry = {
  name: string;
  valuationKrw: number;
};

type RunHealthInput = {
  createdAt?: Date | string | null;
  confidenceScore?: number | null;
  provenance?: ProvenanceEntry[] | null;
  scenarios?: ScenarioEntry[] | null;
};

export type RunHealthFlag = {
  key:
    | 'fresh'
    | 'stale_age'
    | 'stale_source'
    | 'fallback_heavy'
    | 'low_confidence'
    | 'compressed_spread'
    | 'rerun_recommended';
  label: string;
  tone: 'neutral' | 'good' | 'warn' | 'danger';
};

export function getRunSpreadRatio(scenarios?: ScenarioEntry[] | null) {
  const bull =
    scenarios?.find((scenario) => scenario.name.toLowerCase() === 'bull')?.valuationKrw ?? null;
  const bear =
    scenarios?.find((scenario) => scenario.name.toLowerCase() === 'bear')?.valuationKrw ?? null;
  const base =
    scenarios?.find((scenario) => scenario.name.toLowerCase() === 'base')?.valuationKrw ?? null;
  if (!bull || !bear || !base) return null;
  return (bull - bear) / base;
}

export function getRunHealthFlags(input: RunHealthInput): RunHealthFlag[] {
  const flags: RunHealthFlag[] = [];
  const createdAt = input.createdAt ? new Date(input.createdAt) : null;
  const ageDays = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24) : null;
  const provenance = input.provenance ?? [];
  const fallbackCount = provenance.filter(
    (entry) => entry.mode.toLowerCase() === 'fallback'
  ).length;
  const staleSourceEntry = provenance.find((entry) => {
    const fetchedAtValue =
      'fetchedAt' in (entry as Record<string, unknown>) && typeof entry.fetchedAt === 'string'
        ? entry.fetchedAt
        : null;
    const fetchedAt = fetchedAtValue ? new Date(fetchedAtValue) : null;
    const fetchedAgeDays = fetchedAt
      ? (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    return entry.freshnessLabel.toLowerCase().includes('stale') || fetchedAgeDays > 14;
  });
  const spreadRatio = getRunSpreadRatio(input.scenarios);

  if (ageDays !== null && ageDays > 14) {
    flags.push({ key: 'stale_age', label: 'Stale run', tone: 'warn' });
  }

  if (staleSourceEntry) {
    flags.push({ key: 'stale_source', label: 'Stale source', tone: 'warn' });
  }

  if (fallbackCount >= 2) {
    flags.push({ key: 'fallback_heavy', label: 'Fallback-heavy', tone: 'warn' });
  }

  if ((input.confidenceScore ?? 0) < 8.5) {
    flags.push({ key: 'low_confidence', label: 'Low confidence', tone: 'warn' });
  }

  if (spreadRatio !== null && spreadRatio < 0.12) {
    flags.push({ key: 'compressed_spread', label: 'Tight spread', tone: 'neutral' });
  }

  if (
    flags.some((flag) =>
      ['stale_age', 'stale_source', 'fallback_heavy', 'low_confidence'].includes(flag.key)
    )
  ) {
    flags.push({ key: 'rerun_recommended', label: 'Re-run recommended', tone: 'danger' });
  }

  if (flags.length === 0) {
    flags.push({ key: 'fresh', label: 'Current', tone: 'good' });
  }

  return flags;
}
