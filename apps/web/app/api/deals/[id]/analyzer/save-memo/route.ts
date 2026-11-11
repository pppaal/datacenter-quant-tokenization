/**
 * POST /api/deals/:id/analyzer/save-memo  { spec: 'prememo' | 'icmemo' }
 *
 * Copies the analyzer's memo draft (docx) into the deal's asset documents as a
 * versioned REPORT, so it is reviewed alongside the deal's other documents in
 * the IC packet. Static segment: takes precedence over the analyzer proxy's
 * catch-all route.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAccessScopeType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertActorScopeAccess } from '@/lib/security/admin-access';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { AnalyzerConfigurationError, AnalyzerRequestError } from '@/lib/services/analyzer';
import { AnalyzerMemoError, saveAnalyzerMemoAsDocument } from '@/lib/services/analyzer-memo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SaveMemoBody = z.object({ spec: z.enum(['prememo', 'icmemo']).default('prememo') });

export const POST = withAdminApi<typeof SaveMemoBody, { id: string }>({
  requiredRole: 'ANALYST',
  bodySchema: SaveMemoBody,
  auditAction: 'deal.analyzer.memo_saved',
  auditEntityType: 'deal',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ actor, params, requestId, body }) {
    const headers = { 'X-Request-Id': requestId };
    try {
      await assertActorScopeAccess(actor, AdminAccessScopeType.DEAL, params.id, prisma, 'mutation');
    } catch {
      return NextResponse.json({ error: 'Deal access denied.' }, { status: 403, headers });
    }
    try {
      const result = await saveAnalyzerMemoAsDocument({
        dealId: params.id,
        spec: body?.spec ?? 'prememo',
        operator: { identifier: actor.identifier, role: actor.role },
        uploadedById: actor.userId ?? null
      });
      return NextResponse.json(result, { status: 201, headers });
    } catch (error) {
      if (error instanceof AnalyzerConfigurationError) {
        return NextResponse.json(
          { error: 'Analyzer service is not configured.', configured: false },
          { status: 503, headers }
        );
      }
      if (error instanceof AnalyzerMemoError) {
        return NextResponse.json({ error: error.message }, { status: error.status, headers });
      }
      if (error instanceof AnalyzerRequestError) {
        return NextResponse.json(
          { error: 'Analyzer request failed.', upstreamStatus: error.status },
          { status: 502, headers }
        );
      }
      throw error;
    }
  }
});
