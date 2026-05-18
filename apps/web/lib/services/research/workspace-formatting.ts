/**
 * Pure presentation / inference helpers extracted from
 * lib/services/research/workspace.ts to keep that file under control.
 *
 * Everything here is deterministic and has no DB / network dependencies —
 * the workspace orchestrator imports them by name. Anything that touches
 * `prisma` or external adapters stays in the orchestrator.
 */
import { SourceStatus } from '@prisma/client';
import type {
  KoreaPublicDatasetDefinition,
  KoreaPublicNormalizedMetric
} from '@/lib/sources/adapters/korea-public';

export type SnapshotViewType = 'SOURCE' | 'HOUSE';
export type SnapshotApprovalStatus = 'DRAFT' | 'APPROVED' | 'SUPERSEDED';

export function pluralize(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

export function summarizeDatasetEnvelope(
  definition: KoreaPublicDatasetDefinition,
  envelope: {
    status: SourceStatus;
    freshnessLabel: string;
    data: Record<string, unknown>;
  }
) {
  const coverageLabel = definition.coverage.join(', ');
  if (envelope.status === SourceStatus.FRESH) {
    return `${definition.label} is current for ${coverageLabel}.`;
  }
  if (envelope.status === SourceStatus.STALE) {
    return `${definition.label} is running on fallback coverage for ${coverageLabel}.`;
  }
  if (envelope.status === SourceStatus.MANUAL) {
    return `${definition.label} is manually staged for ${coverageLabel}.`;
  }
  return `${definition.label} needs operator attention for ${coverageLabel}.`;
}

export function formatOfficialMetricValue(
  metric: Pick<KoreaPublicNormalizedMetric, 'value' | 'unit'>
) {
  if (metric.unit === 'pct') return `${metric.value.toFixed(1)}%`;
  if (metric.unit === 'bps') return `${metric.value.toFixed(0)} bps`;
  if (metric.unit === 'sqm') return `${Math.round(metric.value).toLocaleString()} sqm`;
  if (metric.unit === 'krw_per_sqm') return `${Math.round(metric.value).toLocaleString()} KRW/sqm`;
  if (metric.unit === 'kwh_per_sqm') return `${metric.value.toFixed(1)} kWh/sqm`;
  return Number.isInteger(metric.value) ? metric.value.toLocaleString() : metric.value.toFixed(1);
}

export function summarizeOfficialMetricHighlights(metrics: KoreaPublicNormalizedMetric[]) {
  return metrics.slice(0, 3).map((metric) => ({
    label: metric.label,
    value: formatOfficialMetricValue(metric)
  }));
}

export function countProvenance(provenance: unknown) {
  return Array.isArray(provenance) ? provenance.length : 0;
}

export function extractSnapshotHighlights(metrics: unknown) {
  if (!metrics || typeof metrics !== 'object') {
    return [] as Array<{ label: string; value: string }>;
  }

  const rawHighlights = (metrics as Record<string, unknown>).highlights;
  if (!Array.isArray(rawHighlights)) {
    return [] as Array<{ label: string; value: string }>;
  }

  return rawHighlights
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.label === 'string' && typeof candidate.value === 'string'
        ? {
            label: candidate.label,
            value: candidate.value
          }
        : null;
    })
    .filter((item): item is { label: string; value: string } => Boolean(item));
}

export function flattenNumericMetrics(
  value: unknown,
  prefix = '',
  depth = 0,
  bucket: Array<{ key: string; value: number }> = []
) {
  if (depth > 2 || bucket.length >= 32) {
    return bucket;
  }

  if (typeof value === 'number' && Number.isFinite(value) && prefix) {
    bucket.push({ key: prefix, value });
    return bucket;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return bucket;
  }

  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    const nextKey = prefix ? `${prefix}.${entryKey}` : entryKey;
    if (typeof entryValue === 'number' && Number.isFinite(entryValue)) {
      bucket.push({ key: nextKey, value: entryValue });
      continue;
    }
    if (entryValue && typeof entryValue === 'object' && !Array.isArray(entryValue)) {
      flattenNumericMetrics(entryValue, nextKey, depth + 1, bucket);
    }
    if (bucket.length >= 32) {
      break;
    }
  }

  return bucket;
}

export function inferObservationDateFromPayload(
  payload: Record<string, unknown>,
  fallbackDate: Date
) {
  for (const field of ['observationDate', 'asOfDate', 'date', 'updatedAt']) {
    const raw = payload[field];
    if (typeof raw === 'string' || raw instanceof Date) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return fallbackDate;
}

export function inferSnapshotViewType(snapshot: {
  snapshotType?: string | null;
  viewType?: SnapshotViewType | null;
}): SnapshotViewType {
  if (snapshot.viewType) return snapshot.viewType;
  if (
    snapshot.snapshotType === 'official-source' ||
    snapshot.snapshotType === 'market-official-source'
  ) {
    return 'SOURCE';
  }
  return 'HOUSE';
}

export function inferApprovalStatus(snapshot: {
  snapshotType?: string | null;
  viewType?: SnapshotViewType | null;
  approvalStatus?: SnapshotApprovalStatus | null;
}): SnapshotApprovalStatus {
  if (snapshot.approvalStatus) return snapshot.approvalStatus;
  return inferSnapshotViewType(snapshot) === 'SOURCE' ? 'APPROVED' : 'DRAFT';
}

export function computeThesisAgeDays(value: Date | null | undefined) {
  if (!(value instanceof Date)) return null;
  return Math.max(0, Math.round((Date.now() - value.getTime()) / (1000 * 60 * 60 * 24)));
}
