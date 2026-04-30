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
  const multiples = closed
    .map((d) => d.equityMultiple)
    .filter((v): v is number => typeof v === 'number');
  const irrs = closed
    .map((d) => d.grossIrrPct)
    .filter((v): v is number => typeof v === 'number');
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
    averageEquityMultiple:
      multiples.length === 0
        ? null
        : multiples.reduce((sum, v) => sum + v, 0) / multiples.length,
    averageGrossIrrPct:
      irrs.length === 0 ? null : irrs.reduce((sum, v) => sum + v, 0) / irrs.length,
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
