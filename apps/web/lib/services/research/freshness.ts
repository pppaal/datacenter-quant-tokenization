import { SourceStatus } from '@prisma/client';

export type ResearchFreshness = {
  status: SourceStatus;
  label: string;
  observedAt: Date | null;
};

export function deriveResearchFreshness(observedAt: Date | null | undefined): ResearchFreshness {
  if (!observedAt) {
    return {
      status: SourceStatus.FAILED,
      label: 'missing coverage',
      observedAt: null
    };
  }

  const ageDays = Math.floor((Date.now() - observedAt.getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays <= 30) {
    return { status: SourceStatus.FRESH, label: `${ageDays}d old`, observedAt };
  }
  if (ageDays <= 90) {
    return { status: SourceStatus.STALE, label: `${ageDays}d old`, observedAt };
  }

  return { status: SourceStatus.FAILED, label: `${ageDays}d old`, observedAt };
}

export function describeResearchFreshness(status: SourceStatus, label: string) {
  if (status === SourceStatus.FRESH) {
    return `Research fabric is current (${label}).`;
  }
  if (status === SourceStatus.STALE) {
    return `Research fabric is aging (${label}).`;
  }
  return `Research fabric has open freshness gaps (${label}).`;
}

export function getFreshnessTone(status: SourceStatus | null | undefined) {
  if (status === SourceStatus.FRESH) return 'good' as const;
  if (status === SourceStatus.STALE || status === SourceStatus.MANUAL) return 'warn' as const;
  return 'danger' as const;
}
