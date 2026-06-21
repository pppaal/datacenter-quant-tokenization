/**
 * POST /api/admin/financial-notes — create or update a financial note (주석).
 * Scoped to a fund OR an asset (exactly one). Update path keyed by `id`.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { upsertFinancialNote } from '@/lib/services/financial-notes';

export const dynamic = 'force-dynamic';

const BodySchema = z
  .object({
    id: z.string().min(1).optional(),
    fundId: z.string().min(1).optional(),
    assetId: z.string().min(1).optional(),
    noteKey: z.string().min(1).max(60),
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(8000),
    orderIndex: z.number().int().min(0).max(999).optional()
  })
  .refine((b) => Boolean(b.fundId) !== Boolean(b.assetId), {
    message: 'Provide exactly one of fundId / assetId.'
  });

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: BodySchema,
  auditAction: 'financial_note.upsert',
  auditEntityType: 'FinancialNote',
  async handler({ body }) {
    const scope = body.fundId ? { fundId: body.fundId } : { assetId: body.assetId! };
    const note = await upsertFinancialNote({
      id: body.id,
      scope,
      noteKey: body.noteKey,
      title: body.title,
      body: body.body,
      orderIndex: body.orderIndex
    });
    return NextResponse.json({ note });
  }
});
