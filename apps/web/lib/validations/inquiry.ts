import { z } from 'zod';

export const inquirySchema = z.object({
  assetId: z.string().optional(),
  name: z.string().trim().min(2).max(100),
  company: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  requestType: z.string().trim().min(2).max(80),
  message: z.string().trim().min(20).max(1200)
});

export type InquiryInput = z.infer<typeof inquirySchema>;
