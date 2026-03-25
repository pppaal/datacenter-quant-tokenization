import { DocumentType } from '@prisma/client';
import { z } from 'zod';

const optionalString = z
  .union([z.string().trim(), z.literal(''), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value : undefined));

export const documentUploadSchema = z.object({
  assetId: z.string().min(1),
  documentId: optionalString,
  title: z.string().trim().min(3).max(140),
  documentType: z.nativeEnum(DocumentType).default(DocumentType.OTHER),
  sourceLink: optionalString,
  extractedText: optionalString,
  uploadedById: optionalString
});

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
