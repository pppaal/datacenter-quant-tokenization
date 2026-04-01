import { NextResponse } from 'next/server';
import { ReviewStatus } from '@prisma/client';
import { getAdminActorFromHeaders } from '@/lib/security/admin-request';
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
      actorIdentifier: actor?.identifier ?? null
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to review record.' },
      { status: 400 }
    );
  }
}
