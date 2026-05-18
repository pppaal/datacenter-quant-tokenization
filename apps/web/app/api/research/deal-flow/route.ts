import { NextResponse } from 'next/server';
import { AssetClass } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';

const ALLOWED_TYPES = ['SALE', 'REFINANCE', 'JV', 'RECAP', 'CAPEX_LOAN', 'DEVELOPMENT'] as const;
const ALLOWED_STATUSES = ['LIVE', 'CLOSED', 'WITHDRAWN', 'LOST'] as const;

const CreateSchema = z.object({
  market: z.string().min(1).max(8),
  region: z.string().max(80).optional().nullable(),
  assetClass: z.nativeEnum(AssetClass).optional().nullable(),
  assetTier: z.string().max(40).optional().nullable(),
  dealType: z.enum(ALLOWED_TYPES),
  status: z.enum(ALLOWED_STATUSES).default('LIVE'),
  assetName: z.string().max(200).optional().nullable(),
  estimatedSizeKrw: z.number().nonnegative().optional().nullable(),
  estimatedCapPct: z.number().min(0).max(100).optional().nullable(),
  sponsor: z.string().max(200).optional().nullable(),
  brokerSource: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

export const GET = withAdminApi({
  requiredRole: 'ANALYST',
  auditAction: 'research.deal_flow.list',
  auditEntityType: 'DealFlowEntry',
  async handler() {
    const rows = await prisma.dealFlowEntry.findMany({
      orderBy: [{ status: 'asc' }, { observedAt: 'desc' }],
      include: { recordedBy: { select: { id: true, name: true, email: true } } }
    });
    return NextResponse.json({ rows });
  }
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: CreateSchema,
  auditAction: 'research.deal_flow.create',
  auditEntityType: 'DealFlowEntry',
  async handler({ body, actor }) {
    const row = await prisma.dealFlowEntry.create({
      data: {
        market: body.market,
        region: body.region ?? null,
        assetClass: body.assetClass ?? null,
        assetTier: body.assetTier ?? null,
        dealType: body.dealType,
        status: body.status,
        assetName: body.assetName ?? null,
        estimatedSizeKrw: body.estimatedSizeKrw ?? null,
        estimatedCapPct: body.estimatedCapPct ?? null,
        sponsor: body.sponsor ?? null,
        brokerSource: body.brokerSource ?? null,
        notes: body.notes ?? null,
        recordedById: actor.userId ?? null
      }
    });
    return NextResponse.json({ row }, { status: 201 });
  }
});
