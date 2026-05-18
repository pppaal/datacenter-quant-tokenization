import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  shortName: z.string().max(80).optional().nullable(),
  hqMarket: z.string().max(8).optional().nullable(),
  aumKrw: z.number().nonnegative().optional().nullable(),
  fundCount: z.number().int().nonnegative().optional().nullable(),
  yearFounded: z.number().int().min(1800).max(3000).optional().nullable(),
  websiteUrl: z.string().url().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

export const GET = withAdminApi({
  requiredRole: 'ANALYST',
  auditAction: 'sponsors.list',
  auditEntityType: 'Sponsor',
  async handler() {
    const rows = await prisma.sponsor.findMany({
      orderBy: { name: 'asc' },
      include: { priorDeals: true }
    });
    return NextResponse.json({ rows });
  }
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: CreateSchema,
  auditAction: 'sponsors.create',
  auditEntityType: 'Sponsor',
  async handler({ body }) {
    const row = await prisma.sponsor.create({
      data: {
        name: body.name,
        shortName: body.shortName ?? null,
        hqMarket: body.hqMarket ?? null,
        aumKrw: body.aumKrw ?? null,
        fundCount: body.fundCount ?? null,
        yearFounded: body.yearFounded ?? null,
        websiteUrl: body.websiteUrl ?? null,
        notes: body.notes ?? null
      }
    });
    return NextResponse.json({ row }, { status: 201 });
  }
});
