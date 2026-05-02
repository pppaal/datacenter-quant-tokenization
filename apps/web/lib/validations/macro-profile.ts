import { AssetClass } from '@prisma/client';
import { z } from 'zod';

const optionalMultiplier = z.coerce.number().min(0.5).max(1.75).optional().nullable();

export const macroProfileOverrideSchema = z
  .object({
    assetClass: z.nativeEnum(AssetClass).optional().nullable(),
    country: z
      .string()
      .trim()
      .max(12)
      .optional()
      .nullable()
      .transform((value) => (value ? value.toUpperCase() : null)),
    submarketPattern: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null))
      .refine((value) => {
        if (!value) return true;
        try {
          void new RegExp(value, 'i');
          return true;
        } catch {
          return false;
        }
      }, 'Submarket pattern must be a valid regex'),
    label: z.string().trim().min(3).max(120),
    capitalRateMultiplier: optionalMultiplier,
    liquidityMultiplier: optionalMultiplier,
    leasingMultiplier: optionalMultiplier,
    constructionMultiplier: optionalMultiplier,
    priority: z.coerce.number().int().min(1).max(1000).default(100),
    isActive: z.coerce.boolean().default(true),
    notes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null))
  })
  .refine(
    (value) =>
      value.country !== null || value.submarketPattern !== null || value.assetClass !== null,
    'At least one scope field is required'
  );

export type MacroProfileOverrideInput = z.infer<typeof macroProfileOverrideSchema>;
