import { AssetStage } from '@prisma/client';
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

export const comparableBookInputSchema = z
  .object({
    setName: optionalStringField,
    setNotes: optionalStringField,
    label: optionalStringField,
    location: optionalStringField,
    assetType: optionalStringField,
    stage: z.nativeEnum(AssetStage).optional(),
    sourceLink: optionalStringField,
    powerCapacityMw: optionalNumberField,
    grossFloorAreaSqm: optionalNumberField,
    occupancyPct: optionalNumberField,
    valuationKrw: optionalNumberField,
    pricePerMwKrw: optionalNumberField,
    monthlyRatePerKwKrw: optionalNumberField,
    capRatePct: optionalNumberField,
    discountRatePct: optionalNumberField,
    weightPct: optionalNumberField,
    notes: optionalStringField,
    inputCurrency: z.enum(supportedCurrencies).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.label) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['label'],
        message: 'Comparable label is required.'
      });
    }

    if (!value.location) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['location'],
        message: 'Location is required.'
      });
    }

    if (!value.assetType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assetType'],
        message: 'Asset type is required.'
      });
    }

    if (
      value.valuationKrw === undefined &&
      value.pricePerMwKrw === undefined &&
      value.monthlyRatePerKwKrw === undefined &&
      value.capRatePct === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valuationKrw'],
        message: 'At least one pricing signal is required.'
      });
    }
  });

export type ComparableBookInput = z.infer<typeof comparableBookInputSchema>;
