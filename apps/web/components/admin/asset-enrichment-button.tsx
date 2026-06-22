'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type Props = {
  assetId: string;
  className?: string;
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
};

export function AssetEnrichmentButton({
  assetId,
  className,
  fullWidth = false,
  variant = 'secondary',
  label = 'Refresh Source Enrichment'
}: Props) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={className}>
      <Button
        className={fullWidth ? 'w-full' : undefined}
        variant={variant}
        disabled={submitting || isRefreshing}
        onClick={async () => {
          setSubmitting(true);
          setError(null);

          try {
            const response = await fetch(`/api/assets/${assetId}/enrich`, { method: 'POST' });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as {
                error?: string;
              } | null;
              throw new Error(payload?.error ?? 'Failed to refresh source enrichment');
            }

            refresh();
          } catch (caughtError) {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : 'Failed to refresh source enrichment'
            );
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting || isRefreshing ? 'Refreshing...' : label}
      </Button>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
