'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

export function ResearchRefreshButton() {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="secondary"
        disabled={submitting || isRefreshing}
        onClick={async () => {
          setSubmitting(true);
          setError(null);

          try {
            const response = await fetch('/api/research/refresh', {
              method: 'POST'
            });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as {
                error?: string;
              } | null;
              throw new Error(payload?.error ?? 'Failed to refresh research workspace');
            }

            refresh();
          } catch (caughtError) {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : 'Failed to refresh research workspace'
            );
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {submitting || isRefreshing ? 'Refreshing Research...' : 'Run Research Sync'}
      </Button>
      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
