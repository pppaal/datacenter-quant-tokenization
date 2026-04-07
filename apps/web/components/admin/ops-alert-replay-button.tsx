'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type OpsAlertReplayButtonProps = {
  deliveryId: string;
};

export function OpsAlertReplayButton({ deliveryId }: OpsAlertReplayButtonProps) {
  const router = useRouter();
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
      const payload = (await response.json().catch(() => null)) as { error?: string; delivery?: { statusLabel?: string } } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to replay alert delivery.');
      }

      setFeedback(`Replay recorded as ${payload?.delivery?.statusLabel?.toLowerCase() ?? 'delivered'}.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to replay alert delivery.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3" data-testid="ops-alert-replay">
      <Button type="button" variant="secondary" onClick={replay} disabled={submitting} data-testid="ops-alert-replay-button">
        {submitting ? 'Replaying...' : 'Replay Alert'}
      </Button>
      {feedback ? (
        <div className="text-sm text-emerald-300" data-testid="ops-alert-replay-feedback" role="status">
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-rose-300" data-testid="ops-alert-replay-feedback" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
