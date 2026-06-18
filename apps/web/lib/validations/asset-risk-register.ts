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
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}, z.number().int().optional());

export const riskSeverityValues = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const riskStatusValues = ['OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED'] as const;

const riskSeverity = z.enum(riskSeverityValues);
const riskStatus = z.enum(riskStatusValues);

export const assetRiskRegisterEntrySchema = z.object({
  title: z.string().trim().min(1, 'Risk title is required'),
  category: optionalStringField,
  description: optionalStringField,
  likelihood: riskSeverity.default('MEDIUM'),
  impact: riskSeverity.default('MEDIUM'),
  irrImpactBps: optionalIntField,
  valueImpactKrw: optionalNumberField,
  mitigant: optionalStringField,
  residualLikelihood: riskSeverity.optional(),
  residualImpact: riskSeverity.optional(),
  status: riskStatus.default('OPEN'),
  ownerName: optionalStringField,
  sortOrder: optionalNumberField,
  inputCurrency: z.enum(supportedCurrencies).optional()
});

export type AssetRiskRegisterEntryInput = z.infer<typeof assetRiskRegisterEntrySchema>;
