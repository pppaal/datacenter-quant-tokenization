import { AmortizationProfile, DebtFacilityType } from '@prisma/client';
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

const debtDrawSchema = z
  .object({
    drawYear: optionalIntField,
    drawMonth: optionalIntField,
    amountKrw: optionalNumberField,
    notes: optionalStringField
  })
  .superRefine((value, ctx) => {
    const hasSignal =
      value.drawYear !== undefined ||
      value.drawMonth !== undefined ||
      value.amountKrw !== undefined ||
      value.notes !== undefined;

    if (!hasSignal) return;

    if (value.drawYear === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['drawYear'],
        message: 'Draw year is required.'
      });
    }

    if (value.amountKrw === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountKrw'],
        message: 'Draw amount is required.'
      });
    }

    if (value.drawMonth !== undefined && (value.drawMonth < 1 || value.drawMonth > 12)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['drawMonth'],
        message: 'Draw month must be between 1 and 12.'
      });
    }
  });

export const debtBookInputSchema = z
  .object({
    facilityType: z.nativeEnum(DebtFacilityType).optional(),
    lenderName: optionalStringField,
    commitmentKrw: optionalNumberField,
    drawnAmountKrw: optionalNumberField,
    interestRatePct: optionalNumberField,
    upfrontFeePct: optionalNumberField,
    commitmentFeePct: optionalNumberField,
    gracePeriodMonths: optionalIntField,
    amortizationTermMonths: optionalIntField,
    amortizationProfile: z.nativeEnum(AmortizationProfile).optional(),
    sculptedTargetDscr: optionalNumberField,
    balloonPct: optionalNumberField,
    reserveMonths: optionalNumberField,
    notes: optionalStringField,
    inputCurrency: z.enum(supportedCurrencies).optional(),
    draws: z.array(debtDrawSchema).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.facilityType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['facilityType'],
        message: 'Facility type is required.'
      });
    }

    if (value.commitmentKrw === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['commitmentKrw'],
        message: 'Commitment amount is required.'
      });
    }

    if (value.interestRatePct === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interestRatePct'],
        message: 'Interest rate is required.'
      });
    }
  });

export type DebtBookInput = z.infer<typeof debtBookInputSchema>;
