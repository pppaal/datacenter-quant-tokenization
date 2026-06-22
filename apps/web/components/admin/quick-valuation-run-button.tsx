'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type Props = {
  assetId: string;
  assetCode?: string | null;
  className?: string;
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
};

export function QuickValuationRunButton({
  assetId,
  assetCode,
  className,
  fullWidth = false,
  variant = 'primary',
  label = 'Re-run Analysis'
}: Props) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <div className={className}>
      <Button
        className={fullWidth ? 'w-full' : undefined}
        variant={variant}
        disabled={submitting || isRefreshing}
        onClick={async () => {
          setSubmitting(true);
          setError(null);
          setSuccess(null);

          try {
            const response = await fetch('/api/valuations', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                assetId,
                runLabel: `Re-run ${assetCode ?? assetId}`
              })
            });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as {
                error?: string;
              } | null;
              throw new Error(payload?.error ?? 'Failed to run analysis');
            }

            setSuccess(`Valuation run queued for ${assetCode ?? assetId}.`);
            refresh();
          } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : 'Failed to run analysis');
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting || isRefreshing ? 'Running...' : label}
      </Button>
      {success ? (
        <p
          className="mt-2 text-sm text-[hsl(var(--success))]"
          data-testid="quick-valuation-feedback"
        >
          {success}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-[hsl(var(--danger))]">{error}</p> : null}
    </div>
  );
}
