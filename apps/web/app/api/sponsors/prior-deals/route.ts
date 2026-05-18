import { NextResponse } from 'next/server';
import { AssetClass } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';

const STATUSES = ['LIVE', 'EXITED', 'WRITE_DOWN', 'WORKING_OUT'] as const;

const CreateSchema = z.object({
  sponsorId: z.string().min(1),
  dealName: z.string().min(1).max(200),
  vintageYear: z.number().int().min(1900).max(3000),
  exitYear: z.number().int().min(1900).max(3000).optional().nullable(),
  assetClass: z.nativeEnum(AssetClass).optional().nullable(),
  market: z.string().max(8).optional().nullable(),
  equityKrw: z.number().nonnegative().optional().nullable(),
  equityMultiple: z.number().nonnegative().optional().nullable(),
  grossIrrPct: z.number().min(-100).max(1000).optional().nullable(),
  status: z.enum(STATUSES).default('EXITED'),
  notes: z.string().max(2000).optional().nullable()
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: CreateSchema,
  auditAction: 'sponsors.prior_deal.create',
  auditEntityType: 'SponsorPriorDeal',
  async handler({ body }) {
    const row = await prisma.sponsorPriorDeal.create({
      data: {
        sponsorId: body.sponsorId,
        dealName: body.dealName,
        vintageYear: body.vintageYear,
        exitYear: body.exitYear ?? null,
        assetClass: body.assetClass ?? null,
        market: body.market ?? null,
        equityKrw: body.equityKrw ?? null,
        equityMultiple: body.equityMultiple ?? null,
        grossIrrPct: body.grossIrrPct ?? null,
        status: body.status,
        notes: body.notes ?? null
      }
    });
    return NextResponse.json({ row }, { status: 201 });
  }
});
