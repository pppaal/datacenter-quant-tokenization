import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { enrichAssetFromSources } from '@/lib/services/assets';
import { listSourceStatus } from '@/lib/services/sources';

type SourceRefreshDb = Pick<PrismaClient, 'asset' | 'sourceCache'>;

export type SourceRefreshAssetResult = {
  assetId: string;
  assetCode: string;
  assetName: string;
  status: 'refreshed' | 'failed';
  message?: string;
};

export type SourceRefreshSummary = {
  triggeredAt: string;
  staleThresholdHours: number;
  sourceFreshness: {
    total: number;
    fresh: number;
    stale: number;
    failed: number;
    staleSystems: string[];
    latestFetchAt: string | null;
  };
  assetFreshness: {
    totalTracked: number;
    staleCandidates: number;
    refreshed: number;
    failed: number;
    staleAssets: Array<{
      assetId: string;
      assetCode: string;
      assetName: string;
      city: string | null;
      lastEnrichedAt: string | null;
    }>;
  };
  results: SourceRefreshAssetResult[];
};

type RefreshDeps = {
  enrich?: typeof enrichAssetFromSources;
  now?: Date;
};

function getStaleThresholdHours() {
  const raw = Number(process.env.SOURCE_REFRESH_STALE_HOURS ?? 24);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

function getBatchSize() {
  const raw = Number(process.env.SOURCE_REFRESH_BATCH_SIZE ?? 4);
  return Number.isFinite(raw) && raw > 0 ? raw : 4;
}

export async function getSourceRefreshHealth(db: SourceRefreshDb = prisma, now = new Date()) {
  const staleThresholdHours = getStaleThresholdHours();
  const staleCutoff = new Date(now.getTime() - staleThresholdHours * 60 * 60 * 1000);

  const [sourceRows, assets] = await Promise.all([
    listSourceStatus(db as PrismaClient),
    db.asset.findMany({
      select: {
        id: true,
        assetCode: true,
        name: true,
        lastEnrichedAt: true,
        address: {
          select: {
            city: true
          }
        }
      },
      orderBy: [
        {
          lastEnrichedAt: 'asc'
        },
        {
          updatedAt: 'desc'
        }
      ]
    })
  ]);

  const staleAssets = assets.filter((asset) => !asset.lastEnrichedAt || asset.lastEnrichedAt < staleCutoff);
  const latestFetchAt = sourceRows
    .map((row) => row.fetchedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    staleThresholdHours,
    sourceFreshness: {
      total: sourceRows.length,
      fresh: sourceRows.filter((row) => row.status === 'FRESH').length,
      stale: sourceRows.filter((row) => row.status === 'STALE').length,
      failed: sourceRows.filter((row) => row.status === 'FAILED').length,
      staleSystems: sourceRows.filter((row) => row.status !== 'FRESH').map((row) => row.sourceSystem),
      latestFetchAt: latestFetchAt ? latestFetchAt.toISOString() : null
    },
    assetFreshness: {
      totalTracked: assets.length,
      staleCandidates: staleAssets.length,
      staleAssets: staleAssets.slice(0, 5).map((asset) => ({
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        city: asset.address?.city ?? null,
        lastEnrichedAt: asset.lastEnrichedAt ? asset.lastEnrichedAt.toISOString() : null
      }))
    }
  };
}

export async function runScheduledSourceRefresh(
  db: SourceRefreshDb = prisma,
  deps: RefreshDeps = {}
): Promise<SourceRefreshSummary> {
  const now = deps.now ?? new Date();
  const staleThresholdHours = getStaleThresholdHours();
  const staleCutoff = new Date(now.getTime() - staleThresholdHours * 60 * 60 * 1000);
  const batchSize = getBatchSize();
  const refreshAsset = deps.enrich ?? enrichAssetFromSources;

  const [health, candidates] = await Promise.all([
    getSourceRefreshHealth(db, now),
    db.asset.findMany({
      where: {
        OR: [{ lastEnrichedAt: null }, { lastEnrichedAt: { lt: staleCutoff } }]
      },
      select: {
        id: true,
        assetCode: true,
        name: true
      },
      orderBy: [
        {
          lastEnrichedAt: 'asc'
        },
        {
          updatedAt: 'desc'
        }
      ],
      take: batchSize
    })
  ]);

  const results: SourceRefreshAssetResult[] = [];

  for (const asset of candidates) {
    try {
      await refreshAsset(asset.id, db as PrismaClient);
      results.push({
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        status: 'refreshed'
      });
    } catch (error) {
      results.push({
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown refresh error'
      });
    }
  }

  return {
    triggeredAt: now.toISOString(),
    staleThresholdHours,
    sourceFreshness: health.sourceFreshness,
    assetFreshness: {
      ...health.assetFreshness,
      refreshed: results.filter((result) => result.status === 'refreshed').length,
      failed: results.filter((result) => result.status === 'failed').length
    },
    results
  };
}
