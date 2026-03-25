import { AmortizationProfile, DebtFacilityType, type PrismaClient } from '@prisma/client';
import { convertToKrw, resolveInputCurrency } from '@/lib/finance/currency';
import { prisma } from '@/lib/db/prisma';
import { debtBookInputSchema } from '@/lib/validations/debt-book';

type DebtBookDeps = {
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

function normalizeDebtInput(asset: Awaited<ReturnType<typeof getAssetContext>>, input: unknown) {
  const parsed = debtBookInputSchema.parse(input);
  const inputCurrency = resolveInputCurrency(asset.address?.country ?? asset.market, parsed.inputCurrency);

  return {
    ...parsed,
    facilityType: parsed.facilityType ?? DebtFacilityType.TERM,
    commitmentKrw: typeof parsed.commitmentKrw === 'number' ? convertToKrw(parsed.commitmentKrw, inputCurrency) : undefined,
    drawnAmountKrw: typeof parsed.drawnAmountKrw === 'number' ? convertToKrw(parsed.drawnAmountKrw, inputCurrency) : undefined,
    amortizationProfile: parsed.amortizationProfile ?? AmortizationProfile.INTEREST_ONLY,
    draws:
      parsed.draws?.map((draw) => ({
        drawYear: draw.drawYear ?? 1,
        drawMonth: draw.drawMonth,
        amountKrw: typeof draw.amountKrw === 'number' ? convertToKrw(draw.amountKrw, inputCurrency) ?? 0 : 0,
        notes: draw.notes
      })) ?? undefined
  };
}

export async function createDebtFacility(assetId: string, input: unknown, deps?: DebtBookDeps) {
  const db = deps?.db ?? prisma;
  const asset = await getAssetContext(assetId, db);
  const normalized = normalizeDebtInput(asset, input);

  return db.debtFacility.create({
    data: {
      assetId,
      facilityType: normalized.facilityType,
      lenderName: normalized.lenderName,
      commitmentKrw: normalized.commitmentKrw ?? 0,
      drawnAmountKrw: normalized.drawnAmountKrw,
      interestRatePct: normalized.interestRatePct ?? 0,
      upfrontFeePct: normalized.upfrontFeePct,
      commitmentFeePct: normalized.commitmentFeePct,
      gracePeriodMonths: normalized.gracePeriodMonths,
      amortizationTermMonths: normalized.amortizationTermMonths,
      amortizationProfile: normalized.amortizationProfile,
      sculptedTargetDscr: normalized.sculptedTargetDscr,
      balloonPct: normalized.balloonPct,
      reserveMonths: normalized.reserveMonths,
      notes: normalized.notes,
      draws: normalized.draws?.length
        ? {
            create: normalized.draws.map((draw) => ({
              drawYear: draw.drawYear,
              drawMonth: draw.drawMonth,
              amountKrw: draw.amountKrw,
              notes: draw.notes
            }))
          }
        : undefined
    },
    include: {
      draws: {
        orderBy: [{ drawYear: 'asc' }, { drawMonth: 'asc' }]
      }
    }
  });
}

export async function updateDebtFacility(assetId: string, facilityId: string, input: unknown, deps?: DebtBookDeps) {
  const db = deps?.db ?? prisma;
  const asset = await getAssetContext(assetId, db);
  const normalized = normalizeDebtInput(asset, input);
  const existing = await db.debtFacility.findUnique({
    where: { id: facilityId }
  });

  if (!existing || existing.assetId !== assetId) {
    throw new Error('Debt facility not found');
  }

  return db.debtFacility.update({
    where: { id: facilityId },
    data: {
      facilityType: normalized.facilityType ?? existing.facilityType,
      lenderName: normalized.lenderName ?? existing.lenderName,
      commitmentKrw: normalized.commitmentKrw ?? existing.commitmentKrw,
      drawnAmountKrw: normalized.drawnAmountKrw ?? existing.drawnAmountKrw,
      interestRatePct: normalized.interestRatePct ?? existing.interestRatePct,
      upfrontFeePct: normalized.upfrontFeePct ?? existing.upfrontFeePct,
      commitmentFeePct: normalized.commitmentFeePct ?? existing.commitmentFeePct,
      gracePeriodMonths: normalized.gracePeriodMonths ?? existing.gracePeriodMonths,
      amortizationTermMonths: normalized.amortizationTermMonths ?? existing.amortizationTermMonths,
      amortizationProfile: normalized.amortizationProfile ?? existing.amortizationProfile,
      sculptedTargetDscr: normalized.sculptedTargetDscr ?? existing.sculptedTargetDscr,
      balloonPct: normalized.balloonPct ?? existing.balloonPct,
      reserveMonths: normalized.reserveMonths ?? existing.reserveMonths,
      notes: normalized.notes ?? existing.notes,
      draws:
        normalized.draws !== undefined
          ? {
              deleteMany: {},
              create: normalized.draws.map((draw) => ({
                drawYear: draw.drawYear,
                drawMonth: draw.drawMonth,
                amountKrw: draw.amountKrw,
                notes: draw.notes
              }))
            }
          : undefined
    },
    include: {
      draws: {
        orderBy: [{ drawYear: 'asc' }, { drawMonth: 'asc' }]
      }
    }
  });
}

export async function deleteDebtFacility(assetId: string, facilityId: string, deps?: DebtBookDeps) {
  const db = deps?.db ?? prisma;
  const existing = await db.debtFacility.findUnique({
    where: { id: facilityId }
  });

  if (!existing || existing.assetId !== assetId) {
    throw new Error('Debt facility not found');
  }

  await db.debtFacility.delete({
    where: { id: facilityId }
  });

  return { id: facilityId };
}
