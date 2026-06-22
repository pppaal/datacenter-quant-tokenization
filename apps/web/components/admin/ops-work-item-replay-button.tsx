'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type OpsWorkItemReplayButtonProps = {
  workItemId: string;
};

export function OpsWorkItemReplayButton({ workItemId }: OpsWorkItemReplayButtonProps) {
  const { isRefreshing, refresh } = useRouterRefresh();
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
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        workItem?: { status?: string };
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to requeue ops work item.');
      }

      setFeedback(`Work item requeued as ${payload?.workItem?.status?.toLowerCase() ?? 'queued'}.`);
      refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to requeue ops work item.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3" data-testid="ops-work-item-replay">
      <Button
        type="button"
        variant="secondary"
        onClick={replay}
        disabled={submitting || isRefreshing}
        data-testid="ops-work-item-replay-button"
      >
        {submitting || isRefreshing ? 'Requeuing...' : 'Requeue Work Item'}
      </Button>
      {feedback ? (
        <div
          className="text-sm text-[hsl(var(--success))]"
          data-testid="ops-work-item-replay-feedback"
          role="status"
        >
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div
          className="text-sm text-[hsl(var(--danger))]"
          data-testid="ops-work-item-replay-feedback"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
