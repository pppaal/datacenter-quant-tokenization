import { NextResponse } from 'next/server';
import { AssetClass } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';

const ALLOWED_STATUSES = ['ACTIVE', 'SIGNED', 'WITHDRAWN', 'STALLED'] as const;

const CreateSchema = z.object({
  tenantName: z.string().min(1).max(200),
  market: z.string().min(1).max(8),
  region: z.string().max(80).optional().nullable(),
  assetClass: z.nativeEnum(AssetClass).optional().nullable(),
  assetTier: z.string().max(40).optional().nullable(),
  targetSizeSqm: z.number().positive().optional().nullable(),
  targetMoveInDate: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((value) => (value ? new Date(value) : null)),
  status: z.enum(ALLOWED_STATUSES).default('ACTIVE'),
  notes: z.string().max(2000).optional().nullable(),
  source: z.string().max(200).optional().nullable()
});

export const GET = withAdminApi({
  requiredRole: 'ANALYST',
  auditAction: 'research.tenant_demand.list',
  auditEntityType: 'TenantDemand',
  async handler() {
    const rows = await prisma.tenantDemand.findMany({
      orderBy: { observedAt: 'desc' },
      include: {
        recordedBy: { select: { id: true, name: true, email: true } }
      }
    });
    return NextResponse.json({ rows });
  }
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: CreateSchema,
  auditAction: 'research.tenant_demand.create',
  auditEntityType: 'TenantDemand',
  async handler({ body, actor }) {
    const row = await prisma.tenantDemand.create({
      data: {
        tenantName: body.tenantName,
        market: body.market,
        region: body.region ?? null,
        assetClass: body.assetClass ?? null,
        assetTier: body.assetTier ?? null,
        targetSizeSqm: body.targetSizeSqm ?? null,
        targetMoveInDate: body.targetMoveInDate ?? null,
        status: body.status,
        notes: body.notes ?? null,
        source: body.source ?? null,
        recordedById: actor.userId ?? null
      }
    });
    return NextResponse.json({ row }, { status: 201 });
  }
});
