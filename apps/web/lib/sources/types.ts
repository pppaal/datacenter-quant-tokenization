import type { SourceStatus } from '@prisma/client';

export type SourceMode = 'api' | 'cache' | 'fallback' | 'manual';

/**
 * Canonical provenance row.
 *
 * This is the single source of truth for the shape that was previously
 * re-declared (with drifting widths) in valuation-quality, valuation-run-health,
 * services/reports, services/im/provenance-map, services/im/macro-guidance and
 * valuation/feature-assumption-mapping. Those modules now import or re-export
 * this type.
 *
 * Width decisions (superset chosen so every prior consumer still typechecks):
 *   - `value` is `unknown` (most consumers read it untyped; source adapters
 *     already narrow to string | number | null before assigning, which is
 *     assignable to `unknown`).
 *   - `fetchedAt` is optional — adapters always set it, but several consumers
 *     read provenance that may omit it (persisted JSON, macro guidance rows).
 *   - `mode` is widened to `string`. Source adapters emit the `SourceMode`
 *     literal union (assignable to `string`) and consumers only read it
 *     (e.g. `.mode.toLowerCase()`). The UI-side provenance shapes that this
 *     type also has to satisfy already typed `mode` as `string`, so `string`
 *     is the superset that keeps every caller compatible.
 */
export type ProvenanceEntry = {
  field: string;
  value: unknown;
  sourceSystem: string;
  mode: string;
  fetchedAt?: string;
  freshnessLabel: string;
};

export type SourceEnvelope<T> = {
  sourceSystem: string;
  status: SourceStatus;
  mode: SourceMode;
  fetchedAt: Date;
  expiresAt: Date;
  freshnessLabel: string;
  data: T;
  provenance: ProvenanceEntry[];
};

export type CacheEntry<T> = {
  status: SourceStatus;
  payload: T;
  fetchedAt: Date;
  expiresAt: Date;
  freshnessLabel: string;
  errorMessage?: string | null;
  attempts?: number;
};

export interface SourceCacheStore {
  getOverride<T>(sourceSystem: string, cacheKey: string): Promise<T | null>;
  getFreshCache<T>(
    sourceSystem: string,
    cacheKey: string,
    now: Date
  ): Promise<CacheEntry<T> | null>;
  upsertCache<T>(sourceSystem: string, cacheKey: string, entry: CacheEntry<T>): Promise<void>;
}
