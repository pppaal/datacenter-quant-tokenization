'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

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
  const router = useRouter();
  const [busy, setBusy] = useState<ReadinessAction | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'danger'; message: string } | null>(null);

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
      router.refresh();
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
          disabled={busy !== null}
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
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
              : 'border-rose-500/20 bg-rose-500/10 text-rose-100'
          ].join(' ')}
          data-testid="readiness-feedback"
          role={feedback.tone === 'good' ? 'status' : 'alert'}
        >
          {feedback.message}
        </div>
      ) : null}
      <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-slate-400 md:col-span-3">
        Readiness remains registry-only. Valuations, files, and extracted text stay offchain while the workflow
        stages a deterministic packet fingerprint and anchors document integrity hashes onchain.
      </div>
    </div>
  );
}
