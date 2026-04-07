'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type OpsWorkItemReplayButtonProps = {
  workItemId: string;
};

export function OpsWorkItemReplayButton({ workItemId }: OpsWorkItemReplayButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function replay() {
    setSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/ops-work-items/${workItemId}/replay`, {
        method: 'POST'
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; workItem?: { status?: string } } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to requeue ops work item.');
      }

      setFeedback(`Work item requeued as ${payload?.workItem?.status?.toLowerCase() ?? 'queued'}.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to requeue ops work item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3" data-testid="ops-work-item-replay">
      <Button type="button" variant="secondary" onClick={replay} disabled={submitting} data-testid="ops-work-item-replay-button">
        {submitting ? 'Requeuing...' : 'Requeue Work Item'}
      </Button>
      {feedback ? (
        <div className="text-sm text-emerald-300" data-testid="ops-work-item-replay-feedback" role="status">
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-rose-300" data-testid="ops-work-item-replay-feedback" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
