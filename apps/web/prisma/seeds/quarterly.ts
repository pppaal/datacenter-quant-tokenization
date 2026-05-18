import type { PrismaClient } from '@prisma/client';

/**
 * Seed one bootstrap snapshot so `/api/quarterly-report` and
 * `/quarterly-report` render with seed data instead of returning 404 in
 * fresh environments. Production data should come from the scheduled cron
 * path (`/api/ops/quarterly-snapshot`) which writes a real ECOS + MOLIT
 * bundle.
 *
 * Idempotent: returns early if the bootstrap snapshot already exists.
 */
export async function seedQuarterlyMarketBootstrap(prisma: PrismaClient): Promise<void> {
  const market = 'KR';
  const submarket = '전국';
  const quarter = '2026Q1';
  const quarterEndDate = new Date('2026-03-31T00:00:00.000Z');
  const existing = await prisma.quarterlyMarketSnapshot.findFirst({
    where: { market, submarket, assetClass: null, quarter }
  });
  if (existing) return;
  await prisma.quarterlyMarketSnapshot.create({
    data: {
      market,
      submarket,
      assetClass: null,
      quarter,
      quarterEndDate,
      transactionCount: 412,
      transactionVolumeKrw: BigInt(1_840_000_000_000),
      medianPriceKrwPerSqm: 13_400_000,
      vacancyPct: 7.6,
      rentKrwPerSqm: 38_500,
      capRatePct: 5.2,
      baseRatePct: 3.5,
      krwUsd: 1380,
      cpiYoYPct: 2.4,
      gdpYoYPct: 1.8,
      rawMetrics: {
        provenance: 'seed-bootstrap',
        notes: 'Replace via scheduled /api/ops/quarterly-snapshot cron.'
      },
      sourceManifest: {
        seed: { writtenAt: new Date().toISOString() }
      }
    }
  });
  console.log(`Quarterly snapshot seed: ${market}/${submarket}/${quarter} bootstrapped.`);
}
