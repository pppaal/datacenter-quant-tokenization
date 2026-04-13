import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

type PortfolioKpiRow = {
  assetName: string;
  assetCode: string;
  metric: string;
  value: number;
  target: number;
  unit: string;
};

type PortfolioRiskAsset = {
  id: string;
  name: string;
  assetCode: string;
  occupancyRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  marketRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  overallHealth: 'good' | 'warn' | 'danger';
};

type PortfolioDashboardData = {
  summary: {
    totalAssets: number;
    totalAumKrw: number;
    avgOccupancyPct: number;
    avgNoiYieldPct: number;
    riskDistribution: { good: number; warn: number; danger: number };
  };
  noiYieldKpis: PortfolioKpiRow[];
  occupancyKpis: PortfolioKpiRow[];
  riskAssets: PortfolioRiskAsset[];
};

export type { PortfolioKpiRow, PortfolioRiskAsset, PortfolioDashboardData };

function classifyOccupancyRisk(occupancyPct: number | null): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (occupancyPct == null) return 'HIGH';
  if (occupancyPct >= 90) return 'LOW';
  if (occupancyPct >= 75) return 'MEDIUM';
  return 'HIGH';
}

function classifyMarketRisk(capRatePct: number | null, vacancyPct: number | null): 'LOW' | 'MEDIUM' | 'HIGH' {
  const capRisk = capRatePct != null && capRatePct > 7 ? 1 : 0;
  const vacRisk = vacancyPct != null && vacancyPct > 12 ? 1 : 0;
  const score = capRisk + vacRisk;
  if (score >= 2) return 'HIGH';
  if (score >= 1) return 'MEDIUM';
  return 'LOW';
}

function classifyOverallHealth(
  occupancyRisk: string,
  marketRisk: string,
  noiYieldPct: number | null,
  targetNoiYieldPct: number
): 'good' | 'warn' | 'danger' {
  const riskScore =
    (occupancyRisk === 'HIGH' ? 2 : occupancyRisk === 'MEDIUM' ? 1 : 0) +
    (marketRisk === 'HIGH' ? 2 : marketRisk === 'MEDIUM' ? 1 : 0);
  if (riskScore >= 3) return 'danger';
  if (riskScore >= 2 || (noiYieldPct != null && noiYieldPct < targetNoiYieldPct * 0.8)) return 'warn';
  return 'good';
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'toNumber' in (value as object)) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}

export async function buildPortfolioDashboardData(
  portfolioId?: string,
  db: PrismaClient = prisma
): Promise<PortfolioDashboardData> {
  const portfolioAssets = await db.portfolioAsset.findMany({
    where: portfolioId ? { portfolioId } : {},
    include: {
      asset: {
        select: {
          id: true,
          name: true,
          assetCode: true,
          assetClass: true,
          purchasePriceKrw: true,
          marketSnapshot: {
            select: {
              capRatePct: true,
              vacancyPct: true,
              discountRatePct: true
            }
          }
        }
      },
      monthlyKpis: {
        orderBy: { periodStart: 'desc' },
        take: 1
      }
    }
  });

  const noiYieldKpis: PortfolioKpiRow[] = [];
  const occupancyKpis: PortfolioKpiRow[] = [];
  const riskAssets: PortfolioRiskAsset[] = [];
  let totalAumKrw = 0;
  let occupancySum = 0;
  let occupancyCount = 0;
  let noiYieldSum = 0;
  let noiYieldCount = 0;
  let goodCount = 0;
  let warnCount = 0;
  let dangerCount = 0;

  const defaultTargetNoiYieldPct = 5.5;
  const defaultTargetOccupancyPct = 92;

  for (const pa of portfolioAssets) {
    const asset = pa.asset;
    if (!asset) continue;

    const latestKpi = pa.monthlyKpis[0] ?? null;
    const purchasePrice = toNumber(asset.purchasePriceKrw) ?? 0;
    totalAumKrw += purchasePrice;

    const occupancyPct = toNumber(latestKpi?.occupancyPct);
    const noiKrw = toNumber(latestKpi?.noiKrw);
    const holdValue = toNumber(pa.currentHoldValueKrw) ?? toNumber(latestKpi?.navKrw) ?? purchasePrice;
    const noiYieldPct = noiKrw != null && holdValue > 0 ? (noiKrw * 12 / holdValue) * 100 : null;

    if (occupancyPct != null) {
      occupancySum += occupancyPct;
      occupancyCount += 1;
      occupancyKpis.push({
        assetName: asset.name,
        assetCode: asset.assetCode,
        metric: 'Occupancy',
        value: occupancyPct,
        target: defaultTargetOccupancyPct,
        unit: '%'
      });
    }

    if (noiYieldPct != null) {
      noiYieldSum += noiYieldPct;
      noiYieldCount += 1;
      noiYieldKpis.push({
        assetName: asset.name,
        assetCode: asset.assetCode,
        metric: 'NOI Yield',
        value: noiYieldPct,
        target: defaultTargetNoiYieldPct,
        unit: '%'
      });
    }

    const capRatePct = toNumber(asset.marketSnapshot?.capRatePct);
    const vacancyPct = toNumber(asset.marketSnapshot?.vacancyPct);

    const occupancyRisk = classifyOccupancyRisk(occupancyPct);
    const marketRisk = classifyMarketRisk(capRatePct, vacancyPct);
    const overallHealth = classifyOverallHealth(occupancyRisk, marketRisk, noiYieldPct, defaultTargetNoiYieldPct);

    if (overallHealth === 'good') goodCount += 1;
    else if (overallHealth === 'warn') warnCount += 1;
    else dangerCount += 1;

    riskAssets.push({
      id: asset.id,
      name: asset.name,
      assetCode: asset.assetCode,
      occupancyRisk,
      marketRisk,
      overallHealth
    });
  }

  return {
    summary: {
      totalAssets: portfolioAssets.length,
      totalAumKrw,
      avgOccupancyPct: occupancyCount > 0 ? occupancySum / occupancyCount : 0,
      avgNoiYieldPct: noiYieldCount > 0 ? noiYieldSum / noiYieldCount : 0,
      riskDistribution: { good: goodCount, warn: warnCount, danger: dangerCount }
    },
    noiYieldKpis,
    occupancyKpis,
    riskAssets
  };
}
