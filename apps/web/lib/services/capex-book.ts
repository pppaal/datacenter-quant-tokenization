import { type PrismaClient } from '@prisma/client';
import { convertToKrw, resolveInputCurrency } from '@/lib/finance/currency';
import { prisma } from '@/lib/db/prisma';
import { capexBookInputSchema } from '@/lib/validations/capex-book';

type CapexBookDeps = {
  db?: PrismaClient;
};

async function getAssetContext(assetId: string, db: PrismaClient) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: {
      address: true
    }
  });

  if (!asset) throw new Error('Asset not found');
  return asset;
}

function normalizeCapexInput(asset: Awaited<ReturnType<typeof getAssetContext>>, input: unknown) {
  const parsed = capexBookInputSchema.parse(input);
  const inputCurrency = resolveInputCurrency(asset.address?.country ?? asset.market, parsed.inputCurrency);

  return {
    ...parsed,
    amountKrw: typeof parsed.amountKrw === 'number' ? convertToKrw(parsed.amountKrw, inputCurrency) : undefined
  };
}

export async function createCapexLineItem(assetId: string, input: unknown, deps?: CapexBookDeps) {
  const db = deps?.db ?? prisma;
  const asset = await getAssetContext(assetId, db);
  const normalized = normalizeCapexInput(asset, input);

  return db.capexLineItem.create({
    data: {
      assetId,
      category: normalized.category!,
      label: normalized.label ?? 'CAPEX line item',
      amountKrw: normalized.amountKrw ?? 0,
      spendYear: normalized.spendYear ?? 0,
      isEmbedded: normalized.isEmbedded,
      notes: normalized.notes
    }
  });
}

export async function updateCapexLineItem(assetId: string, itemId: string, input: unknown, deps?: CapexBookDeps) {
  const db = deps?.db ?? prisma;
  const asset = await getAssetContext(assetId, db);
  const normalized = normalizeCapexInput(asset, input);
  const existing = await db.capexLineItem.findUnique({
    where: { id: itemId }
  });

  if (!existing || existing.assetId !== assetId) {
    throw new Error('CAPEX line item not found');
  }

  return db.capexLineItem.update({
    where: { id: itemId },
    data: {
      category: normalized.category ?? existing.category,
      label: normalized.label ?? existing.label,
      amountKrw: normalized.amountKrw ?? existing.amountKrw,
      spendYear: normalized.spendYear ?? existing.spendYear,
      isEmbedded: normalized.isEmbedded,
      notes: normalized.notes ?? existing.notes
    }
  });
}

export async function deleteCapexLineItem(assetId: string, itemId: string, deps?: CapexBookDeps) {
  const db = deps?.db ?? prisma;
  const existing = await db.capexLineItem.findUnique({
    where: { id: itemId }
  });

  if (!existing || existing.assetId !== assetId) {
    throw new Error('CAPEX line item not found');
  }

  await db.capexLineItem.delete({
    where: { id: itemId }
  });

  return { id: itemId };
}
