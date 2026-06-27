import { type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getAssetBySlug } from '@/lib/services/assets';

export async function getDashboardSummary(db: PrismaClient = prisma) {
  const [assetCount, underReviewCount, documentCount, valuationCount] = await Promise.all([
    db.asset.count(),
    db.asset.count({
      where: {
        status: 'UNDER_REVIEW'
      }
    }),
    db.document.count(),
    db.valuationRun.count()
  ]);

  return {
    assetCount,
    underReviewCount,
    documentCount,
    valuationCount
  };
}

export async function getLandingData(db: PrismaClient = prisma) {
  const [assets, summary] = await Promise.all([
    db.asset.findMany({
      include: {
        address: true,
        marketSnapshot: true,
        valuations: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: 6
    }),
    getDashboardSummary(db)
  ]);

  return {
    assets,
    summary
  };
}

export async function getSampleReport(db: PrismaClient = prisma) {
  return getAssetBySlug('seoul-gangseo-01-seoul-hyperscale-campus', db);
}
