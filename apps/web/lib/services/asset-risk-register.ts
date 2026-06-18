import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { convertToKrw, resolveInputCurrency } from '@/lib/finance/currency';
import { assetRiskRegisterEntrySchema } from '@/lib/validations/asset-risk-register';
import { assetBundleInclude } from '@/lib/services/assets';

async function resolveAssetCurrencyContext(assetId: string, db: PrismaClient) {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { id: true, market: true, address: { select: { country: true } } }
  });
  if (!asset) throw new Error('Asset not found');
  return asset;
}

export async function createAssetRiskRegisterEntry(
  assetId: string,
  input: unknown,
  db: PrismaClient = prisma
) {
  const parsed = assetRiskRegisterEntrySchema.parse(input);
  const asset = await resolveAssetCurrencyContext(assetId, db);
  const inputCurrency = resolveInputCurrency(
    asset.address?.country ?? asset.market,
    parsed.inputCurrency
  );

  await db.assetRiskRegisterEntry.create({
    data: {
      assetId,
      title: parsed.title,
      category: parsed.category,
      description: parsed.description,
      likelihood: parsed.likelihood,
      impact: parsed.impact,
      irrImpactBps: parsed.irrImpactBps,
      valueImpactKrw:
        typeof parsed.valueImpactKrw === 'number'
          ? convertToKrw(parsed.valueImpactKrw, inputCurrency)
          : null,
      mitigant: parsed.mitigant,
      residualLikelihood: parsed.residualLikelihood,
      residualImpact: parsed.residualImpact,
      status: parsed.status,
      ownerName: parsed.ownerName,
      sortOrder: typeof parsed.sortOrder === 'number' ? Math.round(parsed.sortOrder) : 0
    }
  });

  return db.asset.findUnique({ where: { id: assetId }, include: assetBundleInclude });
}

export async function deleteAssetRiskRegisterEntry(
  assetId: string,
  entryId: string,
  db: PrismaClient = prisma
) {
  // Scope the delete to the asset so an entry id alone can't reach across assets.
  await db.assetRiskRegisterEntry.deleteMany({ where: { id: entryId, assetId } });
  return db.asset.findUnique({ where: { id: assetId }, include: assetBundleInclude });
}
