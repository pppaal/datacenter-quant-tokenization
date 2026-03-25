import { z } from 'zod';

export const assetSchema = z.object({
  name: z.string().min(3),
  slug: z.string().min(3),
  assetType: z.string().min(2),
  country: z.string().min(2),
  city: z.string().min(2),
  address: z.string().min(3),
  status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED']),
  description: z.string().min(10),
  summary: z.string().min(10),
  powerCapacityMw: z.coerce.number().positive(),
  landArea: z.coerce.number().positive(),
  grossFloorArea: z.coerce.number().positive(),
  tenantStatus: z.string().min(2),
  capex: z.coerce.number().nonnegative(),
  opex: z.coerce.number().nonnegative(),
  expectedIrr: z.coerce.number().nonnegative(),
  targetEquity: z.coerce.number().nonnegative(),
  debtStructure: z.string().min(2),
  riskNotes: z.string().min(5),
  isPublished: z.coerce.boolean().default(false),
  isSample: z.coerce.boolean().default(true)
});

export const inquirySchema = z.object({
  assetId: z.string().optional(),
  name: z.string().min(2),
  company: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  investorType: z.string().min(2),
  ticketSize: z.string().min(1),
  message: z.string().min(10)
});

export const uploadSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().min(2),
  fileUrl: z.string().url(),
  fileType: z.string().min(2),
  visibility: z.enum(['public', 'admin'])
});

export const aiRequestSchema = z.object({
  assetId: z.string().min(1),
  reportType: z.string().default('investment_memo')
});
