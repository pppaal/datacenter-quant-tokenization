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

const observationDateField = z.preprocess((value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }

  return value;
}, z.date());

export const realizedOutcomeSchema = z.object({
  observationDate: observationDateField,
  occupancyPct: optionalNumberField,
  noiKrw: optionalNumberField,
  rentGrowthPct: optionalNumberField,
  valuationKrw: optionalNumberField,
  debtServiceCoverage: optionalNumberField,
  exitCapRatePct: optionalNumberField,
  notes: optionalStringField,
  inputCurrency: z.enum(supportedCurrencies).optional()
});

export type RealizedOutcomeInput = z.infer<typeof realizedOutcomeSchema>;
