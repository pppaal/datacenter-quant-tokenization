import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { OpenAIConfigurationError, summarizeResearchSnapshot } from '@/lib/services/ai-assistant';

const ResearchSummarySchema = z.object({
  snapshotId: z.string().trim().min(1)
});

export const POST = withAdminApi({
  requiredRole: 'ANALYST',
  bodySchema: ResearchSummarySchema,
  auditAction: 'ai.research.summarize',
  auditEntityType: 'ResearchSnapshot',
  auditEntityIdFromBody: (body) => body.snapshotId,
  async handler({ body, requestId }) {
    try {
      const result = await summarizeResearchSnapshot(body.snapshotId, prisma);
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
