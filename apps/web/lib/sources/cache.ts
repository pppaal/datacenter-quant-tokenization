import { SourceStatus, type PrismaClient } from '@prisma/client';
import type { CacheEntry, SourceCacheStore } from '@/lib/sources/types';

export function createPrismaSourceCacheStore(prisma: PrismaClient): SourceCacheStore {
  return {
    async getOverride<T>(sourceSystem: string, cacheKey: string) {
      const override = await prisma.sourceOverride.findUnique({
        where: {
          sourceSystem_cacheKey: {
            sourceSystem,
            cacheKey
          }
        }
      });

      return (override?.payload as T) ?? null;
    },

    async getFreshCache<T>(sourceSystem: string, cacheKey: string, now: Date) {
      const cache = await prisma.sourceCache.findUnique({
        where: {
          sourceSystem_cacheKey: {
            sourceSystem,
            cacheKey
          }
        }
      });

      if (!cache || cache.expiresAt <= now) return null;

      return {
        status: cache.status,
        payload: cache.payload as T,
        fetchedAt: cache.fetchedAt,
        expiresAt: cache.expiresAt,
        freshnessLabel: cache.freshnessLabel,
        errorMessage: cache.errorMessage,
        attempts: cache.attempts
      };
    },

    async upsertCache<T>(sourceSystem: string, cacheKey: string, entry: CacheEntry<T>) {
      await prisma.sourceCache.upsert({
        where: {
          sourceSystem_cacheKey: {
            sourceSystem,
            cacheKey
          }
        },
        update: {
          sourceKey: `${sourceSystem}:${cacheKey}`,
          status: entry.status,
          payload: entry.payload as object,
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          errorMessage: entry.errorMessage ?? null,
          attempts: entry.attempts ?? 1
        },
        create: {
          sourceKey: `${sourceSystem}:${cacheKey}`,
          sourceSystem,
          cacheKey,
          status: entry.status ?? SourceStatus.FRESH,
          payload: entry.payload as object,
          fetchedAt: entry.fetchedAt,
          expiresAt: entry.expiresAt,
          freshnessLabel: entry.freshnessLabel,
          errorMessage: entry.errorMessage ?? null,
          attempts: entry.attempts ?? 1
        }
      });
    }
  };
}

export function createMemorySourceCacheStore(): SourceCacheStore {
  const cache = new Map<string, CacheEntry<unknown>>();
  const overrides = new Map<string, unknown>();

  return {
    async getOverride<T>(sourceSystem: string, cacheKey: string) {
      return (overrides.get(`${sourceSystem}:${cacheKey}`) as T | undefined) ?? null;
    },

    async getFreshCache<T>(sourceSystem: string, cacheKey: string, now: Date) {
      const entry = cache.get(`${sourceSystem}:${cacheKey}`) as CacheEntry<T> | undefined;
      if (!entry || entry.expiresAt <= now) return null;
      return entry;
    },

    async upsertCache<T>(sourceSystem: string, cacheKey: string, entry: CacheEntry<T>) {
      cache.set(`${sourceSystem}:${cacheKey}`, entry as CacheEntry<unknown>);
    }
  };
}
