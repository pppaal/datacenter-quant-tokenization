'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type ReadinessAction = 'stage' | 'register' | 'anchor';

const actionCopy: Record<
  ReadinessAction,
  {
    label: string;
    runningLabel: string;
    successLabel: string;
  }
> = {
  stage: {
    label: 'Stage Latest Evidence',
    runningLabel: 'Staging...',
    successLabel: 'Review packet staged.'
  },
  register: {
    label: 'Register Review Package',
    runningLabel: 'Registering...',
    successLabel: 'Review package registered.'
  },
  anchor: {
    label: 'Anchor Evidence Hash',
    runningLabel: 'Anchoring...',
    successLabel: 'Latest evidence hash anchored.'
  }
};

export function ReadinessActionPanel({ assetId }: { assetId: string }) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [busy, setBusy] = useState<ReadinessAction | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'danger'; message: string } | null>(
    null
  );

  async function run(action: ReadinessAction) {
    setBusy(action);
    setFeedback(null);

    try {
      const response = await fetch(`/api/readiness/assets/${assetId}/${action}`, {
        method: 'POST'
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Failed to ${action} readiness package.`);
      }

      setFeedback({
        tone: 'good',
        message: actionCopy[action].successLabel
      });
      refresh();
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: error instanceof Error ? error.message : `Failed to ${action} readiness package.`
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-3" data-testid="readiness-actions">
      {(['stage', 'register', 'anchor'] as const).map((action) => (
        <Button
          key={action}
          className={action === 'register' ? 'w-full' : 'w-full'}
          variant={action === 'register' ? 'primary' : 'secondary'}
          onClick={() => {
            void run(action);
          }}
          disabled={busy !== null || isRefreshing}
          data-testid={`readiness-${action}`}
        >
          {busy === action ? actionCopy[action].runningLabel : actionCopy[action].label}
        </Button>
      ))}
      {feedback ? (
        <div
          className={[
            'rounded-[22px] border p-4 text-sm leading-7 md:col-span-3',
            feedback.tone === 'good'
              ? 'border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]'
              : 'border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))] text-[hsl(var(--danger))]'
          ].join(' ')}
          data-testid="readiness-feedback"
          role={feedback.tone === 'good' ? 'status' : 'alert'}
        >
          {feedback.message}
        </div>
      ) : null}
      <div className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4 text-sm leading-7 text-[hsl(var(--muted))] md:col-span-3">
        Readiness remains registry-only. Valuations, files, and extracted text stay offchain while
        the workflow stages a deterministic packet fingerprint and anchors document integrity hashes
        onchain.
      </div>
    </div>
  );
}
