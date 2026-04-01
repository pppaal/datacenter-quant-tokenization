import { z } from 'zod';

export const valuationRunSchema = z.object({
  assetId: z.string().min(1),
  runLabel: z.string().trim().min(3).max(100).default('Latest committee scenario')
});

export const valuationApprovalSchema = z.object({
  approvalStatus: z.enum(['PENDING_REVIEW', 'APPROVED', 'CONDITIONAL', 'REJECTED']),
  approvalNotes: z.string().trim().max(2000).optional().or(z.literal(''))
});

export type ValuationRunInput = z.infer<typeof valuationRunSchema>;
export type ValuationApprovalInput = z.infer<typeof valuationApprovalSchema>;
