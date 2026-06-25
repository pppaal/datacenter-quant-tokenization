import { z } from 'zod';

export const inquirySchema = z
  .object({
    // Bounded: an asset id is a cuid (~25 chars). Cap it so an unauthenticated
    // POST cannot push an unbounded string into the DB column.
    assetId: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(2).max(100),
    company: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    requestType: z.string().trim().min(2).max(80),
    message: z.string().trim().min(20).max(1200)
  })
  // Reject unknown keys: this is the public-facing contact form, so silently
  // accepting extra fields invites payload-stuffing / mass-assignment probing.
  .strict();

export type InquiryInput = z.infer<typeof inquirySchema>;
