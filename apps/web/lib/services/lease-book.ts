import { LeaseStatus, type PrismaClient } from '@prisma/client';
import { convertToKrw, resolveInputCurrency } from '@/lib/finance/currency';
import { promoteAssetSnapshotsToFeatures } from '@/lib/services/feature-promotion';
import { prisma } from '@/lib/db/prisma';
import { leaseBookInputSchema } from '@/lib/validations/lease-book';

type LeaseBookDeps = {
  db?: PrismaClient;
  promoter?: typeof promoteAssetSnapshotsToFeatures;
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

function normalizeLeaseInput(asset: Awaited<ReturnType<typeof getAssetContext>>, input: unknown) {
  const parsed = leaseBookInputSchema.parse(input);
  const inputCurrency = resolveInputCurrency(asset.address?.country ?? asset.market, parsed.inputCurrency);

  return {
    ...parsed,
    baseRatePerKwKrw:
      typeof parsed.baseRatePerKwKrw === 'number' ? convertToKrw(parsed.baseRatePerKwKrw, inputCurrency) : undefined,
    markToMarketRatePerKwKrw:
      typeof parsed.markToMarketRatePerKwKrw === 'number'
        ? convertToKrw(parsed.markToMarketRatePerKwKrw, inputCurrency)
        : undefined,
    renewalTenantImprovementKrw:
      typeof parsed.renewalTenantImprovementKrw === 'number'
        ? convertToKrw(parsed.renewalTenantImprovementKrw, inputCurrency)
        : undefined,
    renewalLeasingCommissionKrw:
      typeof parsed.renewalLeasingCommissionKrw === 'number'
        ? convertToKrw(parsed.renewalLeasingCommissionKrw, inputCurrency)
        : undefined,
    tenantImprovementKrw:
      typeof parsed.tenantImprovementKrw === 'number'
        ? convertToKrw(parsed.tenantImprovementKrw, inputCurrency)
        : undefined,
    leasingCommissionKrw:
      typeof parsed.leasingCommissionKrw === 'number'
        ? convertToKrw(parsed.leasingCommissionKrw, inputCurrency)
        : undefined,
    fixedRecoveriesKrw:
      typeof parsed.fixedRecoveriesKrw === 'number'
        ? convertToKrw(parsed.fixedRecoveriesKrw, inputCurrency)
        : undefined,
    expenseStopKrwPerKwMonth:
      typeof parsed.expenseStopKrwPerKwMonth === 'number'
        ? convertToKrw(parsed.expenseStopKrwPerKwMonth, inputCurrency)
        : undefined,
    fitOutCostKrw:
      typeof parsed.fitOutCostKrw === 'number' ? convertToKrw(parsed.fitOutCostKrw, inputCurrency) : undefined,
    steps:
      parsed.steps?.map((step, index) => ({
        stepOrder: index + 1,
        startYear: step.startYear ?? 1,
        endYear: step.endYear ?? step.startYear ?? 1,
        ratePerKwKrw:
          typeof step.ratePerKwKrw === 'number' ? convertToKrw(step.ratePerKwKrw, inputCurrency) ?? 0 : 0,
        leasedKw: step.leasedKw,
        annualEscalationPct: step.annualEscalationPct,
        occupancyPct: step.occupancyPct,
        rentFreeMonths: step.rentFreeMonths,
        renewProbabilityPct: step.renewProbabilityPct,
        rolloverDowntimeMonths: step.rolloverDowntimeMonths,
        renewalRentFreeMonths: step.renewalRentFreeMonths,
        renewalTermYears: step.renewalTermYears,
        renewalCount: step.renewalCount,
        markToMarketRatePerKwKrw:
          typeof step.markToMarketRatePerKwKrw === 'number'
            ? convertToKrw(step.markToMarketRatePerKwKrw, inputCurrency)
            : undefined,
        renewalTenantImprovementKrw:
          typeof step.renewalTenantImprovementKrw === 'number'
            ? convertToKrw(step.renewalTenantImprovementKrw, inputCurrency)
            : undefined,
        renewalLeasingCommissionKrw:
          typeof step.renewalLeasingCommissionKrw === 'number'
            ? convertToKrw(step.renewalLeasingCommissionKrw, inputCurrency)
            : undefined,
        tenantImprovementKrw:
          typeof step.tenantImprovementKrw === 'number'
            ? convertToKrw(step.tenantImprovementKrw, inputCurrency)
            : undefined,
        leasingCommissionKrw:
          typeof step.leasingCommissionKrw === 'number'
            ? convertToKrw(step.leasingCommissionKrw, inputCurrency)
            : undefined,
        recoverableOpexRatioPct: step.recoverableOpexRatioPct,
        fixedRecoveriesKrw:
          typeof step.fixedRecoveriesKrw === 'number'
            ? convertToKrw(step.fixedRecoveriesKrw, inputCurrency)
            : undefined,
        expenseStopKrwPerKwMonth:
          typeof step.expenseStopKrwPerKwMonth === 'number'
            ? convertToKrw(step.expenseStopKrwPerKwMonth, inputCurrency)
            : undefined,
        utilityPassThroughPct: step.utilityPassThroughPct,
        notes: step.notes
      })) ?? undefined
  };
}

async function runPromotion(assetId: string, db: PrismaClient, promoter: typeof promoteAssetSnapshotsToFeatures) {
  try {
    await promoter(assetId, db);
  } catch {
    // Lease CRUD should persist even if the feature-promotion sidecar fails.
  }
}

export async function createAssetLease(assetId: string, input: unknown, deps?: LeaseBookDeps) {
  const db = deps?.db ?? prisma;
  const promoter = deps?.promoter ?? promoteAssetSnapshotsToFeatures;
  const asset = await getAssetContext(assetId, db);
  const normalized = normalizeLeaseInput(asset, input);

  const lease = await db.lease.create({
    data: {
      assetId,
      tenantName: normalized.tenantName ?? 'Primary demand signal',
      status: normalized.leaseStatus ?? LeaseStatus.PIPELINE,
      leasedKw: normalized.leasedKw ?? 0,
      startYear: normalized.startYear ?? 1,
      termYears: normalized.termYears ?? 1,
      baseRatePerKwKrw: normalized.baseRatePerKwKrw ?? 0,
      annualEscalationPct: normalized.annualEscalationPct,
      probabilityPct: normalized.probabilityPct,
      renewProbabilityPct: normalized.renewProbabilityPct,
      downtimeMonths: normalized.downtimeMonths,
      rolloverDowntimeMonths: normalized.rolloverDowntimeMonths,
      renewalRentFreeMonths: normalized.renewalRentFreeMonths,
      renewalTermYears: normalized.renewalTermYears,
      renewalCount: normalized.renewalCount,
      rentFreeMonths: normalized.rentFreeMonths,
      markToMarketRatePerKwKrw: normalized.markToMarketRatePerKwKrw,
      renewalTenantImprovementKrw: normalized.renewalTenantImprovementKrw,
      renewalLeasingCommissionKrw: normalized.renewalLeasingCommissionKrw,
      tenantImprovementKrw: normalized.tenantImprovementKrw,
      leasingCommissionKrw: normalized.leasingCommissionKrw,
      recoverableOpexRatioPct: normalized.recoverableOpexRatioPct,
      fixedRecoveriesKrw: normalized.fixedRecoveriesKrw,
      expenseStopKrwPerKwMonth: normalized.expenseStopKrwPerKwMonth,
      utilityPassThroughPct: normalized.utilityPassThroughPct,
      fitOutCostKrw: normalized.fitOutCostKrw,
      notes: normalized.leaseNotes,
      steps: normalized.steps?.length
        ? {
            create: normalized.steps.map((step) => ({
              stepOrder: step.stepOrder,
              startYear: step.startYear,
              endYear: step.endYear,
              ratePerKwKrw: step.ratePerKwKrw,
              leasedKw: step.leasedKw,
              annualEscalationPct: step.annualEscalationPct,
              occupancyPct: step.occupancyPct,
              rentFreeMonths: step.rentFreeMonths,
              renewProbabilityPct: step.renewProbabilityPct,
              rolloverDowntimeMonths: step.rolloverDowntimeMonths,
              renewalRentFreeMonths: step.renewalRentFreeMonths,
              renewalTermYears: step.renewalTermYears,
              renewalCount: step.renewalCount,
              markToMarketRatePerKwKrw: step.markToMarketRatePerKwKrw,
              renewalTenantImprovementKrw: step.renewalTenantImprovementKrw,
              renewalLeasingCommissionKrw: step.renewalLeasingCommissionKrw,
              tenantImprovementKrw: step.tenantImprovementKrw,
              leasingCommissionKrw: step.leasingCommissionKrw,
              recoverableOpexRatioPct: step.recoverableOpexRatioPct,
              fixedRecoveriesKrw: step.fixedRecoveriesKrw,
              expenseStopKrwPerKwMonth: step.expenseStopKrwPerKwMonth,
              utilityPassThroughPct: step.utilityPassThroughPct,
              notes: step.notes
            }))
          }
        : undefined
    } as any,
    include: {
      steps: {
        orderBy: {
          stepOrder: 'asc'
        }
      }
    }
  });

  await runPromotion(assetId, db, promoter);

  return lease;
}

export async function updateAssetLease(assetId: string, leaseId: string, input: unknown, deps?: LeaseBookDeps) {
  const db = deps?.db ?? prisma;
  const promoter = deps?.promoter ?? promoteAssetSnapshotsToFeatures;
  const asset = await getAssetContext(assetId, db);
  const normalized = normalizeLeaseInput(asset, input);

  const existing = await db.lease.findUnique({
    where: { id: leaseId }
  });

  if (!existing || existing.assetId !== assetId) {
    throw new Error('Lease not found');
  }

  const existingLease = existing as typeof existing & {
    renewalRentFreeMonths?: number | null;
    renewalTermYears?: number | null;
    renewalCount?: number | null;
    renewalTenantImprovementKrw?: number | null;
    renewalLeasingCommissionKrw?: number | null;
  };

  const lease = await db.lease.update({
    where: { id: leaseId },
    data: {
      tenantName: normalized.tenantName ?? existing.tenantName,
      status: normalized.leaseStatus ?? existing.status,
      leasedKw: normalized.leasedKw ?? existing.leasedKw,
      startYear: normalized.startYear ?? existing.startYear,
      termYears: normalized.termYears ?? existing.termYears,
      baseRatePerKwKrw: normalized.baseRatePerKwKrw ?? existing.baseRatePerKwKrw,
      annualEscalationPct: normalized.annualEscalationPct ?? existing.annualEscalationPct,
      probabilityPct: normalized.probabilityPct ?? existing.probabilityPct,
      renewProbabilityPct: normalized.renewProbabilityPct ?? existing.renewProbabilityPct,
      downtimeMonths: normalized.downtimeMonths ?? existing.downtimeMonths,
      rolloverDowntimeMonths:
        normalized.rolloverDowntimeMonths ?? existing.rolloverDowntimeMonths,
      renewalRentFreeMonths:
        normalized.renewalRentFreeMonths ?? existingLease.renewalRentFreeMonths,
      renewalTermYears: normalized.renewalTermYears ?? existingLease.renewalTermYears,
      renewalCount: normalized.renewalCount ?? existingLease.renewalCount,
      rentFreeMonths: normalized.rentFreeMonths ?? existing.rentFreeMonths,
      markToMarketRatePerKwKrw:
        normalized.markToMarketRatePerKwKrw ?? existing.markToMarketRatePerKwKrw,
      renewalTenantImprovementKrw:
        normalized.renewalTenantImprovementKrw ?? existingLease.renewalTenantImprovementKrw,
      renewalLeasingCommissionKrw:
        normalized.renewalLeasingCommissionKrw ?? existingLease.renewalLeasingCommissionKrw,
      tenantImprovementKrw: normalized.tenantImprovementKrw ?? existing.tenantImprovementKrw,
      leasingCommissionKrw: normalized.leasingCommissionKrw ?? existing.leasingCommissionKrw,
      recoverableOpexRatioPct:
        normalized.recoverableOpexRatioPct ?? existing.recoverableOpexRatioPct,
      fixedRecoveriesKrw: normalized.fixedRecoveriesKrw ?? existing.fixedRecoveriesKrw,
      expenseStopKrwPerKwMonth:
        normalized.expenseStopKrwPerKwMonth ?? existing.expenseStopKrwPerKwMonth,
      utilityPassThroughPct: normalized.utilityPassThroughPct ?? existing.utilityPassThroughPct,
      fitOutCostKrw: normalized.fitOutCostKrw ?? existing.fitOutCostKrw,
      notes: normalized.leaseNotes ?? existing.notes,
      steps:
        normalized.steps !== undefined
          ? {
              deleteMany: {},
              create: normalized.steps.map((step) => ({
                stepOrder: step.stepOrder,
                startYear: step.startYear,
                endYear: step.endYear,
                ratePerKwKrw: step.ratePerKwKrw,
                leasedKw: step.leasedKw,
                annualEscalationPct: step.annualEscalationPct,
                occupancyPct: step.occupancyPct,
                rentFreeMonths: step.rentFreeMonths,
                renewProbabilityPct: step.renewProbabilityPct,
                rolloverDowntimeMonths: step.rolloverDowntimeMonths,
                renewalRentFreeMonths: step.renewalRentFreeMonths,
                renewalTermYears: step.renewalTermYears,
                renewalCount: step.renewalCount,
                markToMarketRatePerKwKrw: step.markToMarketRatePerKwKrw,
                renewalTenantImprovementKrw: step.renewalTenantImprovementKrw,
                renewalLeasingCommissionKrw: step.renewalLeasingCommissionKrw,
                tenantImprovementKrw: step.tenantImprovementKrw,
                leasingCommissionKrw: step.leasingCommissionKrw,
                recoverableOpexRatioPct: step.recoverableOpexRatioPct,
                fixedRecoveriesKrw: step.fixedRecoveriesKrw,
                expenseStopKrwPerKwMonth: step.expenseStopKrwPerKwMonth,
                utilityPassThroughPct: step.utilityPassThroughPct,
                notes: step.notes
              }))
            }
          : undefined
    } as any,
    include: {
      steps: {
        orderBy: {
          stepOrder: 'asc'
        }
      }
    }
  });

  await runPromotion(assetId, db, promoter);

  return lease;
}

export async function deleteAssetLease(assetId: string, leaseId: string, deps?: LeaseBookDeps) {
  const db = deps?.db ?? prisma;
  const promoter = deps?.promoter ?? promoteAssetSnapshotsToFeatures;

  const existing = await db.lease.findUnique({
    where: { id: leaseId }
  });

  if (!existing || existing.assetId !== assetId) {
    throw new Error('Lease not found');
  }

  await db.lease.delete({
    where: { id: leaseId }
  });

  await runPromotion(assetId, db, promoter);

  return { id: leaseId };
}
