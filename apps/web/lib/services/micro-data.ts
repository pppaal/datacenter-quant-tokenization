import {
  AssetClass,
  LeaseStatus,
  ReviewStatus,
  SourceStatus,
  type PrismaClient
} from '@prisma/client';
import { convertToKrw, resolveInputCurrency } from '@/lib/finance/currency';
import { assetBundleInclude } from '@/lib/services/assets';
import { promoteAssetSnapshotsToFeatures } from '@/lib/services/feature-promotion';
import { prisma } from '@/lib/db/prisma';
import { microDataSchema } from '@/lib/validations/micro-data';

type MicroDataDeps = {
  db?: PrismaClient;
  promoter?: typeof promoteAssetSnapshotsToFeatures;
};

export async function updateAssetMicroData(assetId: string, input: unknown, deps?: MicroDataDeps) {
  const db = deps?.db ?? prisma;
  const promoter = deps?.promoter ?? promoteAssetSnapshotsToFeatures;
  const parsed = microDataSchema.parse(input);

  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: {
      address: true,
      energySnapshot: true,
      permitSnapshot: true,
      ownershipRecords: {
        orderBy: {
          effectiveDate: 'desc'
        },
        take: 1
      },
      encumbranceRecords: {
        orderBy: {
          effectiveDate: 'desc'
        },
        take: 1
      },
      planningConstraints: {
        orderBy: {
          updatedAt: 'desc'
        },
        take: 1
      },
      leases: {
        orderBy: {
          startYear: 'asc'
        },
        take: 1
      }
    }
  });

  if (!asset) throw new Error('Asset not found');

  const inputCurrency = resolveInputCurrency(
    asset.address?.country ?? asset.market,
    parsed.inputCurrency
  );
  const normalized = {
    ...parsed,
    tariffKrwPerKwh:
      typeof parsed.tariffKrwPerKwh === 'number'
        ? convertToKrw(parsed.tariffKrwPerKwh, inputCurrency)
        : undefined,
    baseRatePerKwKrw:
      typeof parsed.baseRatePerKwKrw === 'number'
        ? convertToKrw(parsed.baseRatePerKwKrw, inputCurrency)
        : undefined,
    fitOutCostKrw:
      typeof parsed.fitOutCostKrw === 'number'
        ? convertToKrw(parsed.fitOutCostKrw, inputCurrency)
        : undefined,
    securedAmountKrw:
      typeof parsed.securedAmountKrw === 'number'
        ? convertToKrw(parsed.securedAmountKrw, inputCurrency)
        : undefined
  };

  const hasEnergySignal =
    normalized.utilityName !== undefined ||
    normalized.substationDistanceKm !== undefined ||
    normalized.tariffKrwPerKwh !== undefined ||
    normalized.renewableAvailabilityPct !== undefined ||
    normalized.pueTarget !== undefined ||
    normalized.backupFuelHours !== undefined;

  const hasPermitSignal =
    normalized.permitStage !== undefined ||
    normalized.zoningApprovalStatus !== undefined ||
    normalized.environmentalReviewStatus !== undefined ||
    normalized.powerApprovalStatus !== undefined ||
    normalized.timelineNotes !== undefined;

  const hasLeaseSignal =
    normalized.tenantName !== undefined ||
    normalized.leaseStatus !== undefined ||
    normalized.leasedKw !== undefined ||
    normalized.startYear !== undefined ||
    normalized.termYears !== undefined ||
    normalized.baseRatePerKwKrw !== undefined ||
    normalized.annualEscalationPct !== undefined ||
    normalized.probabilityPct !== undefined ||
    normalized.renewProbabilityPct !== undefined ||
    normalized.downtimeMonths !== undefined ||
    normalized.fitOutCostKrw !== undefined ||
    normalized.leaseNotes !== undefined;

  const sourceUpdatedAt = new Date();
  const primaryLease = asset.leases[0];
  const ownershipRecord = asset.ownershipRecords[0];
  const encumbranceRecord = asset.encumbranceRecords[0];
  const planningConstraint = asset.planningConstraints[0];

  const hasOwnershipSignal =
    normalized.legalOwnerName !== undefined ||
    normalized.legalOwnerEntityType !== undefined ||
    normalized.ownershipPct !== undefined;

  const hasEncumbranceSignal =
    normalized.encumbranceType !== undefined ||
    normalized.encumbranceHolderName !== undefined ||
    normalized.securedAmountKrw !== undefined ||
    normalized.priorityRank !== undefined ||
    normalized.encumbranceStatus !== undefined;

  const hasPlanningSignal =
    normalized.planningConstraintType !== undefined ||
    normalized.planningConstraintTitle !== undefined ||
    normalized.planningConstraintSeverity !== undefined ||
    normalized.planningConstraintDescription !== undefined;

  const result = await db.asset.update({
    where: { id: assetId },
    data: {
      ownerName: parsed.legalOwnerName ?? undefined,
      dataCenterDetail:
        asset.assetClass === AssetClass.DATA_CENTER &&
        (normalized.utilityName !== undefined ||
          normalized.substationDistanceKm !== undefined ||
          normalized.pueTarget !== undefined)
          ? {
              upsert: {
                update: {
                  utilityName: normalized.utilityName,
                  substationDistanceKm: normalized.substationDistanceKm,
                  pueTarget: normalized.pueTarget
                },
                create: {
                  powerCapacityMw: asset.powerCapacityMw,
                  targetItLoadMw: asset.targetItLoadMw,
                  utilityName: normalized.utilityName,
                  substationDistanceKm: normalized.substationDistanceKm,
                  pueTarget: normalized.pueTarget,
                  fiberAccess: 'Pending micro data review',
                  latencyProfile: 'Pending micro data review'
                }
              }
            }
          : undefined,
      energySnapshot: hasEnergySignal
        ? {
            upsert: {
              update: {
                utilityName:
                  normalized.utilityName ??
                  asset.energySnapshot?.utilityName ??
                  'Pending manual review',
                substationDistanceKm:
                  normalized.substationDistanceKm ??
                  asset.energySnapshot?.substationDistanceKm ??
                  null,
                tariffKrwPerKwh:
                  normalized.tariffKrwPerKwh ?? asset.energySnapshot?.tariffKrwPerKwh ?? null,
                renewableAvailabilityPct:
                  normalized.renewableAvailabilityPct ??
                  asset.energySnapshot?.renewableAvailabilityPct ??
                  null,
                pueTarget: normalized.pueTarget ?? asset.energySnapshot?.pueTarget ?? null,
                backupFuelHours:
                  normalized.backupFuelHours ?? asset.energySnapshot?.backupFuelHours ?? null,
                reviewStatus: ReviewStatus.PENDING,
                reviewedAt: null,
                reviewedById: null,
                reviewNotes: null,
                sourceStatus: SourceStatus.MANUAL,
                sourceUpdatedAt
              },
              create: {
                utilityName: normalized.utilityName ?? 'Pending manual review',
                substationDistanceKm: normalized.substationDistanceKm,
                tariffKrwPerKwh: normalized.tariffKrwPerKwh,
                renewableAvailabilityPct: normalized.renewableAvailabilityPct,
                pueTarget: normalized.pueTarget,
                backupFuelHours: normalized.backupFuelHours,
                reviewStatus: ReviewStatus.PENDING,
                sourceStatus: SourceStatus.MANUAL,
                sourceUpdatedAt
              }
            }
          }
        : undefined,
      permitSnapshot: hasPermitSignal
        ? {
            upsert: {
              update: {
                permitStage:
                  normalized.permitStage ??
                  asset.permitSnapshot?.permitStage ??
                  'Pending manual review',
                zoningApprovalStatus:
                  normalized.zoningApprovalStatus ??
                  asset.permitSnapshot?.zoningApprovalStatus ??
                  'Pending review',
                environmentalReviewStatus:
                  normalized.environmentalReviewStatus ??
                  asset.permitSnapshot?.environmentalReviewStatus ??
                  'Pending review',
                powerApprovalStatus:
                  normalized.powerApprovalStatus ??
                  asset.permitSnapshot?.powerApprovalStatus ??
                  'Pending review',
                timelineNotes:
                  normalized.timelineNotes ??
                  asset.permitSnapshot?.timelineNotes ??
                  'Pending review',
                reviewStatus: ReviewStatus.PENDING,
                reviewedAt: null,
                reviewedById: null,
                reviewNotes: null,
                sourceStatus: SourceStatus.MANUAL,
                sourceUpdatedAt
              },
              create: {
                permitStage: normalized.permitStage ?? 'Pending manual review',
                zoningApprovalStatus: normalized.zoningApprovalStatus ?? 'Pending review',
                environmentalReviewStatus: normalized.environmentalReviewStatus ?? 'Pending review',
                powerApprovalStatus: normalized.powerApprovalStatus ?? 'Pending review',
                timelineNotes: normalized.timelineNotes ?? 'Pending review',
                reviewStatus: ReviewStatus.PENDING,
                sourceStatus: SourceStatus.MANUAL,
                sourceUpdatedAt
              }
            }
          }
        : undefined,
      ownershipRecords: hasOwnershipSignal
        ? ownershipRecord
          ? {
              update: {
                where: { id: ownershipRecord.id },
                data: {
                  ownerName: normalized.legalOwnerName ?? ownershipRecord.ownerName,
                  entityType: normalized.legalOwnerEntityType ?? ownershipRecord.entityType,
                  ownershipPct: normalized.ownershipPct ?? ownershipRecord.ownershipPct,
                  reviewStatus: ReviewStatus.PENDING,
                  reviewedAt: null,
                  reviewedById: null,
                  reviewNotes: null,
                  sourceSystem: 'manual_micro_capture',
                  sourceStatus: SourceStatus.MANUAL,
                  sourceUpdatedAt
                }
              }
            }
          : {
              create: {
                ownerName: normalized.legalOwnerName ?? 'Pending legal review',
                entityType: normalized.legalOwnerEntityType,
                ownershipPct: normalized.ownershipPct,
                reviewStatus: ReviewStatus.PENDING,
                sourceSystem: 'manual_micro_capture',
                sourceStatus: SourceStatus.MANUAL,
                sourceUpdatedAt
              }
            }
        : undefined,
      encumbranceRecords: hasEncumbranceSignal
        ? encumbranceRecord
          ? {
              update: {
                where: { id: encumbranceRecord.id },
                data: {
                  encumbranceType: normalized.encumbranceType ?? encumbranceRecord.encumbranceType,
                  holderName: normalized.encumbranceHolderName ?? encumbranceRecord.holderName,
                  securedAmountKrw:
                    normalized.securedAmountKrw ?? encumbranceRecord.securedAmountKrw,
                  priorityRank: normalized.priorityRank ?? encumbranceRecord.priorityRank,
                  statusLabel: normalized.encumbranceStatus ?? encumbranceRecord.statusLabel,
                  reviewStatus: ReviewStatus.PENDING,
                  reviewedAt: null,
                  reviewedById: null,
                  reviewNotes: null,
                  sourceSystem: 'manual_micro_capture',
                  sourceStatus: SourceStatus.MANUAL,
                  sourceUpdatedAt
                }
              }
            }
          : {
              create: {
                encumbranceType: normalized.encumbranceType ?? 'Pending legal review',
                holderName: normalized.encumbranceHolderName,
                securedAmountKrw: normalized.securedAmountKrw,
                priorityRank: normalized.priorityRank,
                statusLabel: normalized.encumbranceStatus,
                reviewStatus: ReviewStatus.PENDING,
                sourceSystem: 'manual_micro_capture',
                sourceStatus: SourceStatus.MANUAL,
                sourceUpdatedAt
              }
            }
        : undefined,
      planningConstraints: hasPlanningSignal
        ? planningConstraint
          ? {
              update: {
                where: { id: planningConstraint.id },
                data: {
                  constraintType:
                    normalized.planningConstraintType ?? planningConstraint.constraintType,
                  title: normalized.planningConstraintTitle ?? planningConstraint.title,
                  severity: normalized.planningConstraintSeverity ?? planningConstraint.severity,
                  description:
                    normalized.planningConstraintDescription ?? planningConstraint.description,
                  reviewStatus: ReviewStatus.PENDING,
                  reviewedAt: null,
                  reviewedById: null,
                  reviewNotes: null,
                  sourceSystem: 'manual_micro_capture',
                  sourceStatus: SourceStatus.MANUAL,
                  sourceUpdatedAt
                }
              }
            }
          : {
              create: {
                constraintType: normalized.planningConstraintType ?? 'Pending legal review',
                title: normalized.planningConstraintTitle ?? 'Pending legal review',
                severity: normalized.planningConstraintSeverity,
                description: normalized.planningConstraintDescription,
                reviewStatus: ReviewStatus.PENDING,
                sourceSystem: 'manual_micro_capture',
                sourceStatus: SourceStatus.MANUAL,
                sourceUpdatedAt
              }
            }
        : undefined,
      leases: hasLeaseSignal
        ? primaryLease
          ? {
              update: {
                where: { id: primaryLease.id },
                data: {
                  tenantName: normalized.tenantName ?? primaryLease.tenantName,
                  status: normalized.leaseStatus ?? primaryLease.status,
                  leasedKw: normalized.leasedKw ?? primaryLease.leasedKw,
                  startYear: normalized.startYear ?? primaryLease.startYear,
                  termYears: normalized.termYears ?? primaryLease.termYears,
                  baseRatePerKwKrw: normalized.baseRatePerKwKrw ?? primaryLease.baseRatePerKwKrw,
                  annualEscalationPct:
                    normalized.annualEscalationPct ?? primaryLease.annualEscalationPct,
                  probabilityPct: normalized.probabilityPct ?? primaryLease.probabilityPct,
                  renewProbabilityPct:
                    normalized.renewProbabilityPct ?? primaryLease.renewProbabilityPct,
                  downtimeMonths: normalized.downtimeMonths ?? primaryLease.downtimeMonths,
                  fitOutCostKrw: normalized.fitOutCostKrw ?? primaryLease.fitOutCostKrw,
                  notes: normalized.leaseNotes ?? primaryLease.notes,
                  reviewStatus: ReviewStatus.PENDING,
                  reviewedAt: null,
                  reviewedById: null,
                  reviewNotes: null
                }
              }
            }
          : {
              create: {
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
                fitOutCostKrw: normalized.fitOutCostKrw,
                notes: normalized.leaseNotes,
                reviewStatus: ReviewStatus.PENDING
              }
            }
        : undefined
    },
    include: assetBundleInclude
  });

  try {
    await promoter(assetId, db);
  } catch {
    // Micro data capture should persist even if feature promotion sidecar work fails.
  }

  return result;
}
