import { TaskPriority, TaskStatus, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

type InitiativeMutationDb = Pick<PrismaClient, 'portfolioAsset' | 'assetManagementInitiative'>;

export type AssetManagementInitiativeInput = {
  title?: string;
  category?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  ownerName?: string | null;
  targetDate?: string | Date | null;
  summary?: string | null;
  blockerSummary?: string | null;
  nextStep?: string | null;
};

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createAssetManagementInitiative(
  portfolioAssetId: string,
  input: AssetManagementInitiativeInput,
  db: InitiativeMutationDb = prisma
) {
  const title = input.title?.trim();
  if (!title) {
    throw new Error('Initiative title is required.');
  }

  const portfolioAsset = await db.portfolioAsset.findUnique({
    where: { id: portfolioAssetId },
    select: {
      id: true,
      portfolioId: true,
      assetId: true
    }
  });

  if (!portfolioAsset) {
    throw new Error('Portfolio asset not found.');
  }

  const status = input.status ?? TaskStatus.OPEN;
  const targetDate = normalizeDate(input.targetDate);

  return db.assetManagementInitiative.create({
    data: {
      portfolioAssetId,
      title,
      category: input.category?.trim() || null,
      status,
      priority: input.priority ?? TaskPriority.MEDIUM,
      ownerName: input.ownerName?.trim() || null,
      targetDate,
      completedAt: status === TaskStatus.DONE ? new Date() : null,
      summary: input.summary?.trim() || null,
      blockerSummary: input.blockerSummary?.trim() || null,
      nextStep: input.nextStep?.trim() || null
    }
  });
}

export async function updateAssetManagementInitiative(
  portfolioAssetId: string,
  initiativeId: string,
  input: AssetManagementInitiativeInput,
  db: InitiativeMutationDb = prisma
) {
  const existing = await db.assetManagementInitiative.findUnique({
    where: { id: initiativeId },
    select: {
      id: true,
      portfolioAssetId: true,
      status: true,
      completedAt: true
    }
  });

  if (!existing || existing.portfolioAssetId !== portfolioAssetId) {
    throw new Error('Asset-management initiative not found.');
  }

  const nextStatus = input.status ?? existing.status;
  const completedAt =
    nextStatus === TaskStatus.DONE ? existing.completedAt ?? new Date() : null;

  return db.assetManagementInitiative.update({
    where: { id: initiativeId },
    data: {
      title: input.title?.trim() || undefined,
      category: input.category != null ? input.category.trim() || null : undefined,
      status: nextStatus,
      priority: input.priority,
      ownerName: input.ownerName != null ? input.ownerName.trim() || null : undefined,
      targetDate: input.targetDate !== undefined ? normalizeDate(input.targetDate) : undefined,
      completedAt,
      summary: input.summary != null ? input.summary.trim() || null : undefined,
      blockerSummary: input.blockerSummary != null ? input.blockerSummary.trim() || null : undefined,
      nextStep: input.nextStep != null ? input.nextStep.trim() || null : undefined
    }
  });
}
