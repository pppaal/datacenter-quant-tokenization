import { CapexCategory } from '@prisma/client';
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

const booleanField = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return false;
}, z.boolean());

export const capexBookInputSchema = z
  .object({
    category: z.nativeEnum(CapexCategory).optional(),
    label: optionalStringField,
    amountKrw: optionalNumberField,
    spendYear: optionalIntField,
    isEmbedded: booleanField.default(false),
    notes: optionalStringField,
    inputCurrency: z.enum(supportedCurrencies).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message: 'CAPEX category is required.'
      });
    }

    if (!value.label) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['label'],
        message: 'Line-item label is required.'
      });
    }

    if (value.amountKrw === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountKrw'],
        message: 'Amount is required.'
      });
    }
  });

export type CapexBookInput = z.infer<typeof capexBookInputSchema>;
