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

const leaseStepSchema = z
  .object({
    startYear: optionalIntField,
    endYear: optionalIntField,
    ratePerKwKrw: optionalNumberField,
    leasedKw: optionalNumberField,
    annualEscalationPct: optionalNumberField,
    occupancyPct: optionalNumberField,
    rentFreeMonths: optionalIntField,
    renewProbabilityPct: optionalNumberField,
    rolloverDowntimeMonths: optionalIntField,
    renewalRentFreeMonths: optionalIntField,
    renewalTermYears: optionalIntField,
    renewalCount: optionalIntField,
    markToMarketRatePerKwKrw: optionalNumberField,
    renewalTenantImprovementKrw: optionalNumberField,
    renewalLeasingCommissionKrw: optionalNumberField,
    tenantImprovementKrw: optionalNumberField,
    leasingCommissionKrw: optionalNumberField,
    recoverableOpexRatioPct: optionalNumberField,
    fixedRecoveriesKrw: optionalNumberField,
    expenseStopKrwPerKwMonth: optionalNumberField,
    utilityPassThroughPct: optionalNumberField,
    notes: optionalStringField
  })
  .superRefine((value, ctx) => {
    const hasSignal =
      value.startYear !== undefined ||
      value.endYear !== undefined ||
      value.ratePerKwKrw !== undefined ||
      value.leasedKw !== undefined ||
      value.annualEscalationPct !== undefined ||
      value.occupancyPct !== undefined ||
      value.rentFreeMonths !== undefined ||
      value.renewProbabilityPct !== undefined ||
      value.rolloverDowntimeMonths !== undefined ||
      value.renewalRentFreeMonths !== undefined ||
      value.renewalTermYears !== undefined ||
      value.renewalCount !== undefined ||
      value.markToMarketRatePerKwKrw !== undefined ||
      value.renewalTenantImprovementKrw !== undefined ||
      value.renewalLeasingCommissionKrw !== undefined ||
      value.tenantImprovementKrw !== undefined ||
      value.leasingCommissionKrw !== undefined ||
      value.recoverableOpexRatioPct !== undefined ||
      value.fixedRecoveriesKrw !== undefined ||
      value.expenseStopKrwPerKwMonth !== undefined ||
      value.utilityPassThroughPct !== undefined ||
      value.notes !== undefined;

    if (!hasSignal) return;

    if (value.startYear === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startYear'],
        message: 'Step start year is required.'
      });
    }

    if (value.endYear === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endYear'],
        message: 'Step end year is required.'
      });
    }

    if (value.ratePerKwKrw === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ratePerKwKrw'],
        message: 'Step rate per kW is required.'
      });
    }

    if (
      value.startYear !== undefined &&
      value.endYear !== undefined &&
      value.endYear < value.startYear
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endYear'],
        message: 'Step end year must be greater than or equal to start year.'
      });
    }
  });

export const leaseBookInputSchema = z
  .object({
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
    rolloverDowntimeMonths: optionalIntField,
    renewalRentFreeMonths: optionalIntField,
    renewalTermYears: optionalIntField,
    renewalCount: optionalIntField,
    rentFreeMonths: optionalIntField,
    markToMarketRatePerKwKrw: optionalNumberField,
    renewalTenantImprovementKrw: optionalNumberField,
    renewalLeasingCommissionKrw: optionalNumberField,
    tenantImprovementKrw: optionalNumberField,
    leasingCommissionKrw: optionalNumberField,
    recoverableOpexRatioPct: optionalNumberField,
    fixedRecoveriesKrw: optionalNumberField,
    expenseStopKrwPerKwMonth: optionalNumberField,
    utilityPassThroughPct: optionalNumberField,
    fitOutCostKrw: optionalNumberField,
    inputCurrency: z.enum(supportedCurrencies).optional(),
    leaseNotes: optionalStringField,
    steps: z.array(leaseStepSchema).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.tenantName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenantName'],
        message: 'Tenant name is required.'
      });
    }

    if (value.leasedKw === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['leasedKw'],
        message: 'Leased kW is required.'
      });
    }

    if (value.termYears === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['termYears'],
        message: 'Lease term is required.'
      });
    }

    if (value.baseRatePerKwKrw === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseRatePerKwKrw'],
        message: 'Base rate per kW is required.'
      });
    }
  });

export type LeaseBookInput = z.infer<typeof leaseBookInputSchema>;
