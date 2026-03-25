import { z } from 'zod';

export const valuationRunSchema = z.object({
  assetId: z.string().min(1),
  runLabel: z.string().trim().min(3).max(100).default('Latest committee scenario')
});

export type ValuationRunInput = z.infer<typeof valuationRunSchema>;
