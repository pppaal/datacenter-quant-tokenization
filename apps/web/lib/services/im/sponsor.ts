/**
 * Sponsor track-record helpers for the IM card.
 *
 * Match by case-insensitive name on Asset.sponsorName so adding a
 * Sponsor row never requires backfilling existing assets.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';

export type SponsorTrackSummary = {
  id: string;
  name: string;
  hqMarket: string | null;
  aumKrw: number | null;
  fundCount: number | null;
  yearFounded: number | null;
  websiteUrl: string | null;
  priorDealCount: number;
  averageEquityMultiple: number | null;
  averageGrossIrrPct: number | null;
  /**
   * How the averages above were computed: 'capital' = weighted by each deal's
   * committed equity (pooled), 'equal' = simple arithmetic mean (fallback when
   * no per-deal equity is captured), null = no closed deals with the metric.
   */
  averageWeightingBasis: 'capital' | 'equal' | null;
  oldestVintage: number | null;
  newestVintage: number | null;
  recentDeals: Array<{
    id: string;
    dealName: string;
    vintageYear: number;
    exitYear: number | null;
    assetClass: string | null;
    market: string | null;
    equityMultiple: number | null;
    grossIrrPct: number | null;
    status: string;
  }>;
};

export async function getSponsorTrackByName(
  sponsorName: string | null | undefined,
  db: PrismaClient = defaultPrisma
): Promise<SponsorTrackSummary | null> {
  if (!sponsorName?.trim()) return null;
  const sponsor = await db.sponsor.findFirst({
    where: { name: { equals: sponsorName.trim(), mode: 'insensitive' } },
    include: {
      priorDeals: {
        orderBy: [{ vintageYear: 'desc' }, { dealName: 'asc' }]
      }
    }
  });
  if (!sponsor) return null;

  const deals = sponsor.priorDeals;
  const closed = deals.filter((d) => d.status === 'EXITED');
  // Capital-weighted (pooled) averages: weight each closed deal's metric by its
  // committed equity, so a large realized deal moves the track record more than
  // a small one. Falls back to a simple mean when no per-deal equity is on file.
  // (A true pooled IRR needs dated cash flows we don't store; an equity-weighted
  // average is the standard available approximation and beats equal-weighting.)
  const equityWeightedMean = (metric: (d: (typeof closed)[number]) => number | null) => {
    const weighted = closed
      .map((d) => ({ value: metric(d), weight: d.equityKrw }))
      .filter(
        (r): r is { value: number; weight: number } =>
          typeof r.value === 'number' && typeof r.weight === 'number' && r.weight > 0
      );
    if (weighted.length > 0) {
      const weightSum = weighted.reduce((sum, r) => sum + r.weight, 0);
      const value = weighted.reduce((sum, r) => sum + r.value * r.weight, 0) / weightSum;
      return { value, basis: 'capital' as const };
    }
    const simple = closed.map(metric).filter((v): v is number => typeof v === 'number');
    if (simple.length > 0) {
      return {
        value: simple.reduce((sum, v) => sum + v, 0) / simple.length,
        basis: 'equal' as const
      };
    }
    return { value: null, basis: null };
  };

  const multipleAvg = equityWeightedMean((d) => d.equityMultiple);
  const irrAvg = equityWeightedMean((d) => d.grossIrrPct);
  const averageWeightingBasis = multipleAvg.basis ?? irrAvg.basis;
  const vintages = deals.map((d) => d.vintageYear).sort((a, b) => a - b);

  return {
    id: sponsor.id,
    name: sponsor.name,
    hqMarket: sponsor.hqMarket,
    aumKrw: sponsor.aumKrw,
    fundCount: sponsor.fundCount,
    yearFounded: sponsor.yearFounded,
    websiteUrl: sponsor.websiteUrl,
    priorDealCount: deals.length,
    averageEquityMultiple: multipleAvg.value,
    averageGrossIrrPct: irrAvg.value,
    averageWeightingBasis,
    oldestVintage: vintages[0] ?? null,
    newestVintage: vintages[vintages.length - 1] ?? null,
    recentDeals: deals.slice(0, 6).map((d) => ({
      id: d.id,
      dealName: d.dealName,
      vintageYear: d.vintageYear,
      exitYear: d.exitYear,
      assetClass: d.assetClass,
      market: d.market,
      equityMultiple: d.equityMultiple,
      grossIrrPct: d.grossIrrPct,
      status: d.status
    }))
  };
}
