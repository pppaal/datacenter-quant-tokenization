'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type OpsAlertReplayButtonProps = {
  deliveryId: string;
};

export function OpsAlertReplayButton({ deliveryId }: OpsAlertReplayButtonProps) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function replay() {
    setSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/ops-alert-deliveries/${deliveryId}/replay`, {
        method: 'POST'
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        delivery?: { statusLabel?: string };
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to replay alert delivery.');
      }

      setFeedback(
        `Replay recorded as ${payload?.delivery?.statusLabel?.toLowerCase() ?? 'delivered'}.`
      );
      refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to replay alert delivery.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3" data-testid="ops-alert-replay">
      <Button
        type="button"
        variant="secondary"
        onClick={replay}
        disabled={submitting || isRefreshing}
        data-testid="ops-alert-replay-button"
      >
        {submitting || isRefreshing ? 'Replaying...' : 'Replay Alert'}
      </Button>
      {feedback ? (
        <div
          className="text-sm text-[hsl(var(--success))]"
          data-testid="ops-alert-replay-feedback"
          role="status"
        >
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div
          className="text-sm text-[hsl(var(--danger))]"
          data-testid="ops-alert-replay-feedback"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
