import { prisma } from '@/lib/db/prisma';
import { assetSchema } from '@/lib/validations/asset';

export async function listPublishedAssets() {
  return prisma.asset.findMany({ where: { isPublished: true }, orderBy: { createdAt: 'desc' } });
}

export async function listAdminAssets() {
  return prisma.asset.findMany({ orderBy: { updatedAt: 'desc' } });
}

export async function createAsset(input: unknown) {
  const data = assetSchema.parse(input);
  return prisma.asset.create({ data });
}

export async function updateAsset(id: string, input: unknown) {
  const data = assetSchema.partial().parse(input);
  return prisma.asset.update({ where: { id }, data });
}

export async function removeAsset(id: string) {
  return prisma.asset.delete({ where: { id } });
}
