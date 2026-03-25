import type { SourceStatus } from '@prisma/client';

export type SourceMode = 'api' | 'cache' | 'fallback' | 'manual';

export type ProvenanceEntry = {
  field: string;
  value: string | number | null;
  sourceSystem: string;
  mode: SourceMode;
  fetchedAt: string;
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
  getFreshCache<T>(sourceSystem: string, cacheKey: string, now: Date): Promise<CacheEntry<T> | null>;
  upsertCache<T>(
    sourceSystem: string,
    cacheKey: string,
    entry: CacheEntry<T>
  ): Promise<void>;
}
