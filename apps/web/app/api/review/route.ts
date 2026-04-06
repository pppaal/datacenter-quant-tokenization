import { NextResponse } from 'next/server';
import { ReviewStatus } from '@prisma/client';
import { getAdminActorFromHeaders } from '@/lib/security/admin-request';
import { recordAuditEvent } from '@/lib/services/audit';
import { reviewUnderwritingRecord, type ReviewableRecordType } from '@/lib/services/review';

type ReviewPayload = {
  recordType: ReviewableRecordType;
  recordId: string;
  decision: 'APPROVE' | 'REJECT';
  reviewNotes?: string | null;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ReviewPayload;
    const actor = getAdminActorFromHeaders(request.headers);

    if (!payload.recordType || !payload.recordId || !payload.decision) {
      return NextResponse.json({ error: 'recordType, recordId, and decision are required.' }, { status: 400 });
    }

    const result = await reviewUnderwritingRecord({
      recordType: payload.recordType,
      recordId: payload.recordId,
      reviewStatus: payload.decision === 'APPROVE' ? ReviewStatus.APPROVED : ReviewStatus.REJECTED,
      reviewNotes: payload.reviewNotes,
      actor
    });

    await recordAuditEvent({
      actorIdentifier: actor?.identifier ?? null,
      actorRole: actor?.role ?? null,
      action: payload.decision === 'APPROVE' ? 'review.approve' : 'review.reject',
      entityType: payload.recordType,
      entityId: payload.recordId,
      assetId: (result as { assetId?: string | null })?.assetId ?? null,
      requestPath: '/api/review',
      requestMethod: 'POST',
      statusLabel: 'SUCCESS',
      metadata: {
        decision: payload.decision,
        reviewNotes: payload.reviewNotes?.trim() || null
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    await recordAuditEvent({
      action: 'review.error',
      entityType: 'review',
      requestPath: '/api/review',
      requestMethod: 'POST',
      statusLabel: 'FAILED',
      metadata: {
        error: error instanceof Error ? error.message : 'Failed to review record.'
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to review record.' },
      { status: 400 }
    );
  }
}
