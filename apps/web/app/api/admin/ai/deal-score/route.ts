import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { OpenAIConfigurationError, scoreDeal } from '@/lib/services/ai-assistant';

const DealScoreSchema = z.object({
  dealId: z.string().trim().min(1)
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: DealScoreSchema,
  auditAction: 'ai.deal.score',
  auditEntityType: 'Deal',
  auditEntityIdFromBody: (body) => body.dealId,
  async handler({ body, requestId }) {
    try {
      const result = await scoreDeal(body.dealId, prisma);
      return NextResponse.json(result);
    } catch (error) {
      // OpenAIConfigurationError is a known operator-facing config signal
      // (503); its message is safe to surface. Everything else is unexpected
      // and is rethrown so `withAdminApi` genericizes it (generic message +
      // requestId) instead of leaking raw/Prisma internals to the client.
      if (error instanceof OpenAIConfigurationError) {
        return NextResponse.json(
          { error: error.message },
          { status: 503, headers: { 'X-Request-Id': requestId } }
        );
      }
      throw error;
    }
  }
});
