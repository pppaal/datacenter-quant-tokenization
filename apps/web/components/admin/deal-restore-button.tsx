'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type Props = {
  dealId: string;
};

export function DealRestoreButton({ dealId }: Props) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={busy || isRefreshing}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const response = await fetch(`/api/deals/${dealId}/restore`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                summary: 'Restored from archived queue.'
              })
            });
            if (!response.ok) {
              throw new Error('Failed to restore deal');
            }
            refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to restore deal.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy || isRefreshing ? 'Restoring...' : 'Restore'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-[hsl(var(--danger))]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
