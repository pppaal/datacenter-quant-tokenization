'use client';

import { useState } from 'react';
import { ReviewStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ReviewableRecordType } from '@/lib/services/review';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

function toneForStatus(status: ReviewStatus) {
  switch (status) {
    case ReviewStatus.APPROVED:
      return 'text-[hsl(var(--success))]';
    case ReviewStatus.REJECTED:
      return 'text-[hsl(var(--danger))]';
    default:
      return 'text-[hsl(var(--warning))]';
  }
}

export function ReviewActionForm({
  recordType,
  recordId,
  currentStatus,
  currentNotes
}: {
  recordType: ReviewableRecordType;
  recordId: string;
  currentStatus: ReviewStatus;
  currentNotes?: string | null;
}) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [reviewNotes, setReviewNotes] = useState(currentNotes ?? '');
  const [submitting, setSubmitting] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(decision: 'APPROVE' | 'REJECT') {
    setSubmitting(decision);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recordType,
          recordId,
          decision,
          reviewNotes
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to review evidence.');
      }

      refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to review evidence.');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div
      className="space-y-3 rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
      data-testid="review-action-form"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="fine-print">Review Decision</div>
        <div
          className={`text-sm font-medium ${toneForStatus(currentStatus)}`}
          data-testid="review-status"
        >
          {currentStatus}
        </div>
      </div>
      <Textarea
        className="min-h-[88px]"
        placeholder="Reviewer note for committee support, follow-up diligence, or rejection rationale."
        value={reviewNotes}
        onChange={(event) => setReviewNotes(event.target.value)}
        data-testid="review-notes"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-md text-xs leading-6 text-[hsl(var(--muted))]">
          Approval refreshes the approved feature layer and downstream valuation, report, and
          readiness inputs for this asset.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={submitting !== null || isRefreshing}
            onClick={() => submit('REJECT')}
            data-testid="review-reject"
          >
            {submitting === 'REJECT' ? 'Rejecting...' : 'Reject Evidence'}
          </Button>
          <Button
            type="button"
            disabled={submitting !== null || isRefreshing}
            onClick={() => submit('APPROVE')}
            data-testid="review-approve"
          >
            {submitting === 'APPROVE' ? 'Approving...' : 'Approve Evidence'}
          </Button>
        </div>
      </div>
      {errorMessage ? (
        <div
          className="text-sm text-[hsl(var(--danger))]"
          data-testid="review-feedback"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
