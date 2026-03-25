import { LeaseStatus } from '@prisma/client';
import { z } from 'zod';
import { supportedCurrencies } from '@/lib/finance/currency';

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const optionalStringField = z.preprocess(emptyStringToUndefined, z.string().trim().optional());

const optionalNumberField = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return value;
}, z.number().optional());

const optionalIntField = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  return value;
}, z.number().int().optional());

export const microDataSchema = z
  .object({
    utilityName: optionalStringField,
    substationDistanceKm: optionalNumberField,
    tariffKrwPerKwh: optionalNumberField,
    renewableAvailabilityPct: optionalNumberField,
    pueTarget: optionalNumberField,
    backupFuelHours: optionalNumberField,
    permitStage: optionalStringField,
    zoningApprovalStatus: optionalStringField,
    environmentalReviewStatus: optionalStringField,
    powerApprovalStatus: optionalStringField,
    timelineNotes: optionalStringField,
    legalOwnerName: optionalStringField,
    legalOwnerEntityType: optionalStringField,
    ownershipPct: optionalNumberField,
    encumbranceType: optionalStringField,
    encumbranceHolderName: optionalStringField,
    securedAmountKrw: optionalNumberField,
    priorityRank: optionalIntField,
    encumbranceStatus: optionalStringField,
    planningConstraintType: optionalStringField,
    planningConstraintTitle: optionalStringField,
    planningConstraintSeverity: optionalStringField,
    planningConstraintDescription: optionalStringField,
    tenantName: optionalStringField,
    leaseStatus: z.nativeEnum(LeaseStatus).optional(),
    leasedKw: optionalNumberField,
    startYear: optionalIntField,
    termYears: optionalIntField,
    baseRatePerKwKrw: optionalNumberField,
    annualEscalationPct: optionalNumberField,
    probabilityPct: optionalNumberField,
    renewProbabilityPct: optionalNumberField,
    downtimeMonths: optionalIntField,
    fitOutCostKrw: optionalNumberField,
    inputCurrency: z.enum(supportedCurrencies).optional(),
    leaseNotes: optionalStringField
  })
  .superRefine((value, ctx) => {
    const hasOwnershipSignal =
      value.legalOwnerName !== undefined ||
      value.legalOwnerEntityType !== undefined ||
      value.ownershipPct !== undefined;

    if (hasOwnershipSignal && !value.legalOwnerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['legalOwnerName'],
        message: 'Owner name is required when saving ownership micro data.'
      });
    }

    const hasEncumbranceSignal =
      value.encumbranceType !== undefined ||
      value.encumbranceHolderName !== undefined ||
      value.securedAmountKrw !== undefined ||
      value.priorityRank !== undefined ||
      value.encumbranceStatus !== undefined;

    if (hasEncumbranceSignal && !value.encumbranceType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['encumbranceType'],
        message: 'Encumbrance type is required when saving encumbrance micro data.'
      });
    }

    const hasPlanningSignal =
      value.planningConstraintType !== undefined ||
      value.planningConstraintTitle !== undefined ||
      value.planningConstraintSeverity !== undefined ||
      value.planningConstraintDescription !== undefined;

    if (hasPlanningSignal && !value.planningConstraintType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['planningConstraintType'],
        message: 'Constraint type is required when saving planning micro data.'
      });
    }

    if (hasPlanningSignal && !value.planningConstraintTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['planningConstraintTitle'],
        message: 'Constraint title is required when saving planning micro data.'
      });
    }

    const hasLeaseSignal =
      value.tenantName !== undefined ||
      value.leaseStatus !== undefined ||
      value.leasedKw !== undefined ||
      value.startYear !== undefined ||
      value.termYears !== undefined ||
      value.baseRatePerKwKrw !== undefined ||
      value.annualEscalationPct !== undefined ||
      value.probabilityPct !== undefined ||
      value.renewProbabilityPct !== undefined ||
      value.downtimeMonths !== undefined ||
      value.fitOutCostKrw !== undefined ||
      value.leaseNotes !== undefined;

    if (!hasLeaseSignal) return;

    if (!value.tenantName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenantName'],
        message: 'Tenant name is required when saving lease micro data.'
      });
    }

    if (value.leasedKw === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['leasedKw'],
        message: 'Leased kW is required when saving lease micro data.'
      });
    }

    if (value.termYears === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['termYears'],
        message: 'Lease term is required when saving lease micro data.'
      });
    }

    if (value.baseRatePerKwKrw === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseRatePerKwKrw'],
        message: 'Base rate per kW is required when saving lease micro data.'
      });
    }
  });

export type MicroDataInput = z.infer<typeof microDataSchema>;
