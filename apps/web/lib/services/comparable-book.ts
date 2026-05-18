import { type PrismaClient } from '@prisma/client';
import { convertToKrw, resolveInputCurrency } from '@/lib/finance/currency';
import { prisma } from '@/lib/db/prisma';
import { comparableBookInputSchema } from '@/lib/validations/comparable-book';

type ComparableBookDeps = {
  db?: PrismaClient;
};

async function getAssetContext(assetId: string, db: PrismaClient) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: {
      address: true,
      comparableSet: true
    }
  });

  if (!asset) throw new Error('Asset not found');
  return asset;
}

function normalizeComparableInput(
  asset: Awaited<ReturnType<typeof getAssetContext>>,
  input: unknown
) {
  const parsed = comparableBookInputSchema.parse(input);
  const inputCurrency = resolveInputCurrency(
    asset.address?.country ?? asset.market,
    parsed.inputCurrency
  );

  return {
    ...parsed,
    valuationKrw:
      typeof parsed.valuationKrw === 'number'
        ? convertToKrw(parsed.valuationKrw, inputCurrency)
        : undefined,
    pricePerMwKrw:
      typeof parsed.pricePerMwKrw === 'number'
        ? convertToKrw(parsed.pricePerMwKrw, inputCurrency)
        : undefined,
    monthlyRatePerKwKrw:
      typeof parsed.monthlyRatePerKwKrw === 'number'
        ? convertToKrw(parsed.monthlyRatePerKwKrw, inputCurrency)
        : undefined
  };
}

async function ensureComparableSet(
  asset: Awaited<ReturnType<typeof getAssetContext>>,
  normalized: ReturnType<typeof normalizeComparableInput>,
  db: PrismaClient
) {
  return db.comparableSet.upsert({
    where: { assetId: asset.id },
    update: {
      name: normalized.setName ?? asset.comparableSet?.name ?? `${asset.name} comparable set`,
      notes: normalized.setNotes ?? asset.comparableSet?.notes ?? null
    },
    create: {
      assetId: asset.id,
      name: normalized.setName ?? `${asset.name} comparable set`,
      notes: normalized.setNotes ?? null,
      calibrationMode: 'Weighted market calibration'
    }
  });
}

export async function createComparableEntry(
  assetId: string,
  input: unknown,
  deps?: ComparableBookDeps
) {
  const db = deps?.db ?? prisma;
  const asset = await getAssetContext(assetId, db);
  const normalized = normalizeComparableInput(asset, input);
  const comparableSet = await ensureComparableSet(asset, normalized, db);

  return db.comparableEntry.create({
    data: {
      comparableSetId: comparableSet.id,
      label: normalized.label ?? 'Unnamed comparable',
      location: normalized.location ?? 'Unknown',
      assetType: normalized.assetType ?? asset.assetType,
      stage: normalized.stage,
      sourceLink: normalized.sourceLink,
      powerCapacityMw: normalized.powerCapacityMw,
      grossFloorAreaSqm: normalized.grossFloorAreaSqm,
      occupancyPct: normalized.occupancyPct,
      valuationKrw: normalized.valuationKrw,
      pricePerMwKrw: normalized.pricePerMwKrw,
      monthlyRatePerKwKrw: normalized.monthlyRatePerKwKrw,
      capRatePct: normalized.capRatePct,
      discountRatePct: normalized.discountRatePct,
      weightPct: normalized.weightPct,
      notes: normalized.notes
    }
  });
}

export async function updateComparableEntry(
  assetId: string,
  entryId: string,
  input: unknown,
  deps?: ComparableBookDeps
) {
  const db = deps?.db ?? prisma;
  const asset = await getAssetContext(assetId, db);
  const normalized = normalizeComparableInput(asset, input);
  const existing = await db.comparableEntry.findUnique({
    where: { id: entryId },
    include: {
      comparableSet: true
    }
  });

  if (!existing || existing.comparableSet.assetId !== assetId) {
    throw new Error('Comparable entry not found');
  }

  await ensureComparableSet(asset, normalized, db);

  return db.comparableEntry.update({
    where: { id: entryId },
    data: {
      label: normalized.label ?? existing.label,
      location: normalized.location ?? existing.location,
      assetType: normalized.assetType ?? existing.assetType,
      stage: normalized.stage ?? existing.stage,
      sourceLink: normalized.sourceLink ?? existing.sourceLink,
      powerCapacityMw: normalized.powerCapacityMw ?? existing.powerCapacityMw,
      grossFloorAreaSqm: normalized.grossFloorAreaSqm ?? existing.grossFloorAreaSqm,
      occupancyPct: normalized.occupancyPct ?? existing.occupancyPct,
      valuationKrw: normalized.valuationKrw ?? existing.valuationKrw,
      pricePerMwKrw: normalized.pricePerMwKrw ?? existing.pricePerMwKrw,
      monthlyRatePerKwKrw: normalized.monthlyRatePerKwKrw ?? existing.monthlyRatePerKwKrw,
      capRatePct: normalized.capRatePct ?? existing.capRatePct,
      discountRatePct: normalized.discountRatePct ?? existing.discountRatePct,
      weightPct: normalized.weightPct ?? existing.weightPct,
      notes: normalized.notes ?? existing.notes
    }
  });
}

export async function deleteComparableEntry(
  assetId: string,
  entryId: string,
  deps?: ComparableBookDeps
) {
  const db = deps?.db ?? prisma;
  const existing = await db.comparableEntry.findUnique({
    where: { id: entryId },
    include: {
      comparableSet: true
    }
  });

  if (!existing || existing.comparableSet.assetId !== assetId) {
    throw new Error('Comparable entry not found');
  }

  await db.comparableEntry.delete({
    where: { id: entryId }
  });

  return { id: entryId };
}
