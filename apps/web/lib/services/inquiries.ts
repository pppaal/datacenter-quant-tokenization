import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { inquirySchema } from '@/lib/validations/inquiry';

export async function createInquiry(input: unknown, db: Pick<PrismaClient, 'inquiry'> = prisma) {
  const parsed = inquirySchema.parse(input);
  return db.inquiry.create({
    data: parsed
  });
}

export async function listInquiries(db: PrismaClient = prisma) {
  return db.inquiry.findMany({
    include: {
      asset: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}
