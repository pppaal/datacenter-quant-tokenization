'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

export function SourcesRefreshButton() {
  const { isRefreshing: refreshing, refresh } = useRouterRefresh();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch('/api/sources/refresh', {
        method: 'POST'
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Failed to refresh source adapters');
      }

      refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to refresh source adapters'
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleRefresh} disabled={isRefreshing || refreshing}>
        {isRefreshing || refreshing ? 'Refreshing Sources...' : 'Run Source Refresh'}
      </Button>
      {error ? <div className="text-sm text-[hsl(var(--danger))]">{error}</div> : null}
    </div>
  );
}
