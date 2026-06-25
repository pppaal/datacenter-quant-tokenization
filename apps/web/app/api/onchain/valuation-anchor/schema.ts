import { z } from 'zod';

/**
 * Request schema for the irreversible on-chain valuation anchor.
 *
 * Anchoring writes `keccak256(canonicalize(valuation))` to the registry and
 * cannot be undone. A real valuation snapshot is always structured data — a
 * non-empty object or array — so we reject scalars, `null`/`undefined`, and
 * empty containers (`{}`, `[]`) up front rather than permanently anchoring the
 * hash of a meaningless value. This only TIGHTENS the accepted input; every
 * legitimate valuation payload has at least one field/element.
 */
export const NonEmptyValuationSchema = z
  .union([z.record(z.unknown()), z.array(z.unknown())])
  .refine(
    (value) => (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0),
    'valuation must be a non-empty object or array'
  );

export const ValuationAnchorBodySchema = z.object({
  assetId: z.string().min(1, 'assetId is required'),
  assetCode: z.string().trim().min(1, 'assetCode is required'),
  valuation: NonEmptyValuationSchema,
  label: z.string().trim().max(64).optional()
});

export type ValuationAnchorBody = z.infer<typeof ValuationAnchorBodySchema>;
